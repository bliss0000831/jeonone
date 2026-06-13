"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import {
  MessageCircle,
  Briefcase,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle,
  Clock,
  CalendarDays,
  Phone,
} from "lucide-react"
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
} from "@/components/detail"
import { AddressMapPreview } from "@/components/address-map-preview"
import { MapPin } from "lucide-react"
import { usePostChat } from "@/hooks/use-post-chat"
import { ReportButton } from "@/components/report-button"

interface JobsPost {
  id: string
  user_id: string
  kind: "hiring" | "seeking"
  title: string
  description: string
  category: string
  work_type: string | null
  hourly_wage: number
  work_days: string | null
  work_hours: string | null
  location: string | null
  contact: string | null
  images: string[]
  status: string
  views: number
  likes: number
  created_at: string
  profiles?: {
    id: string
    nickname: string
    avatar_url: string | null
  }
}

export default function JobsDetailPage() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const confirm = useConfirm()
  const [post, setPost] = useState<JobsPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [postStatus, setPostStatus] = useState<string>("active")
  const { handleChat, chatLoading } = usePostChat({
    postId: typeof id === "string" ? id : undefined,
    postType: "jobs",
    authorId: post?.user_id ?? post?.profiles?.id ?? null,
    currentUserId: currentUser?.id ?? null,
    loginRedirectPath: typeof id === "string" ? `/jobs/${id}` : undefined,
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
      let q: any = supabase.from("jobs_posts").select("*").eq("id", id)
      if (plaza) q = q.eq("plaza_id", plaza)
      const { data } = await q.single()

      if (data) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, nickname, avatar_url")
          .eq("id", data.user_id)
          .single()
        setPost({ ...data, profiles: profileData } as JobsPost)
        setPostStatus(data.status || "active")

        // 조회수 +1 — atomic RPC (race-free)
        void supabase.rpc('increment_view_count', { p_table: 'jobs_posts', p_id: id, p_column: 'views' })

        // 현재 사용자의 좋아요 여부 로드
        if (user) {
          const { data: liked } = await supabase
            .from("jobs_likes")
            .select("user_id")
            .eq("user_id", user.id)
            .eq("post_id", id)
            .maybeSingle()
          setIsLiked(!!liked)
        }
      }
      setLoading(false)
    }
    fetchPost()
  }, [id])

  const handleLike = async () => {
    if (!currentUser) {
      router.push("/auth/login")
      return
    }
    const supabase = createClient()
    const prevLiked = isLiked
    const next = !isLiked
    // 낙관적 업데이트 — 하트 + 표시 카운트 함께 (실패 시 롤백)
    setIsLiked(next)
    setPost((p) => (p ? { ...p, likes: Math.max(0, (p.likes || 0) + (next ? 1 : -1)) } : p))
    try {
      if (next) {
        const { error } = await supabase
          .from("jobs_likes")
          .insert({ user_id: currentUser.id, post_id: id })
        if (error && (error as any).code !== "23505") throw error
        void supabase.rpc("change_like_count", { p_table: "jobs_posts", p_id: id, p_column: "likes", p_delta: 1 })
      } else {
        const { error } = await supabase
          .from("jobs_likes")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("post_id", id)
        if (error) throw error
        void supabase.rpc("change_like_count", { p_table: "jobs_posts", p_id: id, p_column: "likes", p_delta: -1 })
      }
    } catch (e) {
      console.error("[jobs like]", e)
      setIsLiked(prevLiked) // 롤백
      setPost((p) => (p ? { ...p, likes: Math.max(0, (p.likes || 0) + (next ? -1 : 1)) } : p))
      toast.error("좋아요 처리에 실패했어요. 다시 시도해주세요.")
    }
  }

  const handleClose = async () => {
    const response = await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    })
    if (response.ok) {
      setPostStatus("closed")
      toast.success("모집을 마감했습니다")
    } else {
      toast.error("마감 처리에 실패했습니다")
    }
  }

  const handleEdit = () => router.push(`/jobs/${id}/edit`)

  const handleDelete = async () => {
    if (!(await confirm({ description: "정말로 삭제하시겠습니까?", destructive: true }))) return
    const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d?.error || "삭제에 실패했습니다")
      return
    }
    router.push("/jobs")
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
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Briefcase className="w-12 h-12 text-muted-foreground mb-4" />
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

  const isOwner = currentUser && post.user_id === currentUser.id
  const isClosed = postStatus === "closed"
  const kindLabel = post.kind === "hiring" ? "구인" : "구직"
  const kindClass =
    post.kind === "hiring" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"

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
                <ReportButton
                  targetType="jobs"
                  targetId={post.id}
                  targetUserId={post.user_id}
                  variant="icon"
                />
              )}
              {(isOwner || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 hover:bg-secondary rounded-full transition-colors">
                      <MoreVertical className="w-5 h-5 text-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && !isClosed && (
                      <>
                        <DropdownMenuItem onClick={handleClose}>
                          <CheckCircle className="w-4 h-4 mr-2 text-muted-foreground" />
                          모집마감
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
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
        isClosed ? (
          <Button
            disabled
            size="lg"
            className="flex-1 bg-muted text-muted-foreground cursor-not-allowed"
          >
            모집마감
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleChat}
            disabled={chatLoading}
            className="flex-1 gap-2 bg-teal-600 hover:bg-teal-700 text-white"
          >
            <MessageCircle className="w-5 h-5" />
            {chatLoading ? "연결 중..." : "채팅하기"}
          </Button>
        )
      }
    >
      <DetailGallery
        images={post.images}
        alt={post.title}
        fallbackIcon={Briefcase}
        fallbackLabel="구인구직"
        topLeftBadges={
          <div className="flex gap-1">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium shadow-sm ${kindClass}`}
            >
              <Briefcase className="w-3 h-3" />
              {kindLabel}
            </span>
            {isClosed && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium shadow-sm bg-gray-800 text-white">
                모집마감
              </span>
            )}
          </div>
        }
      />

      <DetailBody>
        <DetailTitleBlock title={post.title} />

        {/* 시급 강조 */}
        <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20">
          <div className="text-sm text-muted-foreground mb-1">시급</div>
          <div className="text-2xl font-bold text-teal-600">
            {(post.hourly_wage || 0).toLocaleString("ko-KR")}원
          </div>
        </div>

        <DetailMeta
          views={post.views}
          likes={post.likes}
          timeAgo={formatDate((post as any).bumped_at ?? post.created_at)}
        />

        {/* 근무 조건 */}
        <DetailSection title="근무 조건">
          <div className="grid grid-cols-2 gap-2">
            {post.work_type && (
              <InfoChip icon={<Briefcase className="w-4 h-4" />} label="근무형태" value={post.work_type} />
            )}
            {post.category && (
              <InfoChip icon={<Briefcase className="w-4 h-4" />} label="카테고리" value={post.category} />
            )}
            {post.work_days && (
              <InfoChip icon={<CalendarDays className="w-4 h-4" />} label="근무일" value={post.work_days} />
            )}
            {post.work_hours && (
              <InfoChip icon={<Clock className="w-4 h-4" />} label="근무시간" value={post.work_hours} />
            )}
          </div>
        </DetailSection>

        <DetailSection title="상세 설명">
          <DetailInfoBox>{post.description}</DetailInfoBox>
        </DetailSection>

        {post && (
          <DetailSection title="근무지">
            <p className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              {post.location}
            </p>
            <AddressMapPreview address={String(post.location || "")} height={220} />
          </DetailSection>
        )}

        {post.contact && (
          <DetailSection title="연락하기">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border">
              <Phone className="w-5 h-5 text-teal-600" />
              {(() => {
                const digits = (post.contact || "").replace(/[^0-9]/g, "")
                const isPhone = digits.length >= 9 && digits.length <= 11 && digits.startsWith("0")
                return isPhone ? (
                  <a href={`tel:${digits}`} className="text-base font-bold text-teal-700 underline">{post.contact}</a>
                ) : (
                  <span className="text-sm font-medium text-foreground">{post.contact}</span>
                )
              })()}
            </div>
          </DetailSection>
        )}

        <DetailSection title="작성자 정보">
          <DetailAuthorCard
            href={`/profile/${post.profiles?.id || post.user_id}`}
            name={post.profiles?.nickname || "익명"}
            avatarUrl={post.profiles?.avatar_url}
            badges={
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                  post.kind === "hiring"
                    ? "text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400"
                    : "text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-400"
                }`}
              >
                <Briefcase className="w-3 h-3" />
                {kindLabel}
              </span>
            }
            userId={post.user_id}
            otherPostsTable="jobs_posts"
            otherPostsLinkPrefix="/jobs"
            otherPostsTitle="이 사용자의 다른 공고"
            excludeId={post.id}
          />
        </DetailSection>
      </DetailBody>
    </DetailShell>
  )
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/40 border border-border">
      <div className="text-teal-600">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-sm font-medium text-foreground truncate">{value}</div>
      </div>
    </div>
  )
}
