"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Building2, Home, Gift, ShoppingCart, Store, UserPlus, Heart, Users } from "lucide-react"
import { cn } from "@/lib/utils"
// BannerData 정의는 @gwangjang/api-client/hero-banners 에 있음.
import type { BannerData } from "@gwangjang/api-client/hero-banners"
export type { BannerData }

// Icon mapping
const iconMap: Record<string, any> = {
  Building2,
  Home,
  Gift,
  Heart,
  ShoppingCart,
  Store,
  UserPlus,
  Users,
}

const fontFamilyMap: Record<string, string> = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
}

export function HeroBannerClient({
  banners,
  currentIndex: controlledIndex,
  onIndexChange,
}: {
  banners: BannerData[]
  currentIndex?: number
  onIndexChange?: (index: number) => void
}) {
  const [internalIndex, setInternalIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const isControlled = typeof controlledIndex === "number"
  const currentIndex = isControlled ? (controlledIndex as number) : internalIndex
  const setCurrentIndex = (next: number | ((prev: number) => number)) => {
    const compute = (prev: number) =>
      typeof next === "function" ? (next as (p: number) => number)(prev) : next
    if (isControlled) {
      const value = compute(currentIndex)
      onIndexChange?.(value)
    } else {
      setInternalIndex((prev) => {
        const value = compute(prev)
        onIndexChange?.(value)
        return value
      })
    }
  }

  // Auto-play
  useEffect(() => {
    if (!isAutoPlaying || banners.length <= 1) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isAutoPlaying, banners.length])

  // 모바일과 동일 — 수동 조작 후 8초 후 자동 재개
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseAndResume = () => {
    setIsAutoPlaying(false)
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => setIsAutoPlaying(true), 8000)
  }
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    }
  }, [])

  const goToPrevious = () => {
    pauseAndResume()
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)
  }

  const goToNext = () => {
    pauseAndResume()
    setCurrentIndex((prev) => (prev + 1) % banners.length)
  }

  const goToSlide = (index: number) => {
    pauseAndResume()
    setCurrentIndex(index)
  }

  // 터치 스와이프
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    if (banners.length <= 1) return
    // 가로 스와이프가 세로보다 크고 50px 이상일 때만
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) goToPrevious()
      else goToNext()
    }
  }

  const currentBanner = banners[currentIndex]
  if (!currentBanner) {
    return (
      <div className="relative w-full h-[280px] sm:h-[300px] md:h-[380px] bg-gradient-to-br from-background to-secondary/30" />
    )
  }

  const Icon = iconMap[currentBanner.icon] || Building2
  const overlayOpacity = Math.max(0, Math.min(100, currentBanner.opacity ?? 40)) / 100
  const fontClass = fontFamilyMap[currentBanner.font_family || "sans"] || "font-sans"

  return (
    <div
      className={cn("relative w-full h-[280px] sm:h-[300px] md:h-[380px] overflow-hidden bg-gradient-to-br from-background to-secondary/30 touch-pan-y", fontClass)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-primary/30 to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-primary/20 to-transparent rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Banner Content */}
      <Link href={currentBanner.href} prefetch={false} className="block w-full h-full">
        {/* Image Background (if available) */}
        {currentBanner.image_url ? (
          <>
            <Image
              src={currentBanner.image_url}
              alt={currentBanner.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            {/* Dark overlay for text readability — opacity 커스터마이징 적용 */}
            <div
              className="absolute inset-0 bg-black"
              style={{ opacity: overlayOpacity }}
            />
          </>
        ) : (
          <>
            {/* Gradient Background */}
            <div className={cn(
              "absolute inset-0 bg-gradient-to-br",
              currentBanner.gradient
            )} />

            {/* Overlay Pattern */}
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <pattern id={`pattern-${currentBanner.id}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="10" cy="10" r="2" fill="white" />
                  </pattern>
                </defs>
                <rect width="100" height="100" fill={`url(#pattern-${currentBanner.id})`} />
              </svg>
            </div>

            {/* Decorative Icons in Background */}
            <div className="absolute top-0 right-0 w-1/3 h-1/3 flex items-center justify-end pr-8 pt-8 opacity-20">
              <Icon className="w-64 h-64 text-white" strokeWidth={0.5} />
            </div>

            <div className="absolute bottom-0 left-0 w-1/4 h-1/4 flex items-center justify-start pl-8 pb-8 opacity-15">
              <Icon className="w-40 h-40 text-white" strokeWidth={0.5} />
            </div>
          </>
        )}

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center text-center px-3 sm:px-4 py-8 sm:py-12 z-10">
          <div className={cn(
            "w-16 sm:w-20 h-16 sm:h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3 sm:mb-6 border border-white/30 shadow-lg overflow-hidden"
          )}>
            {currentBanner.logo_image_url ? (
              <Image
                src={currentBanner.logo_image_url}
                alt=""
                width={80}
                height={80}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <Icon className="w-8 sm:w-10 h-8 sm:h-10 text-white" />
            )}
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 sm:mb-3 drop-shadow-lg line-clamp-2">
            {currentBanner.title}
          </h2>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-white/90 mb-2 sm:mb-4 drop-shadow-md line-clamp-2">
            {currentBanner.subtitle}
          </p>

          <p className="text-xs sm:text-sm md:text-base lg:text-lg text-white/80 max-w-2xl drop-shadow-md line-clamp-3">
            {currentBanner.description}
          </p>

          {currentBanner.id !== '0' && (
            <div className={cn(
              "mt-2 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-white/30 backdrop-blur-md text-white font-medium text-xs sm:text-sm hover:bg-white/40 transition-all border border-white/40 shadow-md"
            )}>
              바로가기 →
            </div>
          )}
        </div>
      </Link>

      {/* Navigation Arrows */}
      {banners.length > 1 && (
        <>
          <button
            onClick={(e) => { e.preventDefault(); goToPrevious() }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-lg z-10"
            aria-label="Previous banner"
          >
            <ChevronLeft className="w-6 h-6 text-foreground" />
          </button>

          <button
            onClick={(e) => { e.preventDefault(); goToNext() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-lg z-10"
            aria-label="Next banner"
          >
            <ChevronRight className="w-6 h-6 text-foreground" />
          </button>

          {/* Dots Indicator */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {banners.map((_, index) => (
              <button
                key={index}
                onClick={(e) => { e.preventDefault(); goToSlide(index) }}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all",
                  index === currentIndex ? "bg-primary w-8" : "bg-white/50 hover:bg-white/80"
                )}
                aria-label={`Go to banner ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
