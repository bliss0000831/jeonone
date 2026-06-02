"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { ClubPost } from "@/components/club-card"
import {
  MapPin,
  Calendar,
  Users,
  Clock,
  Trash2,
  Pencil,
  AlertCircle,
  MessageCircle,
  Lock,
  MoreVertical,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
  DetailShell,
  DetailBody,
  DetailSection,
  DetailInfoBox,
  DetailAuthorCard,
  DetailMeta,
  DetailHeaderActions,
} from "@/components/detail"
import { AddressMapPreview } from "@/components/address-map-preview"
import { ReportButton } from "@/components/report-button"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

const SPORT_ICON: Record<string, string> = {
  러닝: "🏃",
  배드민턴: "🏸",
  축구: "⚽",
  농구: "🏀",
  테니스: "🎾",
  등산: "⛰️",
  수영: "🏊",
  자전거: "🚴",
  요가: "🧘",
  기타: "🎯",
}

const SPORT_THUMB: Record<string, string> = {
  러닝: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&h=400&fit=crop",
  마라톤: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&h=400&fit=crop",
  조깅: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&h=400&fit=crop",
  축구: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=400&fit=crop",
  풋살: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=400&fit=crop",
  배드민턴: "https://images.unsplash.com/photo-1521537634581-0dced2fee2ef?w=800&h=400&fit=crop",
  농구: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&h=400&fit=crop",
  테니스: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&h=400&fit=crop",
  등산: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&h=400&fit=crop",
  수영: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&h=400&fit=crop",
  자전거: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&h=400&fit=crop",
  요가: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&h=400&fit=crop",
  헬스: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=400&fit=crop",
  골프: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&h=400&fit=crop",
  기타: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&h=400&fit=crop",
}
function pickSportThumb(sport?: string | null, category?: string | null, title?: string | null): string {
  const probes = [sport, category, title].filter(Boolean) as string[]
  for (const text of probes) {
    for (const key of Object.keys(SPORT_THUMB)) {
      if (text.includes(key)) return SPORT_THUMB[key]
    }
  }
  return SPORT_THUMB["기타"]
}

