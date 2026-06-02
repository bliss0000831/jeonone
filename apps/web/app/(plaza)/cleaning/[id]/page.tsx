"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { MessageCircle, Phone, Sparkles } from "lucide-react"
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
import { MapPin } from "lucide-react"
import { usePostChat } from "@/hooks/use-post-chat"
import { BumpQuickMenu } from "@/components/bump-quick-menu"
import { ReportButton } from "@/components/report-button"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

interface CleaningPost {
  id: string
  user_id: string
  title: string
  content: string
  category: string
  images: string[]
  service_region: string
  service_district: string
  service_dong?: string | null
  min_price: number | null
  max_price: number | null
  price_unit: string
  contact_phone: string
  views: number
  likes: number
  status: string
  created_at: string
  profiles?: {
    id: string
    nickname: string
    avatar_url: string | null
  }
}

export default function CleaningDetailPage() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const confirm = useConfirm()
  const [post, setPost] = useState<CleaningPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const { handleChat, chatLoading } = usePostChat({
    postId: typeof id === "string" ? id : undefined,
    postType: "cleaning",
    authorId: post?.user_id ?? post?.profiles?.id ?? null,
    currentUserId: currentUser?.id ?? null,
    loginRedirectPath: typeof id === "string" ? `/cleaning/${id}` : undefined,
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
      let q: any = supabase.from("cleaning_posts").select("*").eq("id", id)
      if (plaza) q = q.eq("plaza_id", plaza)
      const { data } = await q.single()

      if (data) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, nickname, avatar_url")
          .eq("id", data.user_id)
          .single()
        setPost({ ...data, profiles: profileData } as CleaningPost)

        // 조회수 +1 — atomic RPC (race-free)
        void supabase.rpc('increment_view_count', { p_table: 'cleaning_posts', p_id: id, p_column: 'views' })

        if (user) {
          const { data: fav } = await supabase
            .from("cleaning_favorites")
            .select("id")
            .eq("user_id", user.id)
            .eq("post_id", id)
            .single()
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
    const { error } = await supabase.from("cleaning_posts").delete().eq("id", id)
    if (error) {
      toast.error("삭제 실패: " + error.message)
      return
    }
    router.push("/cleaning")
  }

  const handleLike = async () => {
    if (!currentUser) {
      router.push("/auth/login")
      return
    }
    if (likeBusy) return // 더블탭 방지 — 카운트 불일치 방지
    setLikeBusy(true)
    const supabase = createClient()
    const prevLiked = isLiked
    const next = !isLiked
    const base = post?.likes || 0
    const optimistic = Math.max(0, base + (next ? 1 : -1))
    // 낙관적 업데이트 (실패 시 catch 에서 롤백)
    setIsLiked(next)
    setPost((p) => (p ? { ...p, likes: optimistic } : p))
    try {
      if (next) {
        const { error } = await supabase
          .from("cleaning_favorites")
          .insert({ user_id: currentUser.id, post_id: id })
        // 23505 = 이미 좋아요 — 중복 카운트 방지(성공 취급, 카운트 원복)
        if (error && (error as any).code !== "23505") throw error
        if (error) {
          setPost((p) => (p ? { ...p, likes: base } : p))
        } else {
          void supabase.rpc("change_like_count", {
            p_table: "cleaning_posts", p_id: id, p_column: "likes", p_delta: 1,
          }).then(({ error: rpcErr }) => { if (rpcErr) console.error("[cleaning like]", rpcErr) })
        }
      } else {
        const { error } = await supabase
          .from("cleaning_favorites")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("post_id", id)
        if (error) throw error
        void supabase.rpc("change_like_count", {
          p_table: "cleaning_posts", p_id: id, p_column: "likes", p_delta: -1,
        }).then(({ error: rpcErr }) => { if (rpcErr) console.error("[cleaning unlike]", rpcErr) })
      }
    } catch (e) {
      console.error("[cleaning like]", e)
      setIsLiked(prevLiked) // 롤백
      setPost((p) => (p ? { ...p, likes: base } : p))
      toast.error("좋아요 처리에 실패했어요. 다시 시도해주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  const formatPrice = () => {
    if (!post?.min_price && !post?.max_price) return "가격 문의"
    if (post.min_price && post.max_price) {
      return `${post.min_price.toLocaleString()}~${post.max_price.toLocaleString()}${post.price_unit || "만원"}`
    }
    if (post.min_price)
      return `${post.min_price.toLocaleString()}${post.price_unit || "만원"}~`
    return `~${post.max_price?.toLocaleString()}${post.price_unit || "만원"}`
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
        <Sparkles className="w-12 h-12 text-muted-foreground mb-4" />
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
            title: post.title,
            description: post.content?.slice(0, 80),
            imageUrl: post.images?.[0],
          }}
          extra={
            <>
              {!(currentUser && currentUser.id === post.user_id) && !isAdmin && (
                <ReportButton targetType="cleaning" targetId={post.id} variant="icon" />
              )}
              <BumpQuickMenu
                isOwner={!!currentUser && currentUser.id === post.user_id}
                isAdmin={isAdmin}
                targetType="cleaning"
                targetId={post.id}
                editHref={`/cleaning/${post.id}/edit`}
                onDelete={handleDelete}
              />
            </>
          }
        />
      }
      actionBar={
        <>
          {post.contact_phone && (
            <Button asChild variant="outline" size="lg" className="flex-1 gap-2">
              <a href={`tel:${post.contact_phone}`}>
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
        alt={post.title}
        fallbackIcon={Sparkles}
        fallbackLabel={post.category || "청소"}
        topLeftBadges={
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-pink-500 shadow-sm">
            <Sparkles className="w-3 h-3" />
            {post.category || "청소"}
          </span>
        }
      />

      <DetailBody>
        <DetailTitleBlock
          title={post.title}
          price={formatPrice()}
          priceTone="primary"
        />

        <DetailMeta
          location={`${post.service_region} ${post.service_district}`}
          views={post.views}
          likes={post.likes}
        />

        <DetailSection title="서비스 소개">
          <DetailInfoBox>{post.content}</DetailInfoBox>
        </DetailSection>

        {(post.service_region || post.service_district || post.service_dong) && (
          <DetailSection title="사업장 위치">
            <p className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              {[post.service_region, post.service_district, post.service_dong].filter(Boolean).join(" ")}
            </p>
            <AddressMapPreview address={String([post.service_region, post.service_district, post.service_dong].filter(Boolean).join(" ") || "")} height={220} />
          </DetailSection>
        )}

        <DetailSection title="업체 정보">
          <DetailAuthorCard
            href={`/profile/${post.profiles?.id || post.user_id}`}
            name={post.profiles?.nickname || "청소 전문가"}
            avatarUrl={post.profiles?.avatar_url}
            badges={
              <span className="inline-flex items-center gap-1 text-xs font-medium text-pink-700 bg-pink-50 dark:bg-pink-950/40 dark:text-pink-400 px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3" />
                청소
              </span>
            }
            userId={post.user_id}
            otherPostsTable="cleaning_posts"
            otherPostsLinkPrefix="/cleaning"
            otherPostsTitle="이 업체의 다른 서비스"
            excludeId={post.id}
          />
        </DetailSection>
      </DetailBody>
    </DetailShell>
  )
}
