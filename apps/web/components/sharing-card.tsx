"use client"

import Link from "next/link"
import { MapPin, Eye, Heart, MoreVertical, Pencil, Trash2, Loader2, Award, CheckCircle } from "lucide-react"
import { FavoriteButton } from "@/components/favorite-button"
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

export interface SharingPost {
  id: string
  user_id: string
  title: string
  description: string
  category: string
  images: string[] | null
  status: "active" | "reserved" | "completed"
  location: string | null
  created_at: string
  views: number
  likes: number
  profiles?: {
    nickname: string | null
    avatar_url: string | null
  }
}

interface SharingCardProps {
  post: SharingPost
  currentUserId?: string
  isAdmin?: boolean
  isHighlighted?: boolean
  highlightLabel?: string
}

const statusLabels: Record<string, { label: string; className: string }> = {
  active: { label: "나눔중", className: "bg-green-500 text-white" },
  reserved: { label: "예약중", className: "bg-yellow-500 text-white" },
  completed: { label: "나눔완료", className: "bg-muted text-muted-foreground" }
}

export const SharingCard = memo(function SharingCard({ post, currentUserId, isAdmin = false, isHighlighted = false, highlightLabel = "우리동네 나눔왕!" }: SharingCardProps) {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(post.status)
  
  const status = statusLabels[currentStatus] || statusLabels.active
  const timeAgo = getTimeAgo(post.created_at)
  const isOwner = currentUserId && post.user_id === currentUserId

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm("정말로 이 글을 삭제하시겠습니까?")) return
    
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/sharing/${post.id}`, {
        method: "DELETE"
      })
      if (response.ok) {
        setIsDeleted(true)
      } else {
        toast.error("삭제에 실패했습니다")
      }
    } catch (error) {
      toast.error("삭제 중 오류가 발생했습니다")
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.location.href = `/sharing/${post.id}/edit`
  }

  const handleComplete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const response = await fetch(`/api/sharing/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      })
      if (response.ok) {
        setCurrentStatus("completed")
      } else {
        toast.error("상태 변경 실패")
      }
    } catch {
      toast.error("오류가 발생했습니다")
    }
  }

  const handleReopen = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const response = await fetch(`/api/sharing/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      })
      if (response.ok) {
        setCurrentStatus("active")
      } else {
        toast.error("상태 변경 실패")
      }
    } catch {
      toast.error("오류가 발생했습니다")
    }
  }

  if (isDeleted) {
    return null
  }

  return (
    <Link href={`/sharing/${post.id}`} className="block group">
      <div className={cn(
        "bg-card rounded-xl border overflow-hidden hover:shadow-md transition-all duration-200 relative",
        isHighlighted
          ? "border-2 border-rose-500 ring-2 ring-rose-500/20"
          : "border-border hover:border-primary/50"
      )}>
        {/* Highlight Badge */}
        {isHighlighted && (
          <div className="absolute top-0 left-0 z-30 bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-br-xl flex items-center gap-1">
            <Award className="w-3 h-3" />
            {highlightLabel}
          </div>
        )}
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {post.images?.[0] ? (
            <MediaThumbnail
              src={post.images[0]}
              alt={post.title}
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Heart className="w-12 h-12 opacity-30" />
            </div>
          )}
          
          {/* Status Badge */}
          <div className={cn("absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-medium", status.className)}>
            {status.label}
          </div>

          {/* Like Button (통합 스타일) */}
          <FavoriteButton
            kind="sharing"
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
          
          <p className="text-xs text-muted-foreground line-clamp-1">
            {post.description}
          </p>

          {post.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{stripRegionPrefix(post.location)}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {post.views}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {post.likes}
              </span>
              {/* 본인 글 또는 관리자인 경우 점 세개 메뉴 */}
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
                    {isOwner && currentStatus !== "completed" && (
                      <DropdownMenuItem onClick={handleComplete}>
                        <CheckCircle className="w-4 h-4 mr-2 text-gray-500" />
                        나눔완료
                      </DropdownMenuItem>
                    )}
                    {isOwner && currentStatus === "completed" && (
                      <DropdownMenuItem onClick={handleReopen}>
                        <CheckCircle className="w-4 h-4 mr-2 text-primary" />
                        나눔중으로 변경
                      </DropdownMenuItem>
                    )}
                    {(isOwner || isAdmin) && (
                      <DropdownMenuSeparator />
                    )}
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
