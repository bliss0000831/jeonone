"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import {
  ShoppingBag,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle,
  Info,
  MessageCircle,
  Loader2,
} from "lucide-react"
import { usePostChat } from "@/hooks/use-post-chat"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  CallButton,
} from "@/components/detail"
import { AddressMapPreview } from "@/components/address-map-preview"
import { MapPin } from "lucide-react"
import { ReportButton } from "@/components/report-button"
import { formatPrice } from "@/components/secondhand-card"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

interface SecondhandPost {
  id: string
  user_id: string
  title: string
  description: string
  category: string
  price: number
  is_price_negotiable: boolean
  images: string[]
  status: string
  location: string
  views: number
  likes: number
  created_at: string
  condition?: string | null
  brand?: string | null
  model_name?: string | null
  model_year?: number | null
  usage_hours?: number | null
  horsepower?: number | null
  profiles?: {
    id: string
    nickname: string
    avatar_url: string | null
  }
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: { label: "판매중", className: "bg-amber-500 text-white" },
  reserved: { label: "예약중", className: "bg-yellow-500 text-white" },
  completed: { label: "판매완료", className: "bg-gray-500 text-white" },
}

export default function SecondhandDetailPage() {
  const params = useParams()
  const router = useRouter()
  const confirm = useConfirm()
  const postId = typeof params.id === "string" ? params.id : (params.id as string[])?.[0]
  const [post, setPost] = useState<SecondhandPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [postStatus, setPostStatus] = useState<string>("active")
  const [isAdmin, setIsAdmin] = useState(false)

  // 채팅하기 — 훅은 조건부 return 위에서 호출해야 Rules of Hooks 위반이 안 남
  const { handleChat, chatLoading } = usePostChat({
    postId,
    postType: "secondhand",
    authorId: post?.user_id,
    currentUserId: currentUser?.id,
    loginRedirectPath: `/secondhand/${postId}`,
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
      let q: any = supabase.from("secondhand_posts").select("*").eq("id", postId)
      if (plaza) q = q.eq("plaza_id", plaza)
      const { data } = await q.single()

      if (data) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, nickname, avatar_url")
          .eq("id", data.user_id)
          .single()
        setPost({ ...data, profiles: profileData } as SecondhandPost)
        setPostStatus(data.status || "active")

        // 조회수 +1 — atomic RPC (race-free)
        void supabase.rpc('increment_view_count', { p_table: 'secondhand_posts', p_id: postId, p_column: 'views' }).then(({ error }) => { if (error) console.error('[secondhand views]', error) })

        if (user) {
          const { data: fav } = await supabase
            .from("secondhand_likes")
            .select("user_id")
            .eq("user_id", user.id)
            .eq("post_id", postId)
            .maybeSingle()
          setIsLiked(!!fav)
        }
      }
      setLoading(false)
    }
    if (postId) fetchPost()
  }, [postId])

  const handleLike = async () => {
    if (!currentUser) {
      router.push("/auth/login")
      return
    }
    if (likeBusy) return // 더블탭 방지 — 카운트 불일치 방지
    setLikeBusy(true)
    const supabase = createClient()
    const prev = isLiked
    const next = !isLiked
    // 낙관적 업데이트 — 실패 시 아래 catch 에서 롤백
    setIsLiked(next)
    try {
      if (next) {
        const { error } = await supabase
          .from("secondhand_likes")
          .insert({ user_id: currentUser.id, post_id: postId })
        // 23505 = unique_violation — 이미 좋아요한 경우 중복 increment 방지 (성공 취급)
        if (error && error.code !== "23505") throw error
        if (!error) {
          void supabase.rpc("change_like_count", {
            p_table: "secondhand_posts",
            p_id: postId,
            p_column: "likes",
            p_delta: 1,
          }).then(({ error }) => { if (error) console.error('[secondhand like]', error) })
        }
      } else {
        const { error } = await supabase
          .from("secondhand_likes")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("post_id", postId)
        if (error) throw error
        void supabase.rpc("change_like_count", {
          p_table: "secondhand_posts",
          p_id: postId,
          p_column: "likes",
          p_delta: -1,
        }).then(({ error }) => { if (error) console.error('[secondhand unlike]', error) })
      }
    } catch (e) {
      console.error('[secondhand like]', e)
      setIsLiked(prev) // 롤백 — DB 반영 실패 시 UI 원복
      toast.error("좋아요 처리에 실패했어요. 다시 시도해주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  const handleStatusChange = async (next: "active" | "reserved" | "completed") => {
    if (actionBusy) return // 중복 요청 방지 — 마지막 응답이 의도와 어긋나는 것 방지
    setActionBusy(true)
    try {
      const res = await fetch(`/api/secondhand/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) {
        setPostStatus(next)
        const label = next === "reserved" ? "예약중" : next === "completed" ? "판매완료" : "판매중"
        toast.success(`'${label}'(으)로 변경되었습니다`)
      } else {
        toast.error("상태 변경 실패")
      }
    } catch {
      toast.error("상태 변경 실패")
    } finally {
      setActionBusy(false)
    }
  }

  const handleEdit = () => router.push(`/secondhand/${postId}/edit`)

  const handleDelete = async () => {
    if (actionBusy) return
    if (!(await confirm({ description: "정말로 삭제하시겠습니까?", destructive: true }))) return
    setActionBusy(true)
    try {
      const res = await fetch(`/api/secondhand/${postId}`, { method: "DELETE" })
      if (res.ok) router.push("/secondhand")
      else { toast.error("삭제 실패"); setActionBusy(false) }
    } catch {
      toast.error("삭제 실패")
      setActionBusy(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (days === 0) return "오늘"
    if (days === 1) return "어제"
    if (days < 7) return `${days}일 전`
    return date.toLocaleDateString("ko-KR")
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <ShoppingBag className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">게시글을 찾을 수 없습니다</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          돌아가기
        </Button>
      </div>
    )
  }

  const status = STATUS_BADGES[postStatus] || STATUS_BADGES.active
  const isOwner = currentUser && post.user_id === currentUser.id
  const isCompleted = postStatus === "completed"

  return (
    <DetailShell
      user={currentUser}
      rightActions={
        <DetailHeaderActions
          isLiked={isLiked}
          onLike={handleLike}
          shareMeta={{
            title: post.title,
            description: post.description?.slice(0, 80),
            imageUrl: post.images?.[0],
          }}
          extra={
            <>
              {!isOwner && !isAdmin && (
                <ReportButton targetType="secondhand" targetId={post.id} variant="icon" />
              )}
              {(isOwner || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 hover:bg-secondary rounded-full transition-colors">
                      <MoreVertical className="w-5 h-5 text-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && (
                      <>
                        {postStatus === "active" && (
                          <DropdownMenuItem onClick={() => handleStatusChange("reserved")}>
                            <CheckCircle className="w-4 h-4 mr-2 text-yellow-500" />
                            예약중으로 변경
                          </DropdownMenuItem>
                        )}
                        {!isCompleted && (
                          <>
                            <DropdownMenuItem onClick={() => handleStatusChange("completed")}>
                              <CheckCircle className="w-4 h-4 mr-2 text-muted-foreground" />
                              판매완료
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {isCompleted && (
                          <>
                            <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                              <CheckCircle className="w-4 h-4 mr-2 text-amber-500" />
                              판매중으로 변경
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                      </>
                    )}
                    <DropdownMenuItem onClick={handleEdit}>
                      <Pencil className="w-4 h-4 mr-2" />
                      수정하기
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      삭제하기
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          }
        />
      }
      actionBar={
        isCompleted ? (
          <Button
            disabled
            size="lg"
            className="flex-1 bg-muted text-muted-foreground cursor-not-allowed"
          >
            판매완료
          </Button>
        ) : isOwner ? (
          <Button
            disabled
            size="lg"
            variant="outline"
            className="flex-1 gap-2"
          >
            <ShoppingBag className="w-5 h-5" />
            내가 등록한 매물
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              onClick={handleChat}
              disabled={chatLoading}
              className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {chatLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <MessageCircle className="w-5 h-5" />
              )}
              {chatLoading ? "연결 중..." : "채팅으로 문의"}
            </Button>
            {/* 보조: 전화 걸기 — 판매자 phone 있을 때만 노출 */}
            <CallButton userId={post.user_id} className="border-amber-500 text-amber-700" />
          </>
        )
      }
    >
      <DetailGallery
        images={post.images}
        alt={post.title}
        fallbackIcon={ShoppingBag}
        fallbackLabel="중고거래"
        topLeftBadges={
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium shadow-sm ${status.className}`}
          >
            <ShoppingBag className="w-3 h-3" />
            {status.label}
          </span>
        }
      />

      <DetailBody>
        <DetailTitleBlock title={post.title} />

        {/* 가격 블록 (당근마켓 스타일) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl font-bold text-foreground">{formatPrice(post.price)}</span>
          {post.is_price_negotiable && post.price > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400">
              가격제안 환영
            </span>
          )}
          {post.price === 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-700 dark:text-green-400">
              무료나눔
            </span>
          )}
        </div>

        <DetailMeta
          views={post.views}
          likes={post.likes}
          timeAgo={formatDate((post as any).bumped_at ?? post.created_at)}
        />

        {(() => {
          const specs = [
            ["카테고리", post.category],
            ["제조사", post.brand],
            ["모델", post.model_name],
            ["연식", post.model_year ? `${post.model_year}년식` : null],
            ["마력", post.horsepower ? `${post.horsepower}마력` : null],
            ["사용시간", post.usage_hours ? `${post.usage_hours.toLocaleString()}h` : null],
            ["상태", post.condition],
          ].filter(([, v]) => v) as [string, string][]
          if (specs.length === 0) return null
          return (
            <DetailSection title="농기구 정보">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-4">
                {specs.map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{k}</span>
                    <span className="text-sm font-semibold text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )
        })()}

        <DetailSection title="상품 설명">
          <DetailInfoBox>{post.description}</DetailInfoBox>
        </DetailSection>

        <DetailSection title="판매자 정보">
          <DetailAuthorCard
            href={`/profile/${post.profiles?.id || post.user_id}`}
            name={post.profiles?.nickname || "익명"}
            avatarUrl={post.profiles?.avatar_url}
            badges={
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
                <ShoppingBag className="w-3 h-3" />
                판매자
              </span>
            }
            userId={post.user_id}
            otherPostsTable="secondhand_posts"
            otherPostsLinkPrefix="/secondhand"
            otherPostsTitle="이 판매자의 다른 매물"
            excludeId={post.id}
          />
        </DetailSection>

        {/* 거래 희망장소 — 주소 + 지도 (안전 거래 안내 자리 대체) */}
        {post.location && (
          <DetailSection title="거래 희망장소">
            <p className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              {post.location}
            </p>
            <AddressMapPreview address={post.location} height={220} />
          </DetailSection>
        )}
        {!isOwner && (
          <div className="flex justify-end">
            <ReportButton targetType="secondhand" targetId={post.id} />
          </div>
        )}
      </DetailBody>
    </DetailShell>
  )
}
