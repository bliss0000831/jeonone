"use client"

import Link from "next/link"
import { MapPin, Calendar, Store, Sparkles, MoreVertical, Pencil, Trash2, Loader2, Megaphone, Eye, ArrowUp } from "lucide-react"
import { FavoriteButton } from "@/components/favorite-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, stripRegionPrefix, formatTimeAgo } from "@/lib/utils"
// BumpDialog 는 모달 — 카드 첫 렌더에 불필요. 메뉴 클릭 시 lazy load.
import dynamic from "next/dynamic"
const BumpDialog = dynamic(() => import("@/components/bump-dialog").then((m) => m.BumpDialog), { ssr: false })
import { toast } from "sonner"
import { memo, useState } from "react"
import { MediaThumbnail } from "@/components/media-thumbnail"

export interface NewStorePost {
  id: string
  user_id: string
  store_name: string
  description: string
  category: string
  address: string
  phone: string | null
  opening_date: string | null
  opening_event: string | null
  images: string[] | null
  status: "active" | "closed"
  created_at: string

  bumped_at?: string | null

  effective_at?: string | null
  views: number
  likes: number
  profiles?: {
    nickname: string | null
    avatar_url: string | null
  }
}

interface NewStoreCardProps {
  post: NewStorePost
  currentUserId?: string
  isAdmin?: boolean
  isHighlighted?: boolean
  highlightLabel?: string
}

export const NewStoreCard = memo(function NewStoreCard({ post, currentUserId, isAdmin = false, isHighlighted = false, highlightLabel = "소문난가게!" }: NewStoreCardProps) {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [bumpOpen, setBumpOpen] = useState(false)
  
  const openingDateFormatted = post.opening_date 
    ? new Date(post.opening_date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
    : null
  const isOwner = currentUserId && post.user_id === currentUserId

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm("정말로 이 글을 삭제하시겠습니까?")) return
    
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/new-store/${post.id}`, {
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
    window.location.href = `/new-store/${post.id}/edit`
  }

  if (isDeleted) {
    return null
  }

  return (
    <Link href={`/new-store/${post.id}`} className="block group">
      <div className={cn(
        "bg-card rounded-xl border overflow-hidden hover:shadow-md transition-all duration-200 relative",
        isHighlighted
          ? "border-2 border-rose-500 ring-2 ring-rose-500/20"
          : "border-border hover:border-primary/50"
      )}>
        {/* Highlight Badge */}
        {isHighlighted && (
          <div className="absolute top-0 left-0 z-30 bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-br-xl flex items-center gap-1">
            <Megaphone className="w-3 h-3" />
            {highlightLabel}
          </div>
        )}
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {post.images?.[0] ? (
            <MediaThumbnail
              src={post.images[0]}
              alt={post.store_name}
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Store className="w-12 h-12 opacity-30" />
            </div>
          )}
          
          {/* New Badge */}
          <div className="absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-medium bg-red-500 text-white flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            신장개업
          </div>

          {/* Category Badge */}
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md text-xs font-medium bg-black/70 text-white">
            {post.category}
          </div>

          {/* Favorite Button (통합 스타일) */}
          <FavoriteButton
            kind="new-store"
            targetId={post.id}
            currentUserId={currentUserId}
            className="absolute top-2 right-2 z-10"
          />
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors text-sm leading-snug">
            {post.store_name}
          </h3>
          
          <p className="text-xs text-muted-foreground line-clamp-1">
            {post.description}
          </p>

          {/* Opening Event */}
          {post.opening_event && (
            <div className="px-2 py-1.5 bg-primary/10 rounded-md">
              <p className="text-xs text-primary font-medium line-clamp-1">
                {post.opening_event}
              </p>
            </div>
          )}

          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{stripRegionPrefix(post.address)}</span>
            </div>
            
            {openingDateFormatted && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                <span>{openingDateFormatted} 오픈</span>
              </div>
            )}
          </div>

          {/* Footer — 시간 + 조회수 (+ 작성자/관리자 메뉴) */}
          <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
            <span>{formatTimeAgo(post.effective_at ?? post.bumped_at ?? post.created_at)}</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {post.views ?? 0}
              </span>
              {(isOwner || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                      aria-label="더보기 메뉴"
                      className="p-1 hover:bg-secondary rounded-full transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && (
                      <DropdownMenuItem
                        onClick={(e) => e.stopPropagation()}
                        onSelect={() => setBumpOpen(true)}
                      >
                        <ArrowUp className="w-4 h-4 mr-2" />
                        올리기
                      </DropdownMenuItem>
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
      {isOwner && (
        <BumpDialog
          open={bumpOpen}
          onClose={() => setBumpOpen(false)}
          targetType="new_store"
          targetId={post.id}
        />
      )}
    </Link>
  )
})
