"use client"

import { Property } from "@/types/app"
import Link from "next/link"
import { memo, useState } from "react"
import { Eye, Heart, MapPin, MoreVertical, Pencil, Trash2, Loader2, EyeOff, CheckCircle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MediaThumbnail } from "@/components/media-thumbnail"
import { toast } from "sonner"

interface PropertyManageCardProps {
  property: Property
}

export const PropertyManageCard = memo(function PropertyManageCard({ property }: PropertyManageCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [status, setStatus] = useState(property.status || "active")
  const [isDeleted, setIsDeleted] = useState(false)

  const formatPrice = (price: number, type: string) => {
    if (type === "월세") {
      return `월세 ${price.toLocaleString()}만원`
    }
    if (price >= 10000) {
      const uk = Math.floor(price / 10000)
      const man = price % 10000
      if (man > 0) {
        return `${type} ${uk}억 ${man.toLocaleString()}만원`
      }
      return `${type} ${uk}억`
    }
    return `${type} ${price.toLocaleString()}만원`
  }

  const handleDelete = async () => {
    if (!confirm("정말 이 매물을 삭제하시겠습니까?")) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/properties/${property.id}`, {
        method: "DELETE"
      })

      if (response.ok) {
        setIsDeleted(true)
      } else {
        const data = await response.json()
        toast.error(data.error || "삭제에 실패했습니다")
      }
    } catch (error) {
      console.error("삭제 실패:", error)
      toast.error("삭제에 실패했습니다")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleStatusChange = async (newStatus: "active" | "reserved" | "completed" | "hidden") => {
    setIsUpdating(true)
    try {
      const response = await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        setStatus(newStatus)
      } else {
        const data = await response.json()
        toast.error(data.error || "상태 변경에 실패했습니다")
      }
    } catch (error) {
      console.error("상태 변경 실패:", error)
      toast.error("상태 변경에 실패했습니다")
    } finally {
      setIsUpdating(false)
    }
  }
  
  if (isDeleted) {
    return null
  }

  const getStatusBadge = () => {
    switch (status) {
      case "active":
        return <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded">판매중</span>
      case "reserved":
        return <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/10 text-yellow-600 rounded">예약중</span>
      case "completed":
        return <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">거래완료</span>
      case "hidden":
        return <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">숨김</span>
      default:
        return null
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex">
        {/* Image */}
        <Link href={`/property/${property.id}`} className="flex-shrink-0">
          <div className="relative w-28 h-28 sm:w-32 sm:h-32">
            {property.images[0] ? (
              <MediaThumbnail
                src={property.images[0]}
                alt={property.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <span className="text-muted-foreground text-xs">이미지 없음</span>
              </div>
            )}
          </div>
        </Link>

        {/* Content */}
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getStatusBadge()}
                  <span className="text-xs text-muted-foreground">{property.propertyType}</span>
                </div>
                <Link href={`/property/${property.id}`}>
                  <h3 className="font-medium text-foreground text-sm sm:text-base line-clamp-1 hover:underline">
                    {property.title}
                  </h3>
                </Link>
              </div>
              
              {/* Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="더보기 메뉴"
                    className="p-1.5 hover:bg-secondary rounded-full transition-colors flex-shrink-0"
                    disabled={isDeleting || isUpdating}
                  >
                    {(isDeleting || isUpdating) ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem asChild>
                    <Link href={`/property/${property.id}/edit`} className="flex items-center gap-2 cursor-pointer">
                      <Pencil className="w-4 h-4" />
                      수정하기
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {status !== "active" && (
                    <DropdownMenuItem onClick={() => handleStatusChange("active")} className="flex items-center gap-2 cursor-pointer">
                      <Eye className="w-4 h-4" />
                      판매중으로 변경
                    </DropdownMenuItem>
                  )}
                  {status !== "reserved" && (
                    <DropdownMenuItem onClick={() => handleStatusChange("reserved")} className="flex items-center gap-2 cursor-pointer">
                      <CheckCircle className="w-4 h-4" />
                      예약중으로 변경
                    </DropdownMenuItem>
                  )}
                  {status !== "completed" && (
                    <DropdownMenuItem onClick={() => handleStatusChange("completed")} className="flex items-center gap-2 cursor-pointer">
                      <CheckCircle className="w-4 h-4" />
                      거래완료로 변경
                    </DropdownMenuItem>
                  )}
                  {status !== "hidden" && (
                    <DropdownMenuItem onClick={() => handleStatusChange("hidden")} className="flex items-center gap-2 cursor-pointer">
                      <EyeOff className="w-4 h-4" />
                      숨기기
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleDelete} 
                    className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    삭제하기
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <p className="text-primary font-bold text-sm sm:text-base mt-1">
              {formatPrice(property.price, property.transactionType)}
            </p>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
            <div className="flex items-center gap-0.5 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{property.district}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {property.views}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {property.likes}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
