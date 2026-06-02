"use client"

import Link from "next/link"
import { MapPin, Eye, Heart, MoreVertical, Pencil, Trash2, Loader2, ShoppingBag, CheckCircle, ArrowUp } from "lucide-react"
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
// BumpDialog 는 모달 — 카드 첫 렌더에 불필요. 메뉴 클릭 시 lazy load.
import dynamic from "next/dynamic"
const BumpDialog = dynamic(() => import("@/components/bump-dialog").then((m) => m.BumpDialog), { ssr: false })

export interface SecondhandPost {
  id: string
  user_id: string
  title: string
  description: string
  category: string
  price: number
  is_price_negotiable: boolean
  images: string[] | null
  status: "active" | "reserved" | "completed" | "hidden"
  location: string | null
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

interface SecondhandCardProps {
  post: SecondhandPost
  currentUserId?: string
  isAdmin?: boolean
}

const statusLabels: Record<string, { label: string; className: string }> = {
  active: { label: "판매중", className: "bg-amber-500 text-white" },
  reserved: { label: "예약중", className: "bg-yellow-500 text-white" },
  completed: { label: "판매완료", className: "bg-gray-500 text-white" },
  hidden: { label: "숨김", className: "bg-red-500 text-white" },
}

export function formatPrice(price: number): string {
  if (!price || price <= 0) return "무료나눔"
  // 가격 표기 통일 — 공구/맛집 카드와 동일하게 "30,000원" (₩ 접두 대신 원 접미)
  return `${price.toLocaleString("ko-KR")}원`
}

export const SecondhandCard = memo(function SecondhandCard({ post, currentUserId, isAdmin = false }: SecondhandCardProps) {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(post.status)
  const [bumpOpen, setBumpOpen] = useState(false)

  const status = statusLabels[currentStatus] || statusLabels.active
  const timeAgo = getTimeAgo(post.effective_at ?? post.bumped_at ?? post.created_at)
  const isOwner = currentUserId && post.user_id === currentUserId
  const isCompleted = currentStatus === "completed"

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm("정말로 이 글을 삭제하시겠습니까?")) return
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/secondhand/${post.id}`, { method: "DELETE" })
      if (response.ok) {
        setIsDeleted(true)
      } else {
        toast.error("삭제에 실패했습니다")
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다")
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.location.href = `/secondhand/${post.id}/edit`
  }

  const handleStatusChange = async (e: React.MouseEvent, next: "active" | "reserved" | "completed") => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const response = await fetch(`/api/secondhand/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (response.ok) setCurrentStatus(next)
      else toast.error("상태 변경 실패")
    } catch {
      toast.error("오류가 발생했습니다")
    }
  }

  if (isDeleted) return null

  return (
    <Link href={`/secondhand/${post.id}`} className="block group">
      <div className="bg-card rounded-xl border border-border hover:border-primary/50 overflow-hidden hover:shadow-md transition-all duration-200 relative">
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {post.images?.[0] ? (
            <MediaThumbnail
              src={post.images[0]}
              alt={post.title}
              className={cn(
                "object-cover group-hover:scale-105 transition-transform duration-300",
                isCompleted && "opacity-50 grayscale",
              )}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ShoppingBag className="w-12 h-12 opacity-30" />
            </div>
          )}

          {/* Status Badge */}
          <div className={cn("absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-medium", status.className)}>
            {status.label}
          </div>

          {/* Like Button */}
          <FavoriteButton
            kind="secondhand"
            targetId={post.id}
            currentUserId={currentUserId}
            className="absolute top-2 right-2 z-10"
          />
        </div>

        {/* Info */}
        <div className="p-3 space-y-1.5">
          <h3 className="font-semibold text-foreground line-clamp-2 text-sm leading-snug group-hover:text-primary transition-colors">
            {post.title}
          </h3>

          {/* Price - 당근마켓 스타일 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base font-bold text-foreground">{formatPrice(post.price)}</span>
            {post.is_price_negotiable && post.price > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                가격제안
              </span>
            )}
          </div>

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
                    {isOwner && (
                      <DropdownMenuItem
                        onClick={(e) => e.stopPropagation()}
                        onSelect={() => setBumpOpen(true)}
                      >
                        <ArrowUp className="w-4 h-4 mr-2" />
                        올리기
                      </DropdownMenuItem>
                    )}
                    {isOwner && currentStatus === "active" && (
                      <DropdownMenuItem onClick={(e) => handleStatusChange(e, "reserved")}>
                        <CheckCircle className="w-4 h-4 mr-2 text-yellow-500" />
                        예약중으로 변경
                      </DropdownMenuItem>
                    )}
                    {isOwner && currentStatus !== "completed" && (
                      <DropdownMenuItem onClick={(e) => handleStatusChange(e, "completed")}>
                        <CheckCircle className="w-4 h-4 mr-2 text-gray-500" />
                        판매완료
                      </DropdownMenuItem>
                    )}
                    {isOwner && currentStatus === "completed" && (
                      <DropdownMenuItem onClick={(e) => handleStatusChange(e, "active")}>
                        <CheckCircle className="w-4 h-4 mr-2 text-amber-500" />
                        판매중으로 변경
                      </DropdownMenuItem>
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
      {isOwner && (
        <BumpDialog
          open={bumpOpen}
          onClose={() => setBumpOpen(false)}
          targetType="secondhand"
          targetId={post.id}
        />
      )}
    </Link>
  )
})
