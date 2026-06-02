"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import {
  MessageCircle,
  Gift,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle,
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
import { ReportButton } from "@/components/report-button"
import { usePostChat } from "@/hooks/use-post-chat"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

interface SharingPost {
  id: string
  user_id: string
  title: string
  description: string
  images: string[]
  status: string
  location: string
  views: number
  likes: number
  created_at: string
  profiles?: {
    id: string
    nickname: string
    avatar_url: string | null
  }
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  available: {
    label: "나눔중",
    className: "bg-green-500 text-white",
  },
  reserved: {
    label: "예약중",
    className: "bg-yellow-500 text-white",
  },
  completed: {
    label: "나눔완료",
    className: "bg-gray-500 text-white",
  },
}

export default function SharingDetailPage() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const confirm = useConfirm()
  const [post, setPost] = useState<SharingPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [postStatus, setPostStatus] = useState<string>("available")
  const [isAdmin, setIsAdmin] = useState(false)
  const { handleChat, chatLoading } = usePostChat({
    postId: typeof id === "string" ? id : undefined,
    postType: "sharing",
    authorId: post?.user_id ?? post?.profiles?.id ?? null,
    currentUserId: currentUser?.id ?? null,
    loginRedirectPath: typeof id === "string" ? `/sharing/${id}` : undefined,
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
      // post + profiles inline join 으로 round-trip 1회 절감
      let q: any = supabase
        .from("sharing_posts")
        .select("*, profiles:user_id(id, nickname, avatar_url)")
        .eq("id", id)
      if (plaza) q = q.eq("plaza_id", plaza)
      // user 의 favorite 조회는 post 와 독립이므로 Promise.all 로 병렬
      const favPromise = user
        ? supabase
            .from("sharing_likes")
            .select("id")
            .eq("user_id", user.id)
            .eq("post_id", id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any)

      const [{ data }, { data: fav }] = await Promise.all([q.single(), favPromise])

      if (data) {
        setPost(data as SharingPost)
        setPostStatus(data.status || "available")
        if (user) setIsLiked(!!fav)

        // 조회수 +1 — atomic RPC (race-free)
        void supabase.rpc('increment_view_count', { p_table: 'sharing_posts', p_id: id, p_column: 'views' })
      }
      setLoading(false)
    }
    fetchPost()
  }, [id])

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
    setIsLiked(next) // 낙관적 업데이트
    try {
      const supabase = createClient()
      if (next) {
        const { error: insErr } = await supabase
          .from("sharing_likes")
          .insert({ user_id: currentUser.id, post_id: id })
        if (insErr && (insErr as any).code !== "23505") throw insErr
        const { error: updErr } = await supabase
          .from("sharing_posts")
          .update({ likes: (post?.likes || 0) + 1 })
          .eq("id", id)
        if (updErr) throw updErr
      } else {
        const { error: delErr } = await supabase
          .from("sharing_likes")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("post_id", id)
        if (delErr) throw delErr
        const { error: updErr } = await supabase
          .from("sharing_posts")
          .update({ likes: Math.max(0, (post?.likes || 1) - 1) })
          .eq("id", id)
        if (updErr) throw updErr
      }
    } catch (e) {
      console.error("[sharing like]", e)
      setIsLiked(prev) // 롤백
      toast.error("좋아요 처리에 실패했어요. 다시 시도해주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  const handleComplete = async () => {
    if (!(await confirm({ description: "나눔을 완료 처리하시겠습니까?" }))) return
    const supabase = createClient()
    const { error } = await supabase
      .from("sharing_posts")
      .update({ status: "completed" })
      .eq("id", id)
    if (error) {
      toast.error("상태 변경에 실패했습니다. 다시 시도해주세요.")
    } else {
      setPostStatus("completed")
      toast.success("나눔이 완료 처리되었습니다.")
    }
  }

  const handleEdit = () => router.push(`/sharing/${id}/edit`)

  const handleDelete = async () => {
    if (!(await confirm({ description: "정말로 삭제하시겠습니까?", destructive: true }))) return
    const supabase = createClient()
    await supabase.from("sharing_posts").delete().eq("id", id)
    router.push("/sharing")
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const days = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    )
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
        <Gift className="w-12 h-12 text-muted-foreground mb-4" />
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

  const status = STATUS_BADGES[postStatus] || STATUS_BADGES.available
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
                <ReportButton targetType="sharing" targetId={post.id} variant="icon" />
              )}
              {(isOwner || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 hover:bg-secondary rounded-full transition-colors">
                      <MoreVertical className="w-5 h-5 text-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && !isCompleted && (
                      <>
                        <DropdownMenuItem onClick={handleComplete}>
                          <CheckCircle className="w-4 h-4 mr-2 text-muted-foreground" />
                          나눔완료
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
        isCompleted ? (
          <Button
            disabled
            size="lg"
            className="flex-1 bg-muted text-muted-foreground cursor-not-allowed"
          >
            나눔완료
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleChat}
            disabled={chatLoading}
            className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
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
        fallbackIcon={Gift}
        fallbackLabel="나눔"
        topLeftBadges={
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium shadow-sm ${status.className}`}
          >
            <Gift className="w-3 h-3" />
            {status.label}
          </span>
        }
      />

      <DetailBody>
        <DetailTitleBlock title={post.title} />

        <DetailMeta
          views={post.views}
          likes={post.likes}
          timeAgo={formatDate(post.created_at)}
        />

        <DetailSection title="나눔 설명">
          <DetailInfoBox>{post.description}</DetailInfoBox>
        </DetailSection>

        {post && (
          <DetailSection title="나눔 위치">
            <p className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              {post.location}
            </p>
            <AddressMapPreview address={String(post.location || "")} height={220} />
          </DetailSection>
        )}

        <DetailSection title="나눔자 정보">
          <DetailAuthorCard
            href={`/profile/${post.profiles?.id || post.user_id}`}
            name={post.profiles?.nickname || "익명"}
            avatarUrl={post.profiles?.avatar_url}
            badges={
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-400 px-2 py-0.5 rounded-full">
                <Gift className="w-3 h-3" />
                나눔
              </span>
            }
            userId={post.user_id}
            otherPostsTable="sharing_posts"
            otherPostsLinkPrefix="/sharing"
            otherPostsTitle="이 나눔자의 다른 나눔"
            excludeId={post.id}
          />
        </DetailSection>
      </DetailBody>
    </DetailShell>
  )
}
