"use client"

import Link from "next/link"
import { MapPin, Clock, MoreVertical, Pencil, Trash2, Loader2, Briefcase, Eye, Heart } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, stripRegionPrefix } from "@/lib/utils"
import { toast } from "sonner"
import { memo, useState } from "react"
import { MediaThumbnail } from "@/components/media-thumbnail"
import { timeAgoKo as getTimeAgo } from "@/components/listing/time-ago"

export interface JobsPost {
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
  images: string[] | null
  status: "active" | "closed" | "hidden"
  views: number
  likes: number
  created_at: string

  bumped_at?: string | null

  effective_at?: string | null
  profiles?: {
    nickname: string | null
    avatar_url: string | null
  }
}

interface JobsCardProps {
  post: JobsPost
  currentUserId?: string
  isAdmin?: boolean
}

const kindStyles: Record<string, { label: string; className: string }> = {
  hiring: { label: "구인", className: "bg-blue-500 text-white" },
  seeking: { label: "구직", className: "bg-purple-500 text-white" },
}

export function formatWage(n: number): string {
  if (!n && n !== 0) return ""
  return `${n.toLocaleString("ko-KR")}\uC6D0`
}

export const JobsCard = memo(function JobsCard({ post, currentUserId, isAdmin = false }: JobsCardProps) {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(post.status)

  const kind = kindStyles[post.kind] || kindStyles.hiring
  const isClosed = currentStatus === "closed"
  const isOwner = currentUserId && post.user_id === currentUserId

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm("정말로 이 글을 삭제하시겠습니까?")) return
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/jobs/${post.id}`, { method: "DELETE" })
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
    window.location.href = `/jobs/${post.id}/edit`
  }

  const handleClose = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const response = await fetch(`/api/jobs/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      })
      if (response.ok) setCurrentStatus("closed")
      else toast.error("상태 변경 실패")
    } catch {
      toast.error("오류가 발생했습니다")
    }
  }

  const handleReopen = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const response = await fetch(`/api/jobs/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      })
      if (response.ok) setCurrentStatus("active")
      else toast.error("상태 변경 실패")
    } catch {
      toast.error("오류가 발생했습니다")
    }
  }

  if (isDeleted) return null

  return (
    <Link href={`/jobs/${post.id}`} className="block group">
      <div
        className={cn(
          "bg-card rounded-xl border border-border hover:border-primary/50 overflow-hidden hover:shadow-md transition-all duration-200 relative",
          isClosed && "opacity-60"
        )}
      >
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {post.images?.[0] ? (
            <MediaThumbnail
              src={post.images[0]}
              alt={post.title}
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-teal-500/10 text-teal-600">
              <Briefcase className="w-12 h-12 opacity-60" />
            </div>
          )}

          {/* Kind Badge */}
          <div className="absolute top-2 left-2 flex gap-1">
            <span className={cn("px-2 py-1 rounded-md text-xs font-medium", kind.className)}>
              {kind.label}
            </span>
            {post.category && (
              <span className="px-2 py-1 rounded-md text-xs font-medium bg-background/80 backdrop-blur text-foreground">
                {post.category}
              </span>
            )}
          </div>

          {/* Closed Badge */}
          {isClosed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="px-3 py-1.5 rounded-md text-sm font-bold bg-gray-800 text-white">
                모집마감
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors text-sm leading-snug">
            {post.title}
          </h3>

          <div className="text-sm font-bold text-teal-600">
            시급 {formatWage(post.hourly_wage)}
          </div>

          {(post.work_hours || post.location) && (
            <div className="space-y-1">
              {post.work_hours && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span className="truncate">{post.work_hours}</span>
                </div>
              )}
              {post.location && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{stripRegionPrefix(post.location)}</span>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">{getTimeAgo(post.effective_at ?? post.bumped_at ?? post.created_at)}</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {post.views}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {post.likes ?? 0}
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
                    {isOwner && currentStatus === "active" && (
                      <DropdownMenuItem onClick={handleClose}>모집마감</DropdownMenuItem>
                    )}
                    {isOwner && currentStatus === "closed" && (
                      <DropdownMenuItem onClick={handleReopen}>다시 모집하기</DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {(isOwner || isAdmin) && (
                      <DropdownMenuItem onClick={handleEdit}>
                        <Pencil className="w-4 h-4 mr-2" />
                        수정하기
                      </DropdownMenuItem>
                    )}
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
