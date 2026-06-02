"use client"

import { ComponentType, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, ImageIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DetailGalleryProps {
  images?: string[] | null
  alt?: string
  /** 빈 이미지 대체 아이콘 */
  fallbackIcon?: ComponentType<{ className?: string }>
  /** 빈 이미지 대체 라벨 */
  fallbackLabel?: string
  /** 좌상단 배지 (카테고리/상태) */
  topLeftBadges?: ReactNode
  /** 비율. 기본 'wide' — 모바일 4/3, 데스크톱 16/9 */
  aspect?: "video" | "wide" | "square"
  /** 화살표 네비 표시 여부 (기본 이미지 ≥2장이면 자동 표시) */
  showArrows?: boolean
  className?: string
}

const ASPECT_CLASS: Record<NonNullable<DetailGalleryProps["aspect"]>, string> = {
  video: "aspect-video",
  wide: "aspect-[4/3] md:aspect-[16/9]",
  square: "aspect-square md:aspect-video",
}

/** 게시글 상세 상단 이미지 갤러리 — 모든 상세페이지 공용
 *
 * 렌더링 방식:
 *  - 바깥: px-4 pt-4 래퍼 → 끝까지 붙지 않고 카드처럼
 *  - 안쪽: rounded-2xl 카드, 고정 비율(aspect)
 *  - 이미지: object-cover 로 컨테이너 꽉 채움 (세로 사진은 위/아래 약간 잘림)
 *  - 사진 클릭 시 전체화면 라이트박스 (좌우 네비/스와이프/키보드/ESC)
 */
export function DetailGallery({
  images,
  alt = "",
  fallbackIcon: FallbackIcon = ImageIcon,
  fallbackLabel,
  topLeftBadges,
  aspect = "wide",
  showArrows,
  className,
}: DetailGalleryProps) {
  const [index, setIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  // P3: useMemo로 안정화 — 매 렌더마다 새 배열 생성 방지 (useEffect 무한 재실행 차단)
  // L8: 빈 문자열/falsy 필터 — new Image().src="" 같은 불필요한 요청 방지
  const imgs = useMemo(() => (images ?? []).filter(Boolean), [images])
  const hasImages = imgs.length > 0
  const multiple = imgs.length > 1
  const arrows = showArrows ?? multiple

  // 근접 이미지만 프리로드 — 현재 ±1장 (스와이프 시 즉시 표시)
  // 전체 이미지를 한꺼번에 프리로드하면 LCP 지연 + 불필요한 대역폭 낭비.
  useEffect(() => {
    if (typeof window === "undefined" || imgs.length <= 1) return
    const toPreload = new Set<string>()
    // 현재 앞뒤 1장씩
    if (index > 0 && imgs[index - 1]) toPreload.add(imgs[index - 1])
    if (index < imgs.length - 1 && imgs[index + 1]) toPreload.add(imgs[index + 1])
    // 첫 로드 시 index=0 이면 다음 장만
    toPreload.forEach((src) => {
      const img = new window.Image()
      img.decoding = "async"
      img.src = src
    })
  }, [imgs, index])

  const prev = useCallback(
    () => setIndex((p) => (p > 0 ? p - 1 : imgs.length - 1)),
    [imgs.length],
  )
  const next = useCallback(
    () => setIndex((p) => (p < imgs.length - 1 ? p + 1 : 0)),
    [imgs.length],
  )

  // 터치 스와이프 (카드 내에서 좌우로 밀면 사진 넘김, 세로 스크롤은 그대로)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchMoved = useRef(false)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchMoved.current = false
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current)
    if (dx > 10) touchMoved.current = true
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    if (!multiple) return
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) prev()
      else next()
    }
  }

  return (
    <div className={cn("px-4 pt-4", className)}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl bg-muted shadow-sm touch-pan-y",
          ASPECT_CLASS[aspect],
          "max-h-[520px]",
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {hasImages ? (
          <button
            type="button"
            onClick={() => {
              if (touchMoved.current) return
              setLightboxOpen(true)
            }}
            className="absolute inset-0 w-full h-full cursor-zoom-in"
            aria-label="사진 크게 보기"
          >
            <img
              src={imgs[index]}
              alt={alt}
              className="w-full h-full object-cover"
              loading="eager"
              decoding="async"
              fetchPriority={index === 0 ? "high" : "auto"}
              suppressHydrationWarning
            />
          </button>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
            <div className="text-center">
              <FallbackIcon className="w-12 h-12 text-muted-foreground/60 mx-auto mb-2" />
              {fallbackLabel && (
                <span className="text-sm text-muted-foreground">
                  {fallbackLabel}
                </span>
              )}
            </div>
          </div>
        )}

        {topLeftBadges && (
          <div className="absolute top-3 left-3 z-20 flex gap-2 flex-wrap pointer-events-none">
            {topLeftBadges}
          </div>
        )}

        {hasImages && arrows && multiple && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                prev()
              }}
              className="absolute z-20 left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
              aria-label="이전 이미지"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                next()
              }}
              className="absolute z-20 right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
              aria-label="다음 이미지"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {hasImages && (
          <div className="absolute z-20 bottom-3 right-3 px-2.5 py-1 bg-black/55 backdrop-blur-sm rounded-full text-white text-xs font-medium pointer-events-none">
            {index + 1} / {imgs.length}
          </div>
        )}

        {hasImages && multiple && (
          <div className="absolute z-20 bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {imgs.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation()
                  setIndex(i)
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i === index ? "bg-white" : "bg-white/50 hover:bg-white/80",
                )}
                aria-label={`${i + 1}번 이미지로 이동`}
              />
            ))}
          </div>
        )}
      </div>

      {lightboxOpen && hasImages && (
        <Lightbox
          images={imgs}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setLightboxOpen(false)}
          alt={alt}
        />
      )}
    </div>
  )
}

