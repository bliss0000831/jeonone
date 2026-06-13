"use client"

import { useState, useEffect, use } from "react"
import { timeAgoKo } from "@/components/listing/time-ago"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { MessageCircle, Leaf, ShoppingBag, MoreVertical, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  DetailShell,
  DetailGallery,
  DetailBody,
  DetailSection,
  DetailInfoBox,
  DetailAuthorCard,
  DetailMeta,
  DetailHeaderActions,
  CallButton,
} from "@/components/detail"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ReportButton } from "@/components/report-button"
import { usePostChat } from "@/hooks/use-post-chat"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

interface LocalFoodDetail {
  id: string
  title: string
  description?: string
  content?: string
  price: number
  original_price?: number
  unit: string
  category: string
  images: string[]
  location?: string
  farm_name?: string
  shipping_fee?: number
  free_shipping?: boolean
  district?: string
  user_id: string
  status: string
  view_count: number
  like_count: number
  created_at: string
  author?: {
    id: string
    nickname?: string
    avatar_url?: string
    account_type?: string
  }
  user_liked?: boolean
}

export default function LocalFoodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const confirm = useConfirm()
  const [post, setPost] = useState<LocalFoodDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const { handleChat, chatLoading } = usePostChat({
    postId: id,
    postType: "local_food",
    authorId: post?.user_id ?? post?.author?.id ?? null,
    currentUserId: user?.id ?? null,
    loginRedirectPath: `/local-food/${id}`,
  })

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)

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

      try {
        const response = await fetch(`/api/local-food/${id}`, { cache: "no-store" })
        const data = await response.json()
        if (!response.ok) {
          console.error("[local-food detail] API 오류", response.status, data)
        }
        if (data.post) {
          setPost(data.post)
          setIsLiked(data.post.user_liked || false)
          setLikeCount(data.post.like_count || 0)
        }
      } catch (err) {
        console.error("[local-food detail] fetch 예외", err)
      }
      setIsLoading(false)
    }
    fetchData()
  }, [id])

  const handleDelete = async () => {
    if (!(await confirm({ description: "정말로 삭제하시겠습니까?", destructive: true }))) return
    const res = await fetch(`/api/local-food/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error("삭제 실패: " + (data.error || res.statusText))
      return
    }
    router.push("/local-food")
  }

  const handleLike = async () => {
    if (!user) {
      toast("로그인이 필요합니다")
      return
    }
    if (likeBusy) return
    setLikeBusy(true)
    const prevLiked = isLiked
    const prevCount = likeCount
    // 낙관적 UI 업데이트
    setIsLiked(!prevLiked)
    setLikeCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1)
    try {
      const supabase = createClient()
      if (prevLiked) {
        const { error } = await supabase
          .from("local_food_likes")
          .delete()
          .eq("user_id", user.id)
          .eq("local_food_id", id)
        if (error) throw error
        void supabase.rpc("change_like_count", {
          p_table: "local_food",
          p_id: id,
          p_column: "like_count",
          p_delta: -1,
        })
      } else {
        const { error } = await supabase
          .from("local_food_likes")
          .insert({ user_id: user.id, local_food_id: id })
        if (error) throw error
        void supabase.rpc("change_like_count", {
          p_table: "local_food",
          p_id: id,
          p_column: "like_count",
          p_delta: 1,
        })
      }
    } catch {
      // 롤백
      setIsLiked(prevLiked)
      setLikeCount(prevCount)
      toast.error("좋아요 처리에 실패했습니다")
    } finally {
      setLikeBusy(false)
    }
  }

  // 날짜 표기 — 카드와 동일한 상대시간(timeAgoKo)으로 통일
  const formatDate = (dateString: string) => timeAgoKo(dateString)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Leaf className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">게시글을 찾을 수 없습니다</p>
        <Link href="/local-food" className="mt-4 text-primary hover:underline">
          목록으로 돌아가기
        </Link>
      </div>
    )
  }

  // price/original_price 가 null 로 저장된 레거시 글에도 상세 페이지가 크래시하지 않게 안전 가드
  const safePrice = typeof post.price === "number" ? post.price : Number(post.price) || 0
  const safeOriginal =
    typeof post.original_price === "number"
      ? post.original_price
      : post.original_price != null
      ? Number(post.original_price) || 0
      : 0
  const discountPercent =
    safeOriginal && safeOriginal > safePrice
      ? Math.round((1 - safePrice / safeOriginal) * 100)
      : 0

  return (
    <DetailShell
      user={user}
      rightActions={
        <DetailHeaderActions
          isLiked={isLiked}
          onLike={handleLike}
          shareMeta={{
            title: post.title,
            description:
              post.description?.slice(0, 80) ||
              `${safePrice.toLocaleString()}원 / ${post.unit || ""}`,
            imageUrl: post.images?.[0],
          }}
          extra={
            <>
              {!(user && user.id === post.user_id) && !isAdmin && (
                <ReportButton targetType="local_food" targetId={post.id} variant="icon" />
              )}
              {((!!user && user.id === post.user_id) || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-2 hover:bg-secondary rounded-full transition-colors"
                      aria-label="더보기"
                    >
                      <MoreVertical className="w-5 h-5 text-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/local-food/${post.id}/edit`} className="flex items-center gap-2">
                        <Pencil className="w-4 h-4 mr-2" />
                        수정하기
                      </Link>
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
        post.status === "sold_out" ? (
          <Button disabled size="lg" className="flex-1">
            품절
          </Button>
        ) : !!user && user.id === post.user_id ? (
          <Button
            size="lg"
            variant="outline"
            onClick={() => router.push("/mypage/sales")}
            className="flex-1 gap-2"
          >
            판매 관리
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              variant="outline"
              onClick={handleChat}
              disabled={chatLoading}
              className="flex-1 gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              {chatLoading ? "연결 중..." : "문의"}
            </Button>
            {/* 보조: 전화 걸기 — 판매자 phone 있을 때만 노출 */}
            <CallButton userId={post.user_id} />
            <Button
              size="lg"
              onClick={() => {
                if (!user) {
                  router.push(`/auth/login?redirect=/local-food/${id}/checkout`)
                  return
                }
                router.push(`/local-food/${id}/checkout`)
              }}
              className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <ShoppingBag className="w-5 h-5" />
              바로 구매
            </Button>
          </>
        )
      }
    >
      <DetailGallery
        images={post.images}
        alt={post.title}
        fallbackIcon={Leaf}
        fallbackLabel={post.category}
        topLeftBadges={
          <>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-green-500 shadow-sm">
              <Leaf className="w-3 h-3" />
              {post.category}
            </span>
            {post.status === "sold_out" && (
              <span className="px-2.5 py-1 bg-gray-800 text-white text-xs font-medium rounded-md shadow-sm">
                품절
              </span>
            )}
          </>
        }
      />

      <DetailBody>
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            {post.title}
          </h2>
          <div className="flex items-baseline gap-2 flex-wrap">
            {discountPercent > 0 && (
              <span className="text-xl font-bold text-red-500">
                {discountPercent}%
              </span>
            )}
            {safeOriginal > safePrice && (
              <span className="text-base text-muted-foreground line-through">
                {safeOriginal.toLocaleString()}원
              </span>
            )}
            <span className="text-2xl md:text-3xl font-bold text-primary">
              {safePrice.toLocaleString()}원
            </span>
            {post.unit && <span className="text-sm text-muted-foreground">/{post.unit}</span>}
          </div>
        </div>

        <DetailMeta
          location={post.location || post.district || "춘천시"}
          views={post.view_count}
          likes={likeCount}
          timeAgo={formatDate((post as any).bumped_at ?? post.created_at)}
        />

        {post.description && (
          <DetailSection title="상품 요약">
            <DetailInfoBox>{post.description}</DetailInfoBox>
          </DetailSection>
        )}

        {/* 배송비 — 공구 detail 과 동일한 compact 한 줄 (가격 위 placement 와 톤 통일) */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <span className="text-muted-foreground">📦 배송비</span>
          <span className={`font-semibold ${(post.free_shipping || !post.shipping_fee) ? "text-emerald-600" : "text-foreground"}`}>
            {post.free_shipping || !post.shipping_fee
              ? "무료배송"
              : `${post.shipping_fee.toLocaleString()}원`}
          </span>
        </div>

        {(post.location || post.farm_name) && (
          <DetailSection title="원산지 · 판매처">
            <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
              {post.location && (
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">원산지</p>
                  <p className="text-sm font-medium text-foreground">{post.location}</p>
                </div>
              )}
              {post.farm_name && (
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">판매처</p>
                  <p className="text-sm font-medium text-foreground inline-flex items-center gap-1">
                    🌱 {post.farm_name}
                  </p>
                </div>
              )}
            </div>
          </DetailSection>
        )}

        {post.content && (
          <DetailSection title="상세 설명">
            <div className="whitespace-pre-wrap text-foreground leading-relaxed">
              {post.content}
            </div>
          </DetailSection>
        )}

        <DetailSection title="생산자 정보">
          <DetailAuthorCard
            href={`/profile/${post.author?.id || post.user_id}`}
            name={post.author?.nickname || "생산자"}
            avatarUrl={post.author?.avatar_url}
            subtitle={post.district || "춘천시"}
            badges={
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-400 px-2 py-0.5 rounded-full">
                <Leaf className="w-3 h-3" />
                생산자
              </span>
            }
            userId={post.user_id}
            otherPostsTable="local_food"
            otherPostsLinkPrefix="/local-food"
            otherPostsTitle="이 생산자의 다른 상품"
            excludeId={post.id}
          />
        </DetailSection>
      </DetailBody>
    </DetailShell>
  )
}
