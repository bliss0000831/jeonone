"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  MapPin,
  Users,
  Clock,
  X,
  Check,
  MessageCircle,
  Lock,
  Truck,
  Package,
  Share2,
  Heart,
  RotateCcw,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { User } from "@supabase/supabase-js"
import { GroupBuyingPost } from "@/components/group-buying-card"
import { cn } from "@/lib/utils"
import { AddressSearch } from "@/components/address-search"
import {
  DetailShell,
  DetailGallery,
  DetailBody,
  DetailSection,
  DetailInfoBox,
  DetailKeyValue,
  DetailAuthorCard,
  DetailHeaderActions,
} from "@/components/detail"
import { BumpQuickMenu } from "@/components/bump-quick-menu"
import { ReportButton } from "@/components/report-button"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

interface Participant {
  id: string
  user_id: string
  created_at: string
  profiles: {
    id: string
    nickname: string
    avatar_url: string | null
  } | null
}

export default function GroupBuyingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const confirm = useConfirm()
  const id = params.id as string

  const [post, setPost] = useState<GroupBuyingPost | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isJoined, setIsJoined] = useState(false)
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [hostStats, setHostStats] = useState<{
    success_count: number
    cancel_count: number
    total_count: number
    success_pct: number | null
  } | null>(null)
  const [showParticipants, setShowParticipants] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [joinForm, setJoinForm] = useState({
    quantity: 1,
    receive_method: "pickup" as "pickup" | "delivery",
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    recipient_address_detail: "",
  })
  const [closeLoading, setCloseLoading] = useState(false)
  const [reopenLoading, setReopenLoading] = useState(false)

  useEffect(() => {
    // Kakao SDK 폴링 — 시도 횟수 제한 + cleanup (메모리 누수 방지)
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const initKakao = () => {
      if (typeof window !== "undefined" && (window as any).Kakao) {
        if (!(window as any).Kakao.isInitialized()) {
          (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_APP_ID)
        }
        return
      }
      if (attempts >= 30) return  // 3초 후 포기 (SDK 차단/오프라인)
      attempts++
      timer = setTimeout(initKakao, 100)
    }
    initKakao()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [])

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
        // Fetch post — 광장 격리
        const plaza = getCurrentPlazaClient()
        let pq: any = supabase.from("group_buying_posts").select("*").eq("id", id)
        if (plaza) pq = pq.eq("plaza_id", plaza)
        const { data, error: fetchError } = await pq.single()

        if (fetchError) {
          setError("글을 찾을 수 없습니다")
          setIsLoading(false)
          return
        }

        setPost(data as GroupBuyingPost)

        // 주최자 신뢰 점수 — group_buying_host_stats view
        if (data.user_id) {
          const { data: stats } = await supabase
            .from("group_buying_host_stats")
            .select("*")
            .eq("user_id", data.user_id)
            .maybeSingle()
          if (stats) setHostStats(stats as any)
        }

        // Check if user joined
        if (user) {
          const { data: participantData } = await supabase
            .from("group_buying_participants")
            .select("id")
            .eq("post_id", id)
            .eq("user_id", user.id)
            .single()

          setIsJoined(!!participantData)

          // Check wishlist status
          const wishlistRes = await fetch(`/api/group-buying/${id}/wishlist`)
          const wishlistData = await wishlistRes.json()
          setIsWishlisted(wishlistData.wishlisted)
        }

        // Fetch participants
        await fetchParticipants()
      } catch (err) {
        setError("글을 불러올 수 없습니다")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [id])

  const fetchParticipants = async () => {
    try {
      const res = await fetch(`/api/group-buying/${id}/join`)
      const data = await res.json()
      if (data.participants) {
        setParticipants(data.participants)
      }
    } catch (err) {
      console.error("Failed to fetch participants")
    }
  }

  const handleOpenJoin = async () => {
    if (!user) {
      router.push("/auth/login")
      return
    }
    // 가입 시 입력한 실명/연락처 자동 채움
    const meta = (user.user_metadata || {}) as { full_name?: string; phone?: string }
    let realName = meta.full_name || ""
    let phoneNum = meta.phone || ""
    if (!realName || !phoneNum) {
      try {
        const supabase = createClient()
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", user.id)
          .maybeSingle()
        realName = realName || profile?.full_name || ""
        phoneNum = phoneNum || profile?.phone || ""
      } catch {}
    }
    setJoinForm({
      quantity: 1,
      receive_method: "delivery", // 픽업 옵션 폐지 → 항상 배송
      recipient_name: realName,
      recipient_phone: phoneNum,
      recipient_address: "",
      recipient_address_detail: "",
    })
    setShowJoinModal(true)
  }

  const handleSubmitJoin = async () => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/group-buying/${id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(joinForm),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "참여에 실패했습니다")
        return
      }
      setIsJoined(true)
      setShowJoinModal(false)
      if (post)
        setPost({
          ...post,
          current_participants: data.current_participants,
          status: data.status,
        } as any)
      await fetchParticipants()
      if (data.chatOpened) {
        const { toast } = await import("sonner")
        toast.success("정원이 마감되어 채팅방이 열렸습니다! 입금 안내를 확인하세요.", {
          action: {
            label: "이동",
            onClick: () => router.push(`/chat/group-buying/${id}`),
          },
          duration: 6000,
        })
        // 자동 라우팅은 1초 후 — 사용자가 토스트를 읽을 시간 확보
        setTimeout(() => router.push(`/chat/group-buying/${id}`), 1500)
      }
    } catch {
      const { toast } = await import("sonner")
      toast.error("오류가 발생했습니다")
    } finally {
      setActionLoading(false)
    }
  }

  const handleLeave = async () => {
    if (!(await confirm({ description: "참여를 취소할까요?", destructive: true }))) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/group-buying/${id}/leave`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "취소 실패")
        return
      }
      setIsJoined(false)
      if (post)
        setPost({
          ...post,
          current_participants: data.current_participants,
        } as any)
      await fetchParticipants()
    } finally {
      setActionLoading(false)
    }
  }

  const handleOwnerClose = async () => {
    if (
      !(await confirm({
        description: "지금 모집을 마감하고 채팅방을 열까요?\n(되돌릴 수 없습니다)",
        destructive: true,
      }))
    )
      return
    setCloseLoading(true)
    try {
      const res = await fetch(`/api/group-buying/${id}/close`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error)
        return
      }
      router.push(`/chat/group-buying/${id}`)
    } finally {
      setCloseLoading(false)
    }
  }

  const handleReopen = async () => {
    if (
      !(await confirm({
        description: "모집을 다시 시작할까요?\n참여자들이 다시 입장할 수 있게 됩니다.",
      }))
    )
      return
    setReopenLoading(true)
    try {
      const res = await fetch(`/api/group-buying/${id}/reopen`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "재모집 중 오류가 발생했습니다")
        return
      }
      // 상태만 업데이트 — 페이지 리로드 없이 UI 전환
      setPost((prev) => (prev ? { ...prev, status: "recruiting" } : prev))
    } finally {
      setReopenLoading(false)
    }
  }

  const handleDelete = async () => {
    const joined = post?.current_participants ?? 0
    const title = post?.title || "이 공동구매"
    const warn =
      joined > 0
        ? `'${title}'에는 이미 ${joined}명이 참여(결제)했습니다.\n\n삭제하면 게시글이 영구 삭제되며 되돌릴 수 없습니다. 참여자 환불·정산은 별도로 처리해야 합니다. 정말 삭제하시겠습니까?`
        : `'${title}'을(를) 영구 삭제하시겠습니까?\n\n삭제하면 되돌릴 수 없습니다.`
    if (!(await confirm({ description: warn, destructive: true }))) return
    const supabase = createClient()
    const { error } = await supabase.from("group_buying_posts").delete().eq("id", id)
    if (error) {
      toast.error("삭제 실패: " + error.message)
      return
    }
    router.push("/group-buying")
  }

  const handleWishlist = async () => {
    if (!user) {
      router.push("/auth/login")
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/group-buying/${id}/wishlist`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || "찜 처리에 실패했어요")
        return
      }
      setIsWishlisted(!!data.wishlisted)
    } catch (err) {
      toast.error("오류가 발생했습니다")
    } finally {
      setActionLoading(false)
    }
  }

