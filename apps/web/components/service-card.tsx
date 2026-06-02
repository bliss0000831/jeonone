"use client"

import Link from "next/link"
import Image from "next/image"
import { Eye, Heart, MapPin, Truck, SprayCan, Wrench, Paintbrush, MoreVertical, Pencil, Trash2, Loader2, ArrowUp } from "lucide-react"
import { FavoriteButton, type FavoriteKind } from "@/components/favorite-button"
import { memo, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { stripRegionPrefix } from "@/lib/utils"
// BumpDialog 는 모달 — 카드 첫 렌더에 불필요. 메뉴 클릭 시 lazy load.
import dynamic from "next/dynamic"
import { toast } from "sonner"
const BumpDialog = dynamic(() => import("@/components/bump-dialog").then((m) => m.BumpDialog), { ssr: false })

export interface ServicePost {
  id: string
  user_id: string
  title: string
  content: string
  category: string
  service_region?: string
  service_district?: string
  service_dong?: string
  images?: string[]
  contact_phone?: string
  min_price?: number
  max_price?: number
  price_unit?: string
  views?: number
  likes?: number
  status?: string
  created_at: string
  profiles?: {
    nickname: string | null
    avatar_url: string | null
  }
}

export type ServiceType = "interior" | "moving" | "cleaning" | "repair"

interface ServiceCardProps {
  post: ServicePost
  serviceType: ServiceType
  currentUserId?: string
  isAdmin?: boolean
}

const serviceConfig = {
  interior: {
    color: "purple",
    icon: Paintbrush,
    path: "/interior",
    bgColor: "bg-purple-500",
    textColor: "text-purple-500",
  },
  moving: {
    color: "yellow",
    icon: Truck,
    path: "/moving",
    bgColor: "bg-yellow-500",
    textColor: "text-yellow-600",
  },
  cleaning: {
    color: "pink",
    icon: SprayCan,
    path: "/cleaning",
    bgColor: "bg-pink-500",
    textColor: "text-pink-500",
  },
  repair: {
    color: "orange",
    icon: Wrench,
    path: "/repair",
    bgColor: "bg-orange-500",
    textColor: "text-orange-500",
  },
}

export const ServiceCard = memo(function ServiceCard({ post, serviceType, currentUserId, isAdmin = false }: ServiceCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [bumpOpen, setBumpOpen] = useState(false)
  const config = serviceConfig[serviceType]
  const Icon = config.icon
  const hasImage = post.images && post.images.length > 0
  const isOwner = currentUserId === post.user_id

  const formatPrice = () => {
    if (!post.min_price && !post.max_price) return null
    const unit = post.price_unit || "만원"
    if (post.min_price && post.max_price) {
      return `${post.min_price.toLocaleString()}~${post.max_price.toLocaleString()}${unit}`
    }
    return `${(post.min_price || post.max_price)?.toLocaleString()}${unit}~`
  }

  const price = formatPrice()
  const location = stripRegionPrefix([post.service_region, post.service_district, post.service_dong].filter(Boolean).join(" "))

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm("정말 삭제하시겠습니까?")) return
    
    setIsDeleting(true)
    try {
      const endpoint = `/api/${serviceType}/${post.id}`
      const res = await fetch(endpoint, {
        method: 'DELETE',
      })
      
      if (res.ok) {
        setIsDeleted(true)
      } else {
        toast.error("삭제 실패")
      }
    } catch (error) {
      console.error("Delete error:", error)
      toast.error("삭제 중 오류가 발생했습니다")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.location.href = `${config.path}/${post.id}/edit`
  }
  
  if (isDeleted) {
    return null
  }

  return (
    <Link href={`${config.path}/${post.id}`} className="block group">
      <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 hover:shadow-md transition-all duration-200">
        {/* Image */}
        <div className="relative aspect-[4/3] bg-muted overflow-hidden">
          {hasImage ? (
            <Image
              src={post.images![0]}
              alt={post.title}
              fill
              sizes="(max-width: 640px) 50vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}
          {/* Category Badge */}
          <div className="absolute top-2 left-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white ${config.bgColor}`}>
              <Icon className="w-3 h-3" />
              {post.category}
            </span>
          </div>

          {/* Favorite Button (통합 스타일) */}
          <FavoriteButton
            kind={serviceType as FavoriteKind}
            targetId={post.id}
            currentUserId={currentUserId}
            className="absolute top-2 right-2 z-10"
          />
        </div>

        {/* Content */}
        <div className="p-3">
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors text-sm leading-snug">
            {post.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
            {post.content}
          </p>

          {location && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
              <MapPin className="w-3 h-3" />
              {location}
            </p>
          )}

          {price && (
            <p className={`text-sm font-semibold mt-1.5 ${config.textColor}`}>
              {price}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
            <span>오늘</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {post.views || 0}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {post.likes || 0}
              </span>
              {/* 점 세개 메뉴 - 작성자 또는 관리자 */}
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
                    <DropdownMenuItem onClick={handleEdit}>
                      <Pencil className="w-4 h-4 mr-2" />
                      수정하기
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="text-destructive focus:text-destructive"
                    >
                      {isDeleting ? (
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
          targetType={serviceType}
          targetId={post.id}
        />
      )}
    </Link>
  )
})
