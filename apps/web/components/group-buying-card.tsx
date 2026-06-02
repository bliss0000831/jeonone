"use client"

import Link from "next/link"
import { MapPin, Users, Clock, ShoppingCart, MoreVertical, Pencil, Trash2, Loader2, TrendingDown, Eye, Heart, ArrowUp } from "lucide-react"
import { FavoriteButton } from "@/components/favorite-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, stripRegionPrefix, formatTimeAgo } from "@/lib/utils"
import { useCountdown } from "@/hooks/use-countdown"
// BumpDialog 는 모달 — 카드 첫 렌더에 불필요. 메뉴 클릭 시 lazy load.
import dynamic from "next/dynamic"
const BumpDialog = dynamic(() => import("@/components/bump-dialog").then((m) => m.BumpDialog), { ssr: false })
import { toast } from "sonner"
import { memo, useState, useMemo } from "react"
import { MediaThumbnail } from "@/components/media-thumbnail"

export interface GroupBuyingPost {
  id: string
  user_id: string
  title: string
  description: string
  product_name: string
  original_price: number | null
  group_price: number
  min_participants: number
  max_participants: number | null
  current_participants: number
  deadline: string | null
  images: string[] | null
  status: "recruiting" | "confirmed" | "completed" | "cancelled"
  location: string | null
  created_at: string

  bumped_at?: string | null

  effective_at?: string | null
  views: number
  visibility?: "plaza" | "national" | null
  plaza_id?: string | null
  delivery_fee?: number | null
  delivery_fee_mode?: "separate" | "included" | "split" | "free" | null
  profiles?: {
    nickname: string | null
    avatar_url: string | null
  }
}

interface GroupBuyingCardProps {
  post: GroupBuyingPost
  currentUserId?: string
  isAdmin?: boolean
  isHighlighted?: boolean
  highlightLabel?: string
}

const statusLabels: Record<string, { label: string; className: string }> = {
  recruiting: { label: "모집중", className: "bg-primary text-primary-foreground" },
  confirmed: { label: "모집완료", className: "bg-blue-500 text-white" },
  completed: { label: "거래완료", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "취소됨", className: "bg-destructive text-destructive-foreground" }
}

export const GroupBuyingCard = memo(function GroupBuyingCard({ post, currentUserId, isAdmin = false, isHighlighted = false, highlightLabel = "대박 할인율!" }: GroupBuyingCardProps) {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [bumpOpen, setBumpOpen] = useState(false)
  
  const status = statusLabels[post.status] || statusLabels.recruiting
  const isOwner = currentUserId && post.user_id === currentUserId

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm("정말로 이 글을 삭제하시겠습니까?")) return
    
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/group-buying/${post.id}`, {
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
    window.location.href = `/group-buying/${post.id}/edit`
  }

  if (isDeleted) {
    return null
  }

  const progress = post.max_participants 
    ? Math.min((post.current_participants / post.max_participants) * 100, 100)
    : (post.current_participants / post.min_participants) * 100
  const daysLeft = post.deadline ? getDaysLeft(post.deadline) : null
  // M19: 마감 24시간 이내 시:분:초 카운트다운
  const countdown = useCountdown(post.status === "recruiting" ? post.deadline : null)
  
  // Calculate discount percentage
  const discountPercent = post.original_price && post.original_price > 0
    ? Math.round(((post.original_price - post.group_price) / post.original_price) * 100)
    : 0

  return (
    <Link href={`/group-buying/${post.id}`} className="block group">
      <div className={cn(
        "bg-card rounded-xl border overflow-hidden hover:shadow-md transition-all duration-200 relative",
        isHighlighted
          ? "border-2 border-rose-500 ring-2 ring-rose-500/20"
          : "border-border hover:border-primary/50"
      )}>
        {/* Highlight Badge */}
        {isHighlighted && (
          <div className="absolute top-0 left-0 z-30 bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-br-xl flex items-center gap-1">
            <TrendingDown className="w-3 h-3" />
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
              <ShoppingCart className="w-12 h-12 opacity-30" />
            </div>
          )}
          
          {/* Status Badge + 전국 공구 + 마감임박 + 1명만 더 */}
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
            <div className={cn("px-2 py-1 rounded-md text-xs font-medium", status.className)}>
              {status.label}
            </div>
            {post.visibility === "national" && (
              <div className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm">
                🌐 전국
              </div>
            )}
            {/* 마감 임박 — 24시간 이내 */}
            {post.status === "recruiting" && daysLeft !== null && daysLeft <= 1 && (
              <div className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-white shadow-sm animate-pulse">
                🔥 마감임박
              </div>
            )}
            {/* 1명만 더 */}
            {post.status === "recruiting" &&
              post.min_participants &&
              post.current_participants > 0 &&
              post.min_participants - post.current_participants === 1 && (
                <div className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-white shadow-sm">
                  ⚡ 1명만 더!
                </div>
              )}
          </div>

          {/* Deadline Badge — M19: 24h 이내 실시간 카운트다운 */}
          {countdown.label && post.status === "recruiting" && (
            <div className={cn(
              "absolute bottom-2 right-2 px-2 py-1 rounded-md text-xs font-medium text-white flex items-center gap-1",
              countdown.isUrgent ? "bg-rose-600/90 animate-pulse" : "bg-black/70",
            )}>
              <Clock className="w-3 h-3" />
              {countdown.label}
            </div>
          )}

          {/* Favorite Button (통합 스타일) */}
          <FavoriteButton
            kind="group-buying"
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

          {/* Price */}
          <div className="flex items-center gap-2">
            {post.original_price && (
              <span className="text-xs text-muted-foreground line-through">
                {post.original_price.toLocaleString()}원
              </span>
            )}
            <span className="text-sm font-bold text-primary">
              {post.group_price.toLocaleString()}원
            </span>
            {discountPercent > 0 && (
              <span className="text-xs font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                {discountPercent}%
              </span>
            )}
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-3 h-3" />
                {post.current_participants}/{post.max_participants || post.min_participants}명
              </span>
              <span className="text-primary font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>

          {post.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{stripRegionPrefix(post.location)}</span>
            </div>
          )}

          {/* Footer — 시간 + 조회수 (+ 작성자/관리자 메뉴) */}
          <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
            <span>{formatTimeAgo(post.effective_at ?? post.bumped_at ?? post.created_at)}</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {post.views ?? 0}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {(post as any).like_count ?? (post as any).likes ?? 0}
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
          targetType="group_buying"
          targetId={post.id}
        />
      )}
    </Link>
  )
})

function getDaysLeft(deadline: string): number {
  const now = new Date()
  const deadlineDate = new Date(deadline)
  const diffInDays = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diffInDays)
}