const daysLeft = post?.deadline ? getDaysLeft(post.deadline) : null
  const discountPercent =
    post?.original_price && post.original_price > 0
      ? Math.round(
          ((post.original_price - post.group_price) / post.original_price) *
            100,
        )
      : 0
  const progress = post?.max_participants
    ? Math.min((post.current_participants / post.max_participants) * 100, 100)
    : post?.min_participants
      ? (post.current_participants / post.min_participants) * 100
      : 0

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <p className="text-lg font-medium text-foreground mb-4">
          {error || "글을 찾을 수 없습니다"}
        </p>
        <Link href="/group-buying" className="text-primary hover:underline">
          목록으로 돌아가기
        </Link>
      </div>
    )
  }

  const isOwner = !!user && post.user_id === user.id
  const isOpen = ["pending_payment", "in_progress", "completed"].includes(
    post.status,
  )
  const isCancelled = post.status === "cancelled"

  // 상태/카테고리 배지 — 갤러리 좌상단
  const topLeftBadges = (
    <>
      <span
        className={cn(
          "px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1",
          post.status === "recruiting"
            ? "bg-primary text-primary-foreground"
            : isCancelled
              ? "bg-destructive text-destructive-foreground"
              : "bg-muted text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            post.status === "recruiting" ? "bg-white" : "bg-white/70",
          )}
        />
        {post.status === "recruiting"
          ? "모집중"
          : isCancelled
            ? "취소됨"
            : "모집완료"}
      </span>
      {discountPercent > 0 && (
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-destructive text-destructive-foreground">
          -{discountPercent}%
        </span>
      )}
    </>
  )

  // 하단 고정 액션바 CTA
  const actionBar = (() => {
    // 채팅방 입장 (마감 후, 참여자 or 주최자)
    if (isOpen && (isJoined || isOwner)) {
      return (
        <Link href={`/chat/group-buying/${id}`} className="flex-1">
          <button className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium flex items-center justify-center gap-2">
            <MessageCircle className="w-4 h-4" /> 채팅방 입장
          </button>
        </Link>
      )
    }

    if (isCancelled) {
      if (isOwner) {
        return (
          <div className="flex-1 flex items-stretch gap-2">
            <button
              disabled
              className="flex-1 px-4 py-3 rounded-lg bg-muted text-muted-foreground font-medium"
            >
              취소된 공동구매
            </button>
            <button
              onClick={handleReopen}
              disabled={reopenLoading}
              className="px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className={cn("w-4 h-4", reopenLoading && "animate-spin")} />
              {reopenLoading ? "재모집 중..." : "다시 모집"}
            </button>
          </div>
        )
      }
      return (
        <button
          disabled
          className="flex-1 px-4 py-3 rounded-lg bg-muted text-muted-foreground font-medium"
        >
          취소된 공동구매
        </button>
      )
    }

    // 모집중 + 주최자 → 모집 마감
    if (post.status === "recruiting" && isOwner) {
      return (
        <button
          onClick={handleOwnerClose}
          disabled={closeLoading}
          className="flex-1 px-4 py-3 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-foreground font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Lock className="w-4 h-4" /> {closeLoading ? "마감 중..." : "모집 마감하기"}
        </button>
      )
    }

    // 모집중 + 참여중 + 비주최자
    if (post.status === "recruiting" && isJoined) {
      return (
        <button
          onClick={handleLeave}
          disabled={actionLoading}
          className="flex-1 px-4 py-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Check className="w-4 h-4" /> 참여중 (취소하기)
        </button>
      )
    }

    // 모집중 + 비참여 — 항상 선결제 (직거래 폐기)
    if (post.status === "recruiting") {
      return (
        <button
          onClick={() => {
            if (!user) {
              router.push(`/auth/login?redirect=/group-buying/${id}/checkout`)
              return
            }
            router.push(`/group-buying/${id}/checkout`)
          }}
          className="flex-1 px-4 py-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium flex items-center justify-center gap-2"
        >
          💳 결제하고 참여 ({(post.group_price || 0).toLocaleString()}원)
        </button>
      )
    }

    return (
      <button
        disabled
        className="flex-1 px-4 py-3 rounded-lg bg-muted text-muted-foreground font-medium"
      >
        참여할 수 없습니다
      </button>
    )
  })()

  return (
    <>
      <DetailShell
        user={user}
        rightActions={
          <DetailHeaderActions
            isLiked={isWishlisted}
            likeLoading={actionLoading}
            onLike={handleWishlist}
            shareMeta={{
              title: post.title,
              description: post.description?.slice(0, 80) || post.product_name,
              imageUrl: post.images?.[0],
            }}
            extra={
              <>
                {!(user && user.id === post.user_id) && !isAdmin && (
                  <ReportButton targetType="group_buying" targetId={post.id} variant="icon" />
                )}
                <BumpQuickMenu
                  isOwner={isOwner}
                  isAdmin={isAdmin}
                  targetType="group_buying"
                  targetId={post.id}
                  editHref={`/group-buying/${post.id}/edit`}
                  onDelete={handleDelete}
                />
              </>
            }
          />
        }
        actionBar={actionBar}
      >
        {/* 상단 이미지 갤러리 */}
        <DetailGallery
          images={post.images}
          alt={post.title}
          aspect="wide"
          fallbackIcon={Users}
          fallbackLabel="이미지가 없습니다"
          topLeftBadges={topLeftBadges}
        />

        <DetailBody>
          {/* 제목 + 설명 */}
          <DetailSection divider={false}>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {post.title}
            </h1>
            {post.description && (
              <p className="text-muted-foreground whitespace-pre-wrap">
                {post.description}
              </p>
            )}
          </DetailSection>

          {/* 상품 정보 */}
          <DetailSection title="상품 정보">
            <div className="space-y-1">
              <DetailKeyValue label="상품명" value={post.product_name} />
              {post.original_price ? (
                <DetailKeyValue
                  label="원가"
                  value={
                    <span className="line-through text-muted-foreground">
                      {post.original_price.toLocaleString()}원
                    </span>
                  }
                />
              ) : null}
              <DetailKeyValue
                label="공동가"
                value={
                  <span className="flex items-center gap-2 justify-end">
                    <span className="text-xl font-bold text-primary">
                      {post.group_price.toLocaleString()}원
                    </span>
                    {discountPercent > 0 && (
                      <span className="text-base font-bold text-destructive">
                        -{discountPercent}%
                      </span>
                    )}
                  </span>
                }
              />
              <DetailKeyValue
                label="배송비"
                value={
                  <span className="text-sm font-medium">
                    {(post.delivery_fee_mode === "free" || !post.delivery_fee)
                      ? <span className="text-emerald-600 font-semibold">무료배송</span>
                      : post.delivery_fee_mode === "included"
                        ? "상품가 포함"
                        : `${(post.delivery_fee || 0).toLocaleString()}원 별도`}
                  </span>
                }
              />
            </div>
          </DetailSection>

          {/* 모집 현황 + 진행률 */}
          <DetailSection
            title="모집 현황"
            right={
              participants.length > 0 && (
                <button
                  onClick={() => setShowParticipants(true)}
                  className="text-sm text-primary hover:underline"
                >
                  참여자 보기
                </button>
              )
            }
          >
            <div
              className="p-4 bg-secondary/50 rounded-xl cursor-pointer hover:bg-secondary transition-colors"
              onClick={() => setShowParticipants(true)}
            >
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {post.current_participants}/
                  {post.max_participants || post.min_participants}명 참여중
                </span>
              </div>

              <div className="space-y-2">
                <div className="h-2 bg-card rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {Math.round(progress)}% 진행율
                </p>
              </div>

              {participants.length > 0 && (
                <div className="mt-3 flex items-center gap-1">
                  <div className="flex -space-x-2">
                    {participants.slice(0, 5).map((p) => (
                      <div
                        key={p.id}
                        className="w-6 h-6 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-xs font-medium"
                      >
                        {p.profiles?.nickname?.[0] || "?"}
                      </div>
                    ))}
                  </div>
                  {participants.length > 5 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      +{participants.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          </DetailSection>

          {/* 위치 · 마감 정보 */}
          {(post.location || (daysLeft !== null && post.status === "recruiting")) && (
            <DetailSection title="모집 정보">
              <div className="space-y-1">
                {post.location && (
                  <DetailKeyValue
                    label={
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" /> 위치
                      </span>
                    }
                    value={post.location}
                  />
                )}
                {daysLeft !== null && post.status === "recruiting" && (
                  <DetailKeyValue
                    label={
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" /> 마감
                      </span>
                    }
                    value={
                      daysLeft > 0 ? `마감까지 ${daysLeft}일` : "오늘 마감"
                    }
                  />
                )}
              </div>
            </DetailSection>
          )}

          {/* 추가 이미지 */}
          {post.images && post.images.length > 1 && (
            <DetailSection title="상세 이미지">
              <div className="grid grid-cols-3 gap-2">
                {post.images.slice(1).map((image, index) => (
                  <div
                    key={index}
                    className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                  >
                    <Image
                      src={image}
                      alt={`${post.title} ${index + 2}`}
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 33vw, 33vw"
                    />
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* 주최자 */}
          {post.profiles && (
            <DetailSection title="주최자">
              <DetailAuthorCard
                href={`/profile/${post.user_id}`}
                name={post.profiles.nickname || "알 수 없음"}
                avatarUrl={post.profiles.avatar_url}
                subtitle={post.location || undefined}
                userId={post.user_id}
                otherPostsTable="group_buying_posts"
                otherPostsLinkPrefix="/group-buying"
                otherPostsTitle="이 주최자의 다른 공구"
                excludeId={post.id}
                badges={
                  hostStats && hostStats.total_count > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                      🏆 공구 성공률{" "}
                      {hostStats.success_pct != null ? `${hostStats.success_pct}%` : "—"}{" "}
                      ({hostStats.success_count}/{hostStats.total_count})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      신규 주최자
                    </span>
                  )
                }
              />
            </DetailSection>
          )}

          {/* 설명문 */}
          <DetailSection title="안내">
            <DetailInfoBox>
              정원이 채워지면 자동으로 채팅방이 열리고 입금 안내가 시작됩니다.
            </DetailInfoBox>
          </DetailSection>
        </DetailBody>
      </DetailShell>

      {/* Participants Modal */}
      {showParticipants && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card rounded-lg w-full max-w-md max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">
                참여자 목록 ({participants.length}명)
              </h3>
              <button
                onClick={() => setShowParticipants(false)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {participants.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  아직 참여자가 없습니다
                </p>
              ) : (
                <div className="space-y-3">
                  {participants.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                        {p.profiles?.avatar_url ? (
                          <Image
                            src={p.profiles.avatar_url}
                            alt=""
                            width={40}
                            height={40}
                            className="w-full h-full rounded-full object-cover"
                            sizes="40px"
                          />
                        ) : (
                          p.profiles?.nickname?.[0] || "?"
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {p.profiles?.nickname || "알 수 없음"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.created_at
                            ? `${new Date(p.created_at).toLocaleDateString(
                                "ko-KR",
                              )} 참여`
                            : "참여중"}
                        </p>
                      </div>
                      {idx === 0 && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                          첫 참여자
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Join Modal */}
      {showJoinModal &&
        post &&
        (() => {
          const p = post as any
          const remaining = Math.max(
            0,
            (post.max_participants || 999) - post.current_participants,
          )
          const deliveryMode = p.delivery_mode || "both"
          const deliveryFee = p.delivery_fee || 0
          const deliveryFeeMode = p.delivery_fee_mode || "separate"
          const isDelivery = joinForm.receive_method === "delivery"
          const feeTotal =
            isDelivery && deliveryFeeMode === "separate"
              ? joinForm.quantity * deliveryFee
              : 0
          const total = joinForm.quantity * post.group_price + feeTotal

          return (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
              <div className="bg-card rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
                  <h3 className="font-semibold">공동구매 참여</h3>
                  <button
                    onClick={() => setShowJoinModal(false)}
                    className="p-1 hover:bg-muted rounded"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Product Summary */}
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm font-medium">{post.product_name}</p>
                    <p className="text-sm text-primary font-semibold mt-1">
                      {post.group_price.toLocaleString()}원 / 개
                    </p>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      수량{" "}
                      <span className="text-xs text-muted-foreground">
                        (남은 수량 {remaining}개)
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setJoinForm((f) => ({
                            ...f,
                            quantity: Math.max(1, f.quantity - 1),
                          }))
                        }
                        className="w-9 h-9 rounded border border-border hover:bg-muted"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={remaining}
                        value={joinForm.quantity}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 1
                          setJoinForm((f) => ({
                            ...f,
                            quantity: Math.min(remaining, Math.max(1, v)),
                          }))
                        }}
                        className="flex-1 h-9 text-center rounded border border-border bg-background"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setJoinForm((f) => ({
                            ...f,
                            quantity: Math.min(remaining, f.quantity + 1),
                          }))
                        }
                        className="w-9 h-9 rounded border border-border hover:bg-muted"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* 안내 — 선결제 안내 */}
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 p-3 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                    💡 결제 후 모집 마감까지 대기합니다. 최소 인원 미달 시 자동
                    환불됩니다.
                  </div>

                  {/* Recipient Fields (delivery only) */}
                  {isDelivery && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          받는 사람
                        </label>
                        <input
                          type="text"
                          value={joinForm.recipient_name}
                          onChange={(e) =>
                            setJoinForm((f) => ({
                              ...f,
                              recipient_name: e.target.value,
                            }))
                          }
                          placeholder="이름"
                          className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          연락처
                        </label>
                        <input
                          type="tel"
                          value={joinForm.recipient_phone}
                          onChange={(e) =>
                            setJoinForm((f) => ({
                              ...f,
                              recipient_phone: e.target.value,
                            }))
                          }
                          placeholder="010-1234-5678"
                          className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          주소
                        </label>
                        <AddressSearch
                          value={joinForm.recipient_address}
                          onChange={(_full, data) => {
                            if (!data) return
                            const base = data.jibunAddress || data.roadAddress || data.address
                            const withBuilding = data.buildingName
                              ? `${base} (${data.buildingName})`
                              : base
                            setJoinForm((f) => ({
                              ...f,
                              recipient_address: data.zonecode
                                ? `[${data.zonecode}] ${withBuilding}`
                                : withBuilding,
                            }))
                          }}
                          placeholder="주소 검색하기"
                          className="mb-2"
                        />
                        <input
                          type="text"
                          value={joinForm.recipient_address_detail}
                          onChange={(e) =>
                            setJoinForm((f) => ({
                              ...f,
                              recipient_address_detail: e.target.value,
                            }))
                          }
                          placeholder="상세 주소 (동/호수 등)"
                          className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                        />
                      </div>
                      {deliveryFeeMode === "separate" && deliveryFee > 0 && (
                        <p className="text-xs text-muted-foreground">
                          * 배송비 {deliveryFee.toLocaleString()}원이 별도로
                          부과됩니다
                        </p>
                      )}
                    </div>
                  )}

                  {/* Total */}
                  <div className="border-t border-border pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">상품 금액</span>
                      <span>
                        {(
                          joinForm.quantity * post.group_price
                        ).toLocaleString()}
                        원
                      </span>
                    </div>
                    {feeTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">배송비</span>
                        <span>{feeTotal.toLocaleString()}원</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-base pt-1">
                      <span>입금 예정 금액</span>
                      <span className="text-primary">
                        {total.toLocaleString()}원
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-0.5">
                      모집 성사 후 채팅방에서 안내된 계좌로 입금하시면 됩니다.
                    </p>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmitJoin}
                    disabled={
                      actionLoading ||
                      joinForm.quantity < 1 ||
                      joinForm.quantity > remaining ||
                      !joinForm.recipient_name ||
                      !joinForm.recipient_phone ||
                      !joinForm.recipient_address
                    }
                    className="w-full py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? "처리 중..." : "참여 신청 (결제는 모집 후)"}
                  </button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    참여 신청만으로는 결제되지 않습니다.
                    <br />
                    정원이 채워지면 채팅방이 열리고 입금 안내가 시작돼요.
                  </p>
                </div>
              </div>
            </div>
          )
        })()}
    </>
  )
}

function getDaysLeft(deadline: string): number {
  const now = new Date()
  const deadlineDate = new Date(deadline)
  const diffInDays = Math.ceil(
    (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  )
  return Math.max(0, diffInDays)
}
