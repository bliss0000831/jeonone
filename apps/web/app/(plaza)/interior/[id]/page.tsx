"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { ServicePost } from "@/components/service-card"
import {
  MessageCircle,
  Phone,
  Paintbrush,
  Wrench,
  Sparkles,
  Truck,
  MoreHorizontal,
  Home,
  Bath,
  UtensilsCrossed,
  LayoutGrid,
  Grid3x3,
  Archive,
  Lightbulb,
  Palette,
  Maximize2,
  Layers,
} from "lucide-react"
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

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> =
  {
    전체리모델링: Home,
    부분시공: Wrench,
    주방: UtensilsCrossed,
    욕실: Bath,
    도배장판: LayoutGrid,
    바닥재: Layers,
    타일: Grid3x3,
    붙박이장: Archive,
    조명전기: Lightbulb,
    페인팅: Palette,
    샷시창호: Maximize2,
    발코니확장: Maximize2,
    기타: MoreHorizontal,
    // 구 카테고리 호환
    시공: Paintbrush,
    수리: Wrench,
    청소: Sparkles,
    이사: Truck,
  }

const categoryColors: Record<string, string> = {
  전체리모델링: "bg-purple-600",
  부분시공: "bg-purple-500",
  주방: "bg-rose-500",
  욕실: "bg-sky-500",
  도배장판: "bg-amber-500",
  바닥재: "bg-orange-500",
  타일: "bg-teal-500",
  붙박이장: "bg-stone-500",
  조명전기: "bg-yellow-500",
  페인팅: "bg-pink-500",
  샷시창호: "bg-cyan-500",
  발코니확장: "bg-emerald-500",
  기타: "bg-gray-500",
  시공: "bg-purple-500",
}

const categoryBadgeSoft: Record<string, string> = {
  전체리모델링: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  부분시공: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  주방: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  욕실: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  도배장판: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  바닥재: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  타일: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  붙박이장: "bg-stone-50 text-stone-700 dark:bg-stone-900/40 dark:text-stone-400",
  조명전기: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  페인팅: "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400",
  샷시창호: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400",
  발코니확장: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  기타: "bg-gray-50 text-gray-700 dark:bg-gray-900/40 dark:text-gray-400",
  시공: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
}

