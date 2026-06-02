"use client"

import Link from "next/link"
import { MapPin, Calendar, Users, MoreVertical, Pencil, Trash2, Loader2, Clock, Eye, Heart } from "lucide-react"
import { FavoriteButton } from "@/components/favorite-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, stripRegionPrefix, formatTimeAgo } from "@/lib/utils"
import { toast } from "sonner"
import { memo, useState } from "react"
import { MediaThumbnail } from "@/components/media-thumbnail"

export interface ClubPost {
  id: string
  user_id: string
  title: string
  description: string | null
  content: string | null
  category: string
  sport_type: string | null
  location: string | null
  district: string | null
  meeting_date: string | null
  meeting_time: string | null
  current_members: number
  max_members: number
  skill_level: string
  status: "recruiting" | "full" | "closed"
  images: string[] | null
  view_count: number
  like_count: number
  fee?: number | null
  created_at: string
  profiles?: {
    nickname: string | null
    avatar_url: string | null
  }
}

interface ClubCardProps {
  post: ClubPost
  currentUserId?: string
  isAdmin?: boolean
}

const SPORT_ICON: Record<string, string> = {
  "러닝": "🏃",
  "배드민턴": "🏸",
  "축구": "⚽",
  "농구": "🏀",
  "테니스": "🎾",
  "등산": "⛰️",
  "수영": "🏊",
  "자전거": "🚴",
  "요가": "🧘",
  "기타": "🎯",
}

// 종목별 Unsplash 기본 이미지 (저작권 무료)
const SPORT_THUMB: Record<string, string> = {
  "러닝": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&h=280&fit=crop",
  "마라톤": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&h=280&fit=crop",
  "조깅": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&h=280&fit=crop",
  "축구": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=280&fit=crop",
  "풋살": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=280&fit=crop",
  "배드민턴": "https://images.unsplash.com/photo-1521537634581-0dced2fee2ef?w=400&h=280&fit=crop",
  "농구": "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&h=280&fit=crop",
  "테니스": "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=280&fit=crop",
  "등산": "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&h=280&fit=crop",
  "수영": "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400&h=280&fit=crop",
  "자전거": "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=400&h=280&fit=crop",
  "요가": "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=280&fit=crop",
  "헬스": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=280&fit=crop",
  "골프": "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=400&h=280&fit=crop",
  "볼링": "https://images.unsplash.com/photo-1553306832-db8b67918826?w=400&h=280&fit=crop",
  "탁구": "https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?w=400&h=280&fit=crop",
  "배구": "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400&h=280&fit=crop",
  "야구": "https://images.unsplash.com/photo-1529768167801-9173d94c2a42?w=400&h=280&fit=crop",
  "복싱": "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400&h=280&fit=crop",
  "기타": "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=280&fit=crop",
}
function pickSportThumb(sport?: string | null, category?: string | null, title?: string | null): string | null {
  const probes = [sport, category, title].filter(Boolean) as string[]
  for (const text of probes) {
    for (const key of Object.keys(SPORT_THUMB)) {
      if (text.includes(key)) return SPORT_THUMB[key]
    }
  }
  return SPORT_THUMB["기타"]
}

const SKILL_COLOR: Record<string, string> = {
  "누구나": "bg-white/90 text-gray-700",
  "초급": "bg-green-500 text-white",
  "중급": "bg-yellow-500 text-white",
  "고급": "bg-red-500 text-white",
}

export const ClubCard = memo(function ClubCard({ post, currentUserId, isAdmin = false }: ClubCardProps) {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)

  const isOwner = currentUserId && post.user_id === currentUserId
  const isFull = post.current_members >= post.max_members
  const isClosed = post.status === "closed"
  const fillPercent = Math.min((post.current_members / post.max_members) * 100, 100)

  const meetingDateFormatted = post.meeting_date
    ? new Date(post.meeting_date).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })
    : null

  const sportIcon = SPORT_ICON[post.sport_type || ""] || SPORT_ICON["기타"]

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm("정말로 이 모임을 삭제하시겠습니까?")) return
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/clubs/${post.id}`, { method: "DELETE" })
      if (response.ok) setIsDeleted(true)
      else toast.error("삭제에 실패했습니다")
    } catch {
      toast.error("삭제 중 오류가 발생했습니다")
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.location.href = `/clubs/${post.id}/edit`
  }

  if (isDeleted) return null

  return (
    <Link href={`/clubs/${post.id}`} className="block group">
      <div className={cn(
        "bg-card rounded-xl border overflow-hidden hover:shadow-md transition-all duration-200 relative",
        isFull || isClosed
          ? "border-border opacity-80"
          : "border-border hover:border-primary/50"
      )}>
        {/* Top image or gradient */}
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
          <MediaThumbnail
            src={post.images?.[0] || pickSportThumb(post.sport_type, post.category, post.title) || ""}
            alt={post.title}
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />

          {/* Status badge */}
          <div className="absolute top-2 left-2">
            {isClosed ? (
              <span className="px-2 py-1 rounded-md text-xs font-bold bg-black/70 text-white">마감</span>
            ) : isFull ? (
              <span className="px-2 py-1 rounded-md text-xs font-bold bg-rose-500 text-white">마감</span>
            ) : (
              <span className="px-2 py-1 rounded-md text-xs font-bold bg-primary text-primary-foreground">모집중</span>
            )}
          </div>

          {/* Skill level */}
          <div className="absolute bottom-2 left-2">
            <span className={cn("px-2 py-1 rounded-md text-xs font-medium", SKILL_COLOR[post.skill_level] || SKILL_COLOR["누구나"])}>
              {post.skill_level}
            </span>
          </div>

          {/* Favorite Button (통합 스타일) */}
          <FavoriteButton
            kind="club"
            targetId={post.id}
            currentUserId={currentUserId}
            className="absolute top-2 right-2 z-10"
          />
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors text-sm leading-snug">
            {post.title}
          </h3>

          {post.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{post.description}</p>
          )}

          <div className="space-y-1 text-xs text-muted-foreground">
            {post.location && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{stripRegionPrefix(post.location)}</span>
              </div>
            )}
            {meetingDateFormatted && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                <span>{meetingDateFormatted}</span>
                {post.meeting_time && (
                  <>
                    <Clock className="w-3 h-3 flex-shrink-0 ml-1" />
                    <span>{post.meeting_time}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Member progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-3 h-3" />
                참여 현황
              </span>
              <span className={cn("font-semibold", isFull ? "text-rose-500" : "text-primary")}>
                {post.current_members}/{post.max_members}명
              </span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", isFull ? "bg-rose-500" : "bg-primary")}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          </div>

          {/* Footer — 시간 + 조회수 + 좋아요 + 메뉴 */}
          <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
            <span>{formatTimeAgo(post.created_at)}</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {post.view_count ?? 0}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {post.like_count ?? 0}
              </span>
              {(isOwner || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                      aria-label="더보기 메뉴"
                      className="p-1 hover:bg-secondary rounded-full transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleEdit}>
                      <Pencil className="w-4 h-4 mr-2" />수정하기
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleDelete}
                      disabled={deleteLoading}
                      className="text-destructive focus:text-destructive"
                    >
                      {deleteLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      삭제하기
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
})