const SKILL_COLOR: Record<string, string> = {
  누구나: "bg-primary/10 text-primary",
  초급:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  중급:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  고급: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

export default function ClubDetailPage() {
  const params = useParams()
  const router = useRouter()
  const confirm = useConfirm()
  const id = params.id as string

  const [post, setPost] = useState<ClubPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isMember, setIsMember] = useState(false)
  const [joinLoading, setJoinLoading] = useState(false)
  const [closeLoading, setCloseLoading] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()
        if (profile?.role === "admin" || profile?.role === "superadmin")
          setIsAdmin(true)

        const { data: likeData } = await supabase
          .from("club_likes")
          .select("id")
          .eq("user_id", user.id)
          .eq("club_id", id)
          .single()
        setLiked(!!likeData)

        const { data: memberData } = await supabase
          .from("club_members")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("club_id", id)
          .maybeSingle()
        setIsMember(!!memberData)
      }
    })
    fetchPost()
  }, [id])

  const handleJoin = async () => {
    if (!user) {
      toast("로그인이 필요합니다")
      return
    }
    setJoinLoading(true)
    try {
      const res = await fetch(`/api/clubs/${id}/join`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "참여 실패")
        return
      }
      setIsMember(true)
      if (data.chatOpened) toast.success("정원이 마감되어 채팅방이 열렸습니다!")
      await fetchPost()
    } finally {
      setJoinLoading(false)
    }
  }

  const handleLeave = async () => {
    if (!user) return
    const isAfterClose = post?.status === "closed" || post?.status === "full"
    const msg = isAfterClose
      ? "채팅방에서 나가면 다시 들어올 수 없습니다. 정말 나가시겠습니까?"
      : "정말 모임에서 나가시겠습니까?"
    if (!(await confirm({ description: msg, destructive: true }))) return
    setLeaveLoading(true)
    try {
      const res = await fetch(`/api/clubs/${id}/join`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "나가기 실패")
        return
      }
      setIsMember(false)
      await fetchPost()
      // 마감 상태에서 나갔으면 채팅방 접근권 사라지므로 리스트로
      if (post?.status === "closed" || post?.status === "full") {
        router.push("/clubs")
      }
    } finally {
      setLeaveLoading(false)
    }
  }

  const handleClose = async () => {
    if (
      !(await confirm({
        description: "지금 모집을 마감하고 채팅방을 열까요?\n(다시 모집으로 되돌릴 수 없습니다)",
        destructive: true,
      }))
    )
      return
    setCloseLoading(true)
    try {
      const res = await fetch(`/api/clubs/${id}/close`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "마감 실패")
        return
      }
      await fetchPost()
      router.push(`/chat/club/${id}`)
    } finally {
      setCloseLoading(false)
    }
  }

  const fetchPost = async () => {
    try {
      const res = await fetch(`/api/clubs/${id}`)
      if (!res.ok) {
        router.push("/clubs")
        return
      }
      const data = await res.json()
      setPost(data.post)
      setLikeCount(data.post.like_count || 0)
    } finally {
      setLoading(false)
    }
  }

  const [likeBusy, setLikeBusy] = useState(false)
  const handleLike = async () => {
    if (!user) {
      toast("로그인이 필요합니다")
      return
    }
    if (likeBusy) return // 더블탭 방지 — 카운트 불일치 방지
    setLikeBusy(true)
    const prevLiked = liked
    const prevCount = likeCount
    const next = !liked
    // 낙관적 업데이트 — 실패 시 롤백
    setLiked(next)
    setLikeCount((c) => (next ? c + 1 : Math.max(0, c - 1)))
    try {
      const supabase = createClient()
      if (next) {
        const { error: insErr } = await supabase
          .from("club_likes")
          .insert({ user_id: user.id, club_id: id })
        // 23505 = 이미 좋아요 — 성공 취급
        if (insErr && (insErr as any).code !== "23505") throw insErr
        const { error: updErr } = await supabase
          .from("clubs")
          .update({ like_count: prevCount + 1 })
          .eq("id", id)
        if (updErr) throw updErr
      } else {
        const { error: delErr } = await supabase
          .from("club_likes")
          .delete()
          .eq("user_id", user.id)
          .eq("club_id", id)
        if (delErr) throw delErr
        const { error: updErr } = await supabase
          .from("clubs")
          .update({ like_count: Math.max(0, prevCount - 1) })
          .eq("id", id)
        if (updErr) throw updErr
      }
    } catch (e) {
      console.error("[clubs like]", e)
      setLiked(prevLiked) // 롤백
      setLikeCount(prevCount)
      toast.error("좋아요 처리에 실패했어요. 다시 시도해주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!(await confirm({ description: "정말로 삭제하시겠습니까?", destructive: true }))) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/clubs/${id}`, { method: "DELETE" })
      if (res.ok) router.push("/clubs")
      else toast.error("삭제 실패")
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!post) return null

  const isFull = post.current_members >= post.max_members
  const isClosed = post.status === "closed"
  const fillPercent = Math.min(
    (post.current_members / post.max_members) * 100,
    100,
  )
  const isOwner = user && post.user_id === user.id
  const sportIcon = SPORT_ICON[post.sport_type || ""] || SPORT_ICON["기타"]

  const meetingDateFormatted = post.meeting_date
    ? new Date(post.meeting_date).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    : null

  // 액션 버튼 상태
  const actionBar = (() => {
    // 모집 마감 + 멤버 → 채팅방 입장 + 나가기 (모임장 제외)
    if ((isClosed || isFull) && isMember) {
      return (
        <>
          <Button
            asChild
            size="lg"
            className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Link href={`/chat/club/${id}`}>
              <MessageCircle className="w-5 h-5" />
              채팅방 입장
            </Link>
          </Button>
          {!isOwner && (
            <Button
              size="lg"
              variant="outline"
              onClick={handleLeave}
              disabled={leaveLoading}
              className="gap-2"
            >
              {leaveLoading ? "나가는 중..." : "나가기"}
            </Button>
          )}
        </>
      )
    }
    // 참여 (모집중 + 미참여)
    if (!isFull && !isClosed && !isMember) {
      return (
        <Button
          size="lg"
          className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={handleJoin}
          disabled={joinLoading}
        >
          <Users className="w-5 h-5" />
          {joinLoading ? "신청 중..." : "참여 신청하기"}
        </Button>
      )
    }
    // 이미 참여중 (모집중) — 나가기 가능
    if (!isFull && !isClosed && isMember && !isOwner) {
      return (
        <Button
          size="lg"
          variant="outline"
          className="flex-1 gap-2"
          onClick={handleLeave}
          disabled={leaveLoading}
        >
          <Users className="w-5 h-5" />
          {leaveLoading ? "나가는 중..." : "참여 취소"}
        </Button>
      )
    }
    // 모임장 강제 마감
    if (isOwner && !isFull && !isClosed) {
      return (
        <Button
          size="lg"
          variant="outline"
          onClick={handleClose}
          disabled={closeLoading}
          className="flex-1 gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
        >
          <Lock className="w-5 h-5" />
          {closeLoading ? "마감 중..." : "모집 마감하기"}
        </Button>
      )
    }
    // 이미 마감된 일반 유저
    return (
      <Button size="lg" variant="outline" className="flex-1" disabled>
        <Lock className="w-5 h-5 mr-2" />
        마감된 모임
      </Button>
    )
  })()

  const statusBadge = (
    <span
      className={cn(
        "px-2 py-1 rounded-md text-xs font-bold shadow-sm",
        isClosed || isFull
          ? "bg-rose-500 text-white"
          : "bg-primary text-primary-foreground",
      )}
    >
      {isClosed ? "마감" : isFull ? "정원마감" : "모집중"}
    </span>
  )

  return (
    <DetailShell
      user={user}
      rightActions={
        <DetailHeaderActions
          isLiked={liked}
          onLike={handleLike}
          shareMeta={{
            title: post.title,
            description: post.content?.slice(0, 80),
            imageUrl: post.images?.[0],
          }}
          extra={
            <>
              {!isOwner && !isAdmin && (
                <ReportButton targetType="clubs" targetId={post.id} />
              )}
              {(isOwner || isAdmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 hover:bg-secondary rounded-full transition-colors">
                    <MoreVertical className="w-5 h-5 text-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/clubs/${id}/edit`}>
                      <Pencil className="w-4 h-4 mr-2" />
                      수정하기
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    disabled={deleteLoading}
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
      actionBar={actionBar}
    >
      {/* Hero — 이미지 있으면 이미지, 없으면 스포츠 이모지 그라디언트
          (다른 상세 페이지의 DetailGallery 와 동일한 rounded-2xl 카드 스타일) */}
      <div className="px-4 pt-4">
        <div className="relative aspect-[16/10] md:aspect-[2/1] rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-indigo-500 to-violet-600">
          {(post.images?.[0] || pickSportThumb(post.sport_type, post.category, post.title)) ? (
            <img
              src={post.images?.[0] || pickSportThumb(post.sport_type, post.category, post.title)}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-8xl md:text-9xl select-none">
                {sportIcon}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
            {statusBadge}
            <span
              className={cn(
                "px-2 py-1 rounded-md text-xs font-medium shadow-sm",
                SKILL_COLOR[post.skill_level] || SKILL_COLOR["누구나"],
              )}
            >
              {post.skill_level}
            </span>
            {post.sport_type && (
              <span className="px-2 py-1 rounded-md text-xs font-medium bg-white/20 text-white backdrop-blur-sm">
                {post.sport_type}
              </span>
            )}
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-xl md:text-2xl font-bold text-white leading-tight drop-shadow">
              {post.title}
            </h1>
          </div>
        </div>
      </div>

      <DetailBody>
        <DetailAuthorCard
          href={`/profile/${post.user_id}`}
          name={post.profiles?.nickname || "익명"}
          avatarUrl={post.profiles?.avatar_url}
          subtitle={new Date(post.created_at).toLocaleDateString("ko-KR")}
          badges={
            <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-0.5 rounded-full">
              <Users className="w-3 h-3" />
              모임장
            </span>
          }
          userId={post.user_id}
          otherPostsTable="clubs"
          otherPostsLinkPrefix="/clubs"
          otherPostsTitle="이 모임장의 다른 모임"
          excludeId={post.id}
        />

        <DetailMeta views={post.view_count} likes={likeCount} />

        {/* Info Grid — 장소는 아래 위치 섹션으로 이동 */}
        <div className="grid grid-cols-2 gap-3">
          {meetingDateFormatted && (
            <div className="bg-secondary/50 rounded-xl p-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">날짜</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {meetingDateFormatted}
                </p>
              </div>
            </div>
          )}
          {post.meeting_time && (
            <div className="bg-secondary/50 rounded-xl p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">시간</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {post.meeting_time}
                </p>
              </div>
            </div>
          )}
          <div className="bg-secondary/50 rounded-xl p-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">참여 인원</p>
              <p className="text-sm font-medium text-foreground truncate">
                {post.current_members}/{post.max_members}명
              </p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              모집 현황
            </span>
            <span
              className={cn(
                "text-sm font-bold",
                isFull ? "text-rose-500" : "text-primary",
              )}
            >
              {post.current_members}/{post.max_members}명
            </span>
          </div>
          <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isFull ? "bg-rose-500" : "bg-primary",
              )}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
          {isFull && (
            <p className="text-xs text-rose-500 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              모집이 마감되었습니다
            </p>
          )}
        </div>

        {post.content && (
          <DetailSection title="모임 소개">
            <DetailInfoBox>{post.content}</DetailInfoBox>
          </DetailSection>
        )}

        {post.location && (
          <DetailSection title="모임 장소">
            <p className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              {post.location}
            </p>
            <AddressMapPreview address={post.location} height={220} />
          </DetailSection>
        )}
      </DetailBody>
    </DetailShell>
  )
}
