"use client"

import { Heart, Eye, MapPin, Loader2, Building2, User, MoreVertical, Pencil, Trash2, Star, ArrowUp, BarChart2 } from "lucide-react"
import { FavoriteButton } from "@/components/favorite-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Property } from "@/types/app"
import { formatPropertyPrice, formatPostedAgo } from "@/lib/features/property"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { memo, useState, useCallback } from "react"
import { cn, stripRegionPrefix } from "@/lib/utils"
import { toast } from "sonner"
import { MediaThumbnail } from "@/components/media-thumbnail"
// BumpDialog 는 모달 — 카드 첫 렌더에 불필요. 메뉴 클릭 시 lazy load.
import { usePropertyCompare } from "@/hooks/use-property-compare"
import dynamic from "next/dynamic"
const BumpDialog = dynamic(() => import("@/components/bump-dialog").then((m) => m.BumpDialog), { ssr: false })

interface PropertyCardProps {
  property: Property
  currentUserId?: string
  isAdmin?: boolean
  isHighlighted?: boolean
  highlightLabel?: string
  /** LCP 최적화 — 첫 화면 위 2~4개 카드만 priority. 나머지는 lazy load. */
  priority?: boolean
}

export const PropertyCard = memo(function PropertyCard({ property, currentUserId, isAdmin = false, isHighlighted = false, highlightLabel = "오늘의 매물!", priority = false }: PropertyCardProps) {
  const router = useRouter()
  const [isLiked, setIsLiked] = useState(property.isLiked || false)
  const [likeCount, setLikeCount] = useState(property.likes)
  const [isLoading, setIsLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)

  const isOwner = currentUserId && property.seller?.id === currentUserId
  const [featuredLoading, setFeaturedLoading] = useState(false)
  const [bumpOpen, setBumpOpen] = useState(false)
  const { isInCompare, toggleCompare } = usePropertyCompare()
  const inCompare = isInCompare(property.id)

  const handleCompareToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleCompare(property.id)
  }, [property.id, toggleCompare])

  const handleToggleFeatured = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const newFeaturedState = !property.is_featured
    
    setFeaturedLoading(true)
    try {
      const response = await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_featured: newFeaturedState })
      })
      const responseData = await response.json()
      
      if (response.ok) {
        // 전체 페이지 리로드 대신 RSC 리프레시 (SPA 캐시 유지)
        toast.success("설정되었습니다")
        router.refresh()
      } else {
        toast.error(responseData.error || "설정 실패")
      }
    } catch (error) {
      console.error("[property-card toggle featured]", error)
      toast.error("일시적 오류가 발생했습니다")
    } finally {
      setFeaturedLoading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm("정말로 이 매물을 삭제하시겠습니까?")) return
    
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/properties/${property.id}`, {
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
    window.location.href = `/property/${property.id}/edit`
  }
  
  if (isDeleted) {
    return null
  }

  // 찜 동작은 FavoriteButton 컴포넌트가 직접 처리 (통합)
  // 가격 / 시간 포맷터는 lib/features/property 로 분리됨 — Phase A 시범 이전

  return (
    <>
    <Link href={`/property/${property.id}`} className="block h-full">
      <article className={cn(
        "group bg-card rounded-2xl overflow-hidden border hover:shadow-md shadow-sm transition-all duration-300 relative h-full flex flex-col",
        isHighlighted
          ? "border-2 border-rose-500 ring-2 ring-rose-500/20"
          : "border-border/50 hover:border-primary/50"
      )}>
        {/* Highlight Badge */}
        {isHighlighted && (
          <div className="absolute top-0 left-0 z-30 bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-br-xl flex items-center gap-1">
            <Star className="w-3 h-3 fill-current" />
            {highlightLabel}
          </div>
        )}
        {/* Image */}
        <div className="relative aspect-[4/3] bg-muted overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/30 via-transparent to-transparent z-10" />
          {property.images && property.images.length > 0 ? (
            <MediaThumbnail
              src={property.images[0]}
              alt={property.title}
              priority={priority}
              className="object-cover group-hover:scale-110 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 to-secondary flex items-center justify-center">
              <Building2 className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}
          {/* Like Button (통합 스타일) */}
          <FavoriteButton
            kind="property"
            targetId={property.id}
            currentUserId={currentUserId}
            initialLiked={isLiked}
            onChange={(next) => {
              setIsLiked(next)
              setLikeCount((prev) => (next ? prev + 1 : Math.max(0, prev - 1)))
            }}
            className="absolute top-3 right-3 z-20"
          />
          {/* Compare Toggle */}
          <button
            onClick={handleCompareToggle}
            title={inCompare ? "비교함에서 빼기" : "비교함에 담기"}
            aria-label={inCompare ? "비교함에서 빼기" : "비교함에 담기"}
            className={cn(
              "absolute top-12 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all",
              inCompare
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-card/80 text-muted-foreground hover:bg-card hover:text-foreground backdrop-blur-sm"
            )}
          >
            <BarChart2 className="w-4 h-4" />
          </button>
          {/* Badges - 가로 정렬 (매물타입 · 거래타입) */}
          <div className="absolute top-3 left-3 z-20 flex flex-row items-center gap-1.5">
            {/* Property Type Badge */}
            <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-card/95 text-card-foreground shadow-sm backdrop-blur-sm">
              {property.propertyType}
            </span>
            {/* Transaction Type Badge */}
            <span className={cn(
              "px-2.5 py-1 text-xs font-bold rounded-lg shadow-sm",
              property.transactionType === "매매" && "bg-primary text-primary-foreground",
              property.transactionType === "전세" && "bg-amber-500 text-white",
              property.transactionType === "월세" && "bg-rose-500 text-white"
            )}>
              {property.transactionType}
            </span>
          </div>
          {/* Seller Type Badge - 좌측 하단 */}
          <span className={cn(
            "absolute bottom-3 left-3 z-20 px-2 py-1 text-xs font-medium rounded-lg flex items-center gap-1 shadow-md",
            property.seller_type === "agent"
              ? "bg-blue-600 text-white"
              : "bg-emerald-600 text-white"
          )}>
            {property.seller_type === "agent" ? (
              <>
                <Building2 className="w-3 h-3" />
                중개
              </>
            ) : (
              <>
                <User className="w-3 h-3" />
                일반
              </>
            )}
          </span>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          {/* Price — 카드의 시각 1순위 (당근 패턴: 가격이 가장 굵고 큼) */}
          <div className="mb-1.5">
            <span className="text-xl font-extrabold text-ink-900 tracking-tight leading-tight break-keep">
              {formatPropertyPrice(property)}
            </span>
          </div>

          {/* Title — 2순위 (15px, semibold, 본문 잉크) */}
          <h3 className="text-md font-semibold text-ink-900 mb-2 line-clamp-2 group-hover:text-primary transition-colors leading-snug">
            {property.title}
          </h3>

          {/* Details — 3순위 (스펙 정보, 보조 잉크) */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-700 mb-2 flex-wrap">
            <span className="bg-secondary px-2 py-0.5 rounded-md">{property.area}m²</span>
            {property.floor && (
              <span className="bg-secondary px-2 py-0.5 rounded-md">{property.floor}층</span>
            )}
          </div>

          {/* Location — 4순위 (메타) */}
          <div className="flex items-center gap-1 text-xs text-ink-500 mb-3">
            <MapPin className="w-3 h-3" />
            <span className="line-clamp-1">{stripRegionPrefix(property.district)}</span>
          </div>

          {/* Footer — 5순위 (가장 흐리게) */}
          <div className="mt-auto flex items-center justify-between text-[11px] text-ink-500 pt-3 border-t border-border/50">
            <span>{formatPostedAgo(property.createdAt)}</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {property.views}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {likeCount}
              </span>
              {/* 본인 매물 또는 관리자인 경우 점 세개 메뉴 */}
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
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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
                    {/* 관리자 전용 - 오늘의 매물 설정 */}
                    {isAdmin && (
                      <DropdownMenuItem 
                        onClick={handleToggleFeatured}
                        disabled={featuredLoading}
                      >
                        {featuredLoading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Star className="w-4 h-4 mr-2" />
                        )}
                        {property.is_featured ? "오늘의 매물 해제" : "오늘의 매물 설정"}
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
      </article>
    </Link>
    {isOwner && (
      <BumpDialog
        open={bumpOpen}
        onClose={() => setBumpOpen(false)}
        targetType="property"
        targetId={property.id}
        onBumped={() => {
          // 카드는 그대로 두고, 다음 새로고침 시 자동으로 맨 위로 — UX 충분
        }}
      />
    )}
    </>
  )
})
