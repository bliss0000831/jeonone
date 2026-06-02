"use client"

// EditableIcon — 슈퍼관리자가 편집 가능한 아이콘 자리표시자.
//
// 우선순위: 업로드 이미지 > 이모지 텍스트 > 기본 lucide 아이콘
//
// 사용법 (단순):
//   <EditableIcon iconKey="..." fallback={Building2} className="w-5 h-5" />
//   → 이미지/이모지/lucide 모두 같은 className 사이즈
//
// 사용법 (타일 — 권장):
//   <EditableIcon
//     iconKey="..."
//     fallback={Building2}
//     tileClassName="w-10 h-10 rounded-xl bg-blue-500"
//     iconClassName="w-5 h-5 text-white"
//   />
//   → 이미지 있으면 tile 전체를 이미지로 대체
//   → 없으면 <div tileClassName><Fallback iconClassName/></div>

import type { ComponentType } from "react"
import Image from "next/image"
import { useLabel, useLabelImage } from "@/components/site-labels-client"
import { cn } from "@/lib/utils"

// 이미지 렌더 시 tileClassName 에서 "장식" 관련 Tailwind 클래스 제거
// (사용자 이미지 본연의 모양이 그대로 보이도록)
//   - 배경: bg-*, from-*, to-*, via-* (그라데이션 포함)
//   - 모서리: rounded-* (이미지가 잘리지 않게)
//   - 그림자: shadow-*
//   - 보더: border-*, ring-*
//   ※ 사이즈(w-/h-), 마진(mb-/ml-), flex 관련은 유지
function stripDecorativeClasses(input: string): string {
  if (!input) return ""
  return input
    .split(/\s+/)
    .filter((c) => {
      const cls = c.replace(/^(?:hover|focus|active|group-hover|dark|sm|md|lg|xl|2xl):/, "")
      if (cls.startsWith("bg-") || cls.startsWith("from-") || cls.startsWith("to-") || cls.startsWith("via-")) return false
      if (cls.startsWith("rounded")) return false
      if (cls.startsWith("shadow")) return false
      if (cls.startsWith("border")) return false
      if (cls.startsWith("ring")) return false
      return true
    })
    .join(" ")
}

interface Props {
  iconKey: string
  fallback: ComponentType<{ className?: string }>
  /** 단순 모드 — 이미지/이모지/lucide 모두 같은 사이즈 */
  className?: string
  /** 타일 모드 — 이미지가 차지할 외곽 박스 (rounded, bg 포함). 사용 시 iconClassName 도 같이 줘야 함 */
  tileClassName?: string
  /** 타일 모드의 fallback 아이콘 사이즈/색상 */
  iconClassName?: string
  /**
   * 이미지가 업로드됐을 때만 적용할 별도 사이즈/클래스.
   * 비우면 tileClassName 에서 장식만 제거하고 사이즈 유지.
   * 보통 lucide 보다 이미지가 더 크게 보여야 자연스러우므로 좀 큰 사이즈 권장.
   */
  imageClassName?: string
}

export function EditableIcon({
  iconKey,
  fallback: Fallback,
  className,
  tileClassName,
  iconClassName,
  imageClassName,
}: Props) {
  const img = useLabelImage(iconKey)
  const emoji = useLabel(iconKey, "")
  const useTile = !!tileClassName

  if (img) {
    // 이미지 사이즈 결정:
    //   - imageClassName 가 있으면 그것 사용 (권장 — 이미지가 충분히 크게)
    //   - 없으면 tileClassName 에서 장식 제거한 결과 (사이즈만 유지)
    //   - tile 도 없으면 단순 className
    const imgClass = imageClassName
      ? imageClassName
      : useTile
      ? stripDecorativeClasses(tileClassName!)
      : className
    return (
      <Image src={img} alt="" width={40} height={40} className={cn(imgClass, "object-contain")} unoptimized />
    )
  }
  if (useTile) {
    return (
      <div className={cn(tileClassName, "flex items-center justify-center")}>
        {emoji ? (
          <span className={cn("inline-flex items-center justify-center leading-none text-base", iconClassName)}>
            {emoji}
          </span>
        ) : (
          <Fallback className={iconClassName} />
        )}
      </div>
    )
  }
  if (emoji) {
    return (
      <span className={cn("inline-flex items-center justify-center leading-none", className)}>{emoji}</span>
    )
  }
  return <Fallback className={className} />
}