export default function InteriorDetailPage() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const confirm = useConfirm()
  const [post, setPost] = useState<ServicePost | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const { handleChat, chatLoading } = usePostChat({
    postId: typeof id === "string" ? id : undefined,
    postType: "interior",
    authorId: post?.user_id ?? (post as any)?.profiles?.id ?? null,
    currentUserId: currentUser?.id ?? null,
    loginRedirectPath: typeof id === "string" ? `/interior/${id}` : undefined,
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

      // FK 조인이 PostgREST 에서 실패해 데이터가 통째로 null 로 돌아오는 케이스가 있어
      // profiles 는 별도로 조회해서 병합한다 (목록 페이지와 동일 패턴).
      const plaza = getCurrentPlazaClient()
      let baseQ: any = supabase.from("interior_posts").select("*").eq("id", id)
      if (plaza) baseQ = baseQ.eq("plaza_id", plaza)
      const { data: base, error: baseErr } = await baseQ.maybeSingle()

      if (baseErr) {
        console.error("[interior] 상세 조회 실패", baseErr)
      }

      if (base) {
        let profile: any = null
        if (base.user_id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, nickname, avatar_url, account_type")
            .eq("id", base.user_id)
            .maybeSingle()
          profile = prof ?? null
        }
        const data = { ...base, profiles: profile }
        setPost(data as ServicePost)

        // 조회수 +1 — atomic RPC (race-free)
        void supabase.rpc('increment_view_count', { p_table: 'interior_posts', p_id: id, p_column: 'views' })

        if (user) {
          const { data: fav } = await supabase
            .from("interior_favorites")
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
    const { error } = await supabase.from("interior_posts").delete().eq("id", id)
    if (error) {
      toast.error("삭제 실패: " + error.message)
      return
    }
    router.push("/interior")
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
    const newLikes = Math.max(0, base + (next ? 1 : -1))
    // 낙관적 업데이트 — 하트 + 표시 카운트 함께 (실패 시 롤백)
    setIsLiked(next)
    setPost((p) => (p ? { ...p, likes: newLikes } : p))
    try {
      if (next) {
        const { error: insErr } = await supabase
          .from("interior_favorites")
          .insert({ user_id: currentUser.id, post_id: id })
        if (insErr && (insErr as any).code !== "23505") throw insErr
        // 이미 좋아요(중복)면 실제 변동 없음 — 카운트 원복
        if (insErr) {
          setPost((p) => (p ? { ...p, likes: base } : p))
        } else {
          // 원자적 카운트 증가 (동시 좋아요 유실 방지)
          void supabase.rpc("change_like_count", {
            p_table: "interior_posts", p_id: id, p_column: "likes", p_delta: 1,
          }).then(({ error: rpcErr }) => { if (rpcErr) console.error("[interior like]", rpcErr) })
        }
      } else {
        const { error: delErr } = await supabase
          .from("interior_favorites")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("post_id", id)
        if (delErr) throw delErr
        void supabase.rpc("change_like_count", {
          p_table: "interior_posts", p_id: id, p_column: "likes", p_delta: -1,
        }).then(({ error: rpcErr }) => { if (rpcErr) console.error("[interior unlike]", rpcErr) })
      }
    } catch (e) {
      console.error("[interior like]", e)
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
        <Paintbrush className="w-12 h-12 text-muted-foreground mb-4" />
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

  const category = post.category || "시공"
  const CategoryIcon = categoryIcons[category] || Paintbrush
  const categoryColor = categoryColors[category] || "bg-purple-500"
  const categoryBadgeClass =
    categoryBadgeSoft[category] || categoryBadgeSoft["시공"]

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
                <ReportButton targetType="interior" targetId={post.id} variant="icon" />
              )}
              <BumpQuickMenu
                isOwner={!!currentUser && currentUser.id === post.user_id}
                isAdmin={isAdmin}
                targetType="interior"
                targetId={post.id}
                editHref={`/interior/${post.id}/edit`}
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
        fallbackIcon={CategoryIcon}
        fallbackLabel={category}
        topLeftBadges={
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white shadow-sm ${categoryColor}`}
          >
            <CategoryIcon className="w-3 h-3" />
            {category}
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
          location={`${post.service_region || ""} ${post.service_district || ""}`.trim()}
          views={post.views}
          likes={post.likes}
        />

        {/* [공간] 태그 — 본문에 "[공간] 아파트, 빌라" 형식으로 저장됨. 배지 시각화 */}
        {(() => {
          const m = post.content?.match(/\[공간\]\s*([^\n]+)/)
          if (!m) return null
          const spaces = m[1].split(/[,，·]/).map((s: string) => s.trim()).filter(Boolean)
          if (spaces.length === 0) return null
          return (
            <DetailSection title="시공 가능 공간">
              <div className="flex flex-wrap gap-2">
                {spaces.map((s: string) => (
                  <span
                    key={s}
                    className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm font-medium border border-blue-500/20"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </DetailSection>
          )
        })()}

        <DetailSection title="서비스 소개">
          <DetailInfoBox>
            {/* [공간] 태그는 위에 배지로 표시되므로 본문에선 제거 */}
            {post.content?.replace(/\[공간\][^\n]*\n?/g, "").trim()}
          </DetailInfoBox>
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
            href={`/profile/${post.user_id}`}
            name={post.profiles?.nickname || "인테리어 전문가"}
            avatarUrl={post.profiles?.avatar_url}
            badges={
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${categoryBadgeClass}`}
              >
                <CategoryIcon className="w-3 h-3" />
                {category}
              </span>
            }
            userId={post.user_id}
            otherPostsTable="interior_posts"
            otherPostsLinkPrefix="/interior"
            otherPostsTitle="이 업체의 다른 서비스"
            excludeId={post.id}
          />
        </DetailSection>
      </DetailBody>
    </DetailShell>
  )
}