/** 전체화면 이미지 뷰어 — 좌우 네비/스와이프/키보드/ESC/배경 탭/더블클릭 줌/핀치줌 */
function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
  alt,
}: {
  images: string[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  alt: string
}) {
  const multiple = images.length > 1
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  // --- 줌 상태 ---
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const isZoomed = scale > 1
  const lastTapRef = useRef(0)
  const pinchStartDist = useRef<number | null>(null)
  const pinchStartScale = useRef(1)
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  // 이미지 변경 시 줌 리셋
  useEffect(() => { setScale(1); setTranslate({ x: 0, y: 0 }) }, [index])

  const resetZoom = useCallback(() => { setScale(1); setTranslate({ x: 0, y: 0 }) }, [])

  const prev = useCallback(
    () => onIndexChange(index > 0 ? index - 1 : images.length - 1),
    [index, images.length, onIndexChange],
  )
  const next = useCallback(
    () => onIndexChange(index < images.length - 1 ? index + 1 : 0),
    [index, images.length, onIndexChange],
  )

  // 키보드 네비 + ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (isZoomed) resetZoom(); else onClose() }
      else if (e.key === "ArrowLeft" && multiple && !isZoomed) prev()
      else if (e.key === "ArrowRight" && multiple && !isZoomed) next()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, prev, next, multiple, isZoomed, resetZoom])

  // body 스크롤 잠금
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // 마우스 휠 줌 (데스크톱)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const next = Math.min(4, Math.max(1, scale - e.deltaY * 0.002))
    if (next <= 1) { resetZoom() } else { setScale(next) }
  }, [scale, resetZoom])

  // 터치 — 핀치줌 + 스와이프 + 더블탭 줌
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 핀치 시작
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchStartDist.current = Math.hypot(dx, dy)
      pinchStartScale.current = scale
    } else if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      if (isZoomed) {
        panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: translate.x, ty: translate.y }
      }
    }
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current != null) {
      // 핀치 줌
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const newScale = Math.min(4, Math.max(1, pinchStartScale.current * (dist / pinchStartDist.current)))
      setScale(newScale)
      if (newScale <= 1) setTranslate({ x: 0, y: 0 })
    } else if (e.touches.length === 1 && isZoomed && panStart.current) {
      // 패닝 (줌 상태에서 드래그로 이동)
      const dx = e.touches[0].clientX - panStart.current.x
      const dy = e.touches[0].clientY - panStart.current.y
      setTranslate({ x: panStart.current.tx + dx, y: panStart.current.ty + dy })
    }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    pinchStartDist.current = null
    panStart.current = null
    if (scale <= 1) resetZoom()

    if (touchStartX.current == null || touchStartY.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null
    touchStartY.current = null

    // 더블탭 줌 토글
    const now = Date.now()
    if (now - lastTapRef.current < 300 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      if (isZoomed) resetZoom()
      else { setScale(2.5); setTranslate({ x: 0, y: 0 }) }
      lastTapRef.current = 0
      return
    }
    lastTapRef.current = now

    // 줌 안 된 상태에서만 스와이프 넘김
    if (!isZoomed && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && multiple) {
      if (dx > 0) prev()
      else next()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-in fade-in duration-200"
      onClick={() => { if (isZoomed) resetZoom(); else onClose() }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
    >
      {/* 닫기 */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
        aria-label="닫기"
      >
        <X className="w-6 h-6" />
      </button>

      {/* 인디케이터 */}
      {multiple && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-white text-sm font-medium pointer-events-none">
          {index + 1} / {images.length}
        </div>
      )}

      {/* 줌 힌트 */}
      {isZoomed && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-white/70 text-xs pointer-events-none">
          {Math.round(scale * 100)}% · 두번 탭하여 원래 크기
        </div>
      )}

      {/* 이미지 — object-contain + 줌/패닝 */}
      <img
        src={images[index]}
        alt={alt}
        className="max-w-full max-h-full object-contain select-none transition-transform duration-150"
        style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` }}
        loading="eager"
        decoding="async"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (isZoomed) resetZoom()
          else { setScale(2.5); setTranslate({ x: 0, y: 0 }) }
        }}
        onWheel={handleWheel}
      />

      {/* 좌우 네비 (줌 상태에서는 숨김) */}
      {multiple && !isZoomed && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            className="flex absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center backdrop-blur-sm transition-colors"
            aria-label="이전 이미지"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            className="flex absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center backdrop-blur-sm transition-colors"
            aria-label="다음 이미지"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        </>
      )}

      {/* 썸네일 스트립 (줌 상태에서는 숨김) */}
      {multiple && !isZoomed && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2 px-3 py-2 bg-white/5 backdrop-blur-sm rounded-full max-w-[90vw] overflow-x-auto scrollbar-none"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              className={cn(
                "shrink-0 w-11 h-11 rounded-md overflow-hidden ring-2 transition-all",
                i === index ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100",
              )}
              aria-label={`${i + 1}번 이미지로 이동`}
            >
              <Image src={src} alt={`${i + 1}번 사진`} width={44} height={44} className="w-full h-full object-cover" unoptimized />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
