"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { ComponentType } from "react"
import { EditableIcon } from "@/components/editable-icon"
import { cn } from "@/lib/utils"

export interface MiniNavItem {
  href: string
  icon: ComponentType<{ className?: string }>
  iconKey: string
  label: string
}

/**
 * 카테고리별 아이콘 색상 — 흰 원 안의 작은 액센트로만 사용.
 * 타일 자체는 모두 흰색으로 통일 → 사진 위에서 단정하게 떠 보임.
 * 알록달록함 줄이되 "어떤 카테고리인지" 단서는 유지.
 */
const ICON_COLORS: Record<string, string> = {
  "/board":        "text-sky-600",
  "/secondhand":   "text-amber-600",
  "/sharing":      "text-emerald-600",
  "/clubs":        "text-purple-600",
  "/local-food":   "text-teal-600",
  "/group-buying": "text-rose-600",
  "/jobs":         "text-indigo-600",
  "/new-store":    "text-orange-600",
}
const DEFAULT_ICON_COLOR = "text-foreground"

/**
 * 홈 카테고리 미니네비 — 원본 디자인(파랑 그라데이션 + 흰 원형) 한 줄 가로 스크롤
 *
 * - 진한 파랑 그라데이션 배경 (광장 primary)
 * - 흰 반투명 원형 아이콘 + 라벨 세로 배치
 * - 한 줄 가로 스크롤
 * - 모바일(overflow): 우측 fade + 펄스 화살표
 * - PC(overflow 없음): 가운데 정렬, 화살표 숨김
 */
export function CategoryMiniNav({
  items,
  backgroundImageUrl,
}: {
  items: MiniNavItem[]
  /** 배너 이미지 URL — 있으면 미니네비 배경으로 사용 (배너보다 더 어둡게 오버레이) */
  backgroundImageUrl?: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(true)

  useEffect(() => {
    const check = () => {
      const c = containerRef.current
      const t = trackRef.current
      if (!c || !t) return
      setHasOverflow(t.scrollWidth > c.clientWidth + 4)
    }
    check()
    const ro = new ResizeObserver(check)
    if (containerRef.current) ro.observe(containerRef.current)
    if (trackRef.current) ro.observe(trackRef.current)
    window.addEventListener("resize", check)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", check)
    }
  }, [items])

  return (
    <div
      className="relative text-white isolate overflow-hidden"
      style={
        backgroundImageUrl
          ? undefined
          : {
              background:
                'linear-gradient(to right, color-mix(in srgb, var(--primary) 70%, black 30%), var(--primary))',
            }
      }
    >
      {/* 배너 이미지의 "거울 반사" — 배너 하단 끝부분을 위아래 뒤집어 보여줌
          background-size 를 배너 실제 높이(280/300/380)에 맞추고
          background-position: bottom 으로 배너 바닥 부분을 잘라낸 뒤 scaleY(-1) 로 뒤집음 */}
      {backgroundImageUrl && (
        <>
          {/* 배너와 동일한 cover/center 렌더링을 위해 배너 높이만큼의 가상 영역에 이미지를 그린 뒤,
              부모의 overflow-hidden 으로 mini-nav 높이만큼만 보여줌.
              scaleY(-1) (default origin center) → 같은 bbox 안에서 위아래만 뒤집힘 →
              위쪽에 보이는 영역 = 배너 하단 슬라이스의 거울 반사 */}
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 w-full h-[280px] sm:h-[300px] md:h-[380px] -z-10"
            style={{
              backgroundImage: `url(${backgroundImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              transform: 'scaleY(-1)',
              filter: 'brightness(0.85) saturate(0.95)',
            }}
          />
          {/* 메인 톤 그라데이션: 위는 거의 투명(배너와 연결) → 아래는 어둡게(가독성) */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.32) 50%, rgba(0,0,0,0.55) 100%)',
            }}
          />
          {/* 수면 하이라이트 — 양 끝 페이드 + 가운데 살짝 빛나는 1px */}
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px -z-10"
            style={{
              background:
                'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.45) 35%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.45) 65%, transparent 100%)',
              boxShadow: '0 0 6px rgba(255,255,255,0.35)',
            }}
          />
          {/* 하이라이트 바로 아래 얇은 어두운 선 — "수면 edge" 입체감 */}
          <div
            aria-hidden
            className="absolute top-px left-0 right-0 h-px -z-10"
            style={{
              background:
                'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.45) 50%, transparent 100%)',
            }}
          />
          {/* 윗 inner shadow — 반사면이 살짝 들어가 보이는 depth */}
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-4 -z-10"
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 100%)',
            }}
          />
          {/* 좌우 vignette — 가장자리만 살짝 어둡게 (사진 같은 마무리감) */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.25) 100%)',
            }}
          />
        </>
      )}
      <div className="max-w-2xl md:max-w-5xl mx-auto py-2.5 px-4 relative">
        {/* 우측 펄스 화살표 — overflow 있을 때만 노출 (배경 페이드 없이 chip 만 떠 있음) */}
        {hasOverflow && (
          <div
            aria-hidden
            className="pointer-events-none absolute right-2 top-0 bottom-0 z-10 flex items-center"
          >
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-foreground shadow-lg animate-pulse">
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </span>
          </div>
        )}

        <div
          ref={containerRef}
          className="overflow-x-auto scrollbar-hide -mx-4 px-4"
        >
          <div
            ref={trackRef}
            className={cn(
              "flex gap-7 sm:gap-10",
              hasOverflow ? "w-max pr-12" : "w-full justify-around",
            )}
          >
            {items.map(({ href, icon: Icon, iconKey, label }) => {
              const iconColor = ICON_COLORS[href] || DEFAULT_ICON_COLOR
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  className="group flex flex-col items-center gap-1 py-1 active:scale-95 transition-transform flex-shrink-0 w-[calc((100vw-32px-5*1.75rem)/5.5)] sm:w-[calc((100vw-32px-5*2.5rem)/5.5)] md:w-auto md:min-w-[56px]"
                >
                  <EditableIcon
                    iconKey={iconKey}
                    fallback={Icon}
                    tileClassName={cn(
                      "w-10 h-10 rounded-full transition-all duration-200",
                      "bg-white/95 backdrop-blur-sm",
                      "shadow-md group-hover:shadow-lg group-hover:-translate-y-0.5",
                    )}
                    iconClassName={cn("w-[19px] h-[19px]", iconColor)}
                  />
                  <span className="text-[11px] font-medium leading-none whitespace-nowrap drop-shadow-sm">
                    {label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
