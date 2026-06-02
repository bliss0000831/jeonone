"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { MessageCircle, Phone, Store, Calendar, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DetailShell,
  DetailGallery,
  DetailBody,
  DetailSection,
  DetailInfoBox,
  DetailAuthorCard,
  DetailMeta,
  DetailTitleBlock,
  DetailHeaderActions,
} from "@/components/detail"
import { AddressMapPreview } from "@/components/address-map-preview"
import { usePostChat } from "@/hooks/use-post-chat"
// 노출부스트 기능 일시 비활성화 — 프리미엄 패키지로 추후 재도입
// import { BoostButton } from "@/components/billing/boost-button"
import { BumpQuickMenu } from "@/components/bump-quick-menu"
import { ReportButton } from "@/components/report-button"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

interface NewStorePost {
  id: string
  user_id: string
  store_name: string
  description: string
  category: string
  images: string[]
  address: string
  phone: string
  opening_date: string
  opening_event: string
  views: number
  likes: number
  created_at: string
  profiles?: {
    id: string
    nickname: string
    avatar_url: string | null
  }
}

export default function NewStoreDetailPage() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const confirm = useConfirm()
  const [post, setPost] = useState<NewStorePost | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const { handleChat, chatLoading } = usePostChat({
    postId: typeof id === "string" ? id : undefined,
    postType: "new_store",
    authorId: post?.user_id ?? post?.profiles?.id ?? null,
    currentUserId: currentUser?.id ?? null,
    loginRedirectPath: typeof id === "string" ? `/new-store/${id}` : undefined,
  })

  useEffect(() => {
    const fetchPost = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setCurrentUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()
        if (profile?.role === "admin" || profile?.role === "superadmin") {
          setIsAdmin(true)
        }
      }

      const plaza = getCurrentPlazaClient()
      let q: any = supabase.from("new_store_posts").select("*").eq("id", id)
      if (plaza) q = q.eq("plaza_id", plaza)
      const { data } = await q.maybeSingle()

      if (data) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, nickname, avatar_url")
          .eq("id", data.user_id)
          .maybeSingle()
        setPost({ ...data, profiles: profileData } as NewStorePost)

        // 조회수 +1 — atomic RPC (race-free)
        void supabase.rpc('increment_view_count', { p_table: 'new_store_posts', p_id: id, p_column: 'views' })

        if (user) {
          // 카드와 동일 테이블(new_store_likes) 사용 — 상태/카운트 일원화
          let favQ: any = (supabase as any)
            .from("new_store_likes")
            .select("user_id")
            .eq("user_id", user.id)
            .eq("post_id", id)
          if (plaza) favQ = favQ.eq("plaza_id", plaza)
          const { data: fav } = await favQ.maybeSingle()
          setIsLiked(!!fav)
        }
      }
      setLoading(false)
    }
    fetchPost()
  }, [id])

  const handleDelete = async () => {
    if (!(await confirm({ description: "정말로 삭제하시겠습니까?", destructive: true }))) return
    const supabase = createClient()
    const { error } = await supabase.from("new_store_posts").delete().eq("id", id)
    if (error) {
      toast.error("삭제 실패: " + error.message)
      return
    }
    router.push("/new-store")
  }

  const [likeBusy, setLikeBusy] = useState(false)
  const handleLike = async () => {
    if (!currentUser) {
      router.push("/auth/login")
      return
    }
    if (likeBusy) return // 더블탭 방지 — 카운트 불일치 방지
    setLikeBusy(true)
    const prev = isLiked
    const next = !isLiked
    const base = post?.likes || 0
    setIsLiked(next) // 낙관적 업데이트
    setPost((p) => (p ? { ...p, likes: Math.max(0, base + (next ? 1 : -1)) } : p))
    try {
      const supabase = createClient()
      const plaza = getCurrentPlazaClient()
      if (next) {
        const insertRow: Record<string, any> = { user_id: currentUser.id, post_id: id }
        if (plaza) insertRow.plaza_id = plaza
        const { error: insErr } = await (supabase as any)
          .from("new_store_likes")
          .insert(insertRow)
        if (insErr && insErr.code !== "23505") throw insErr
        if (insErr) {
          // 이미 좋아요(중복) — 실제 변동 없음, 카운트 원복
          setPost((p) => (p ? { ...p, likes: base } : p))
        } else {
          // 원자적 카운트 동기화 (카드와 동일 RPC)
          void supabase.rpc("change_like_count", {
            p_table: "new_store_posts", p_id: id, p_column: "likes", p_delta: 1,
          }).then(({ error: rpcErr }) => { if (rpcErr) console.error("[new-store like]", rpcErr) })
        }
      } else {
        let delQ: any = (supabase as any)
          .from("new_store_likes")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("post_id", id)
        if (plaza) delQ = delQ.eq("plaza_id", plaza)
        const { error: delErr } = await delQ
        if (delErr) throw delErr
        void supabase.rpc("change_like_count", {
          p_table: "new_store_posts", p_id: id, p_column: "likes", p_delta: -1,
        }).then(({ error: rpcErr }) => { if (rpcErr) console.error("[new-store unlike]", rpcErr) })
      }
    } catch (e) {
      console.error("[new-store like]", e)
      setIsLiked(prev) // 롤백
      setPost((p) => (p ? { ...p, likes: base } : p))
      toast.error("좋아요 처리에 실패했어요. 다시 시도해주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ""
    const date = new Date(dateStr)
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Store className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">게시글을 찾을 수 없습니다</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            돌아가기
          </Button>
          <Button asChild>
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <DetailShell
      user={currentUser}
      rightActions={
        <DetailHeaderActions
          isLiked={isLiked}
          onLike={handleLike}
          shareMeta={{
            title: post.store_name,
            description:
              post.opening_event?.slice(0, 80) ||
              post.description?.slice(0, 80),
            imageUrl: post.images?.[0],
          }}
          extra={
            <>
              {!(currentUser && currentUser.id === post.user_id) && !isAdmin && (
                <ReportButton targetType="new-store" targetId={post.id} variant="icon" />
              )}
              <BumpQuickMenu
                isOwner={!!currentUser && currentUser.id === post.user_id}
                isAdmin={isAdmin}
                targetType="new_store"
                targetId={post.id}
                editHref={`/new-store/${post.id}/edit`}
                onDelete={handleDelete}
              />
            </>
          }
        />
      }
      actionBar={
        <>
          {post.phone && (
            <Button asChild variant="outline" size="lg" className="flex-1 gap-2">
              <a href={`tel:${post.phone}`}>
                <Phone className="w-5 h-5" />
                전화하기
              </a>
            </Button>
          )}
          <Button
            size="lg"
            onClick={handleChat}
            disabled={chatLoading}
            className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <MessageCircle className="w-5 h-5" />
            {chatLoading ? "연결 중..." : "채팅하기"}
          </Button>
        </>
      }
    >
      <DetailGallery
        images={post.images}
        alt={post.store_name}
        fallbackIcon={Store}
        fallbackLabel={post.category || "신장개업"}
        topLeftBadges={
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-blue-500 shadow-sm">
            <Store className="w-3 h-3" />
            {post.category || "신장개업"}
          </span>
        }
      />

      <DetailBody>
        <DetailTitleBlock title={post.store_name} />

        <DetailMeta
          views={post.views}
          likes={post.likes}
          extra={
            post.opening_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                오픈 {formatDate(post.opening_date)}
              </span>
            )
          }
        />

        {post.opening_event && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
            <h3 className="font-semibold text-primary mb-1 flex items-center gap-2">
              <Store className="w-4 h-4" />
              오픈 이벤트
            </h3>
            <p className="text-foreground whitespace-pre-wrap">
              {post.opening_event}
            </p>
          </div>
        )}

        <DetailSection title="가게 소개">
          <DetailInfoBox>{post.description}</DetailInfoBox>
        </DetailSection>

        {post && (
          <DetailSection title="매장 위치">
            <p className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              {post.address}
            </p>
            <AddressMapPreview address={String(post.address || "")} height={220} />
          </DetailSection>
        )}

        <DetailSection title="사장님 정보">
          <DetailAuthorCard
            href={`/profile/${post.profiles?.id || post.user_id}`}
            name={post.profiles?.nickname || "사장님"}
            avatarUrl={post.profiles?.avatar_url}
            badges={
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded-full">
                <Store className="w-3 h-3" />
                신장개업
              </span>
            }
            userId={post.user_id}
            otherPostsTable="new_store_posts"
            otherPostsLinkPrefix="/new-store"
            otherPostsTitle="이 사장님의 다른 소식"
            excludeId={post.id}
          />
        </DetailSection>
      </DetailBody>
      {/* 노출부스트 일시 비활성화 — 추후 프리미엄 패키지로 재도입 */}
    </DetailShell>
  )
}
