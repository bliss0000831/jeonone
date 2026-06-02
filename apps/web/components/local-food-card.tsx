"use client"

import { memo, useState } from "react"
import Link from "next/link"
import { Heart, MapPin, MoreVertical, Trash2, Edit, Eye, ArrowUp } from "lucide-react"
import { FavoriteButton } from "@/components/favorite-button"
import { cn, stripRegionPrefix, formatTimeAgo } from "@/lib/utils"
// BumpDialog 는 모달 — 카드 첫 렌더에 불필요. 메뉴 클릭 시 lazy load.
import dynamic from "next/dynamic"
const BumpDialog = dynamic(() => import("@/components/bump-dialog").then((m) => m.BumpDialog), { ssr: false })
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MediaThumbnail } from "@/components/media-thumbnail"

export interface LocalFoodPost {
  id: string
  title: string
  description?: string
  price: number
  original_price?: number
  unit: string
  category: string
  images: string[]
  location?: string
  district?: string
  user_id: string
  status: string
  view_count: number
  like_count: number
  created_at: string

  bumped_at?: string | null

  effective_at?: string | null
  author?: {
    nickname?: string
    avatar_url?: string
  }
  user_liked?: boolean
}

interface LocalFoodCardProps {
  post: LocalFoodPost
  currentUserId?: string
  isAdmin?: boolean
  isHighlighted?: boolean
  highlightLabel?: string
}

export const LocalFoodCard = memo(function LocalFoodCard({
  post,
  currentUserId,
  isAdmin = false,
  isHighlighted = false,
  highlightLabel = "신선함!"
}: LocalFoodCardProps) {
  const [isLiked, setIsLiked] = useState(post.user_liked || false)
  const [likeCount, setLikeCount] = useState(post.like_count || 0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [bumpOpen, setBumpOpen] = useState(false)

  const isAuthor = currentUserId === post.user_id
  const canManage = isAuthor || isAdmin

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!currentUserId) {
      toast("로그인이 필요합니다")
      return
    }

    const supabase = createClient()
    
    if (isLiked) {
      await supabase
        .from("local_food_likes")
        .delete()
        .eq("user_id", currentUserId)
        .eq("local_food_id", post.id)
      setLikeCount(prev => prev - 1)
    } else {
      await supabase
        .from("local_food_likes")
        .insert({ user_id: currentUserId, local_food_id: post.id })
      setLikeCount(prev => prev + 1)
    }
    setIsLiked(!isLiked)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm("정말 삭제하시겠습니까?")) return
    
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/local-food/${post.id}`, { method: "DELETE" })
      if (res.ok) {
        window.location.reload()
      } else {
        toast.error("삭제에 실패했습니다")
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다")
    } finally {
      setIsDeleting(false)
    }
  }

  const discountPercent = post.original_price && post.original_price > post.price
    ? Math.round((1 - post.price / post.original_price) * 100)
    : 0

  const categoryColors: Record<string, string> = {
    "채소": "bg-green-500",
    "과일": "bg-red-500",
    "쌀/잡곡": "bg-amber-500",
    "축산물": "bg-rose-500",
    "수산물": "bg-blue-500",
    "가공식품": "bg-purple-500",
    "기타": "bg-gray-500"
  }

  return (
    <Link href={`/local-food/${post.id}`} className="block group">
      <div className="bg-card rounded-xl overflow-hidden border border-border hover:border-primary/50 hover:shadow-md transition-all duration-200">
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden">
          {post.images?.[0] ? (
            <MediaThumbnail
              src={post.images[0]}
              alt={post.title}
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 flex items-center justify-center">
              <span className="text-4xl">🥬</span>
            </div>
          )}
          
          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {isHighlighted && (
              <span className="px-2 py-0.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold rounded-full shadow-sm">
                {highlightLabel}
              </span>
            )}
            <span className={cn(
              "px-2 py-0.5 text-white text-xs font-medium rounded-full",
              categoryColors[post.category] || "bg-gray-500"
            )}>
              {post.category}
            </span>
            {post.status === "sold_out" && (
              <span className="px-2 py-0.5 bg-gray-800 text-white text-xs font-medium rounded-full">
                품절
              </span>
            )}
          </div>

          {/* Like Button (통합 스타일) */}
          <FavoriteButton
            kind="local-food"
            targetId={post.id}
            currentUserId={currentUserId}
            initialLiked={isLiked}
            onChange={(next) => {
              setIsLiked(next)
              setLikeCount((prev) => (next ? prev + 1 : Math.max(0, prev - 1)))
            }}
            className="absolute top-2 right-2 z-10"
          />

          {/* Discount Badge */}
          {discountPercent > 0 && (
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-lg">
              {discountPercent}%
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-3">
          <h3 className="font-semibold text-foreground text-sm line-clamp-2 mb-1 leading-snug group-hover:text-primary transition-colors">
            {post.title}
          </h3>
          
          {/* Price */}
          <div className="flex items-baseline gap-1.5 mb-2">
            {post.original_price && post.original_price > post.price && (
              <span className="text-xs text-muted-foreground line-through">
                {post.original_price.toLocaleString()}원
              </span>
            )}
            <span className="text-base font-bold text-primary">
              {post.price.toLocaleString()}원
            </span>
            <span className="text-xs text-muted-foreground">/{post.unit}</span>
          </div>

          {/* Location */}
          {post.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{stripRegionPrefix(post.location)}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
            <span>{formatTimeAgo(post.effective_at ?? post.bumped_at ?? post.created_at)}</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {post.view_count ?? 0}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {likeCount}
              </span>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                      aria-label="더보기 메뉴"
                      className="p-2 -m-0.5 hover:bg-secondary rounded"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isAuthor && (
                      <DropdownMenuItem
                        onClick={(e) => e.stopPropagation()}
                        onSelect={() => setBumpOpen(true)}
                      >
                        <ArrowUp className="w-4 h-4 mr-2" />
                        올리기
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href={`/local-food/${post.id}/edit`} className="flex items-center gap-2">
                        <Edit className="w-4 h-4" />
                        수정
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="text-red-500 focus:text-red-500"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>
      {isAuthor && (
        <BumpDialog
          open={bumpOpen}
          onClose={() => setBumpOpen(false)}
          targetType="local_food"
          targetId={post.id}
        />
      )}
    </Link>
  )
})
