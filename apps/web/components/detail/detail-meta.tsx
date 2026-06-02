"use client"

import { Eye, Heart, Clock, MapPin } from "lucide-react"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface DetailMetaProps {
  views?: number
  likes?: number
  timeAgo?: string
  location?: string
  /** 추가 메타 항목 (예: "오늘 오픈") */
  extra?: ReactNode
  className?: string
}

/** 게시글 메타 행 (조회·관심·시간·위치) — 모든 상세페이지 공용 */
export function DetailMeta({
  views,
  likes,
  timeAgo,
  location,
  extra,
  className,
}: DetailMetaProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground",
        className,
      )}
    >
      {location && (
        <span className="flex items-center gap-1 min-w-0">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{location}</span>
        </span>
      )}
      {typeof views === "number" && (
        <span className="flex items-center gap-1">
          <Eye className="w-4 h-4" />
          조회 {views.toLocaleString()}
        </span>
      )}
      {typeof likes === "number" && (
        <span className="flex items-center gap-1">
          <Heart className="w-4 h-4" />
          관심 {likes.toLocaleString()}
        </span>
      )}
      {timeAgo && (
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {timeAgo}
        </span>
      )}
      {extra}
    </div>
  )
}

/** 제목-가격 블록 (카테고리 태그 + 가격 + 제목) 공용 */
export function DetailTitleBlock({
  category,
  price,
  priceTone = "primary",
  title,
  className,
}: {
  category?: ReactNode
  price?: ReactNode
  priceTone?: "primary" | "foreground" | "destructive"
  title: ReactNode
  className?: string
}) {
  const priceColor =
    priceTone === "primary"
      ? "text-primary"
      : priceTone === "destructive"
        ? "text-destructive"
        : "text-foreground"

  return (
    <div className={className}>
      {category && <div className="mb-2">{category}</div>}
      {price && (
        <h1
          className={cn(
            "text-2xl md:text-3xl font-bold mb-2",
            priceColor,
          )}
        >
          {price}
        </h1>
      )}
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </div>
  )
}
