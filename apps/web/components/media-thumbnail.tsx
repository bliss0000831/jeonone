"use client"

/**
 * 카드/목록용 썸네일. URL 확장자로 이미지/동영상을 자동 분기.
 *   - 이미지: next/image (자동 AVIF/WebP 변환 + 크기별 srcset)
 *   - 동영상: 음소거·자동재생 없이 미리보기 프레임(preload=metadata) + 플레이 아이콘 오버레이
 *
 * 사용 위치: 매물/공구/쉐어링/동호회/인테리어 카드 등 전반.
 *
 * next/image 효과:
 *   - R2 원본 (보통 1~2MB) → AVIF 변환 (~50KB) ≈ 95% 압축
 *   - sizes 로 디바이스 폭에 맞는 변형 자동 선택
 *   - 30개 카드 = 6MB → 500KB 수준 (모바일 WebView 큰 개선)
 */

import Image from "next/image"
import { Play } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|ogv|avi)(\?|$)/i

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return VIDEO_EXT_RE.test(url)
}

interface MediaThumbnailProps {
  src: string
  alt?: string
  className?: string
  /** object-fit style (default: cover) */
  fit?: "cover" | "contain"
  /** LCP 최적화 — 첫 화면에 보이는 카드는 true (보통 위 2~4개) */
  priority?: boolean
  /** 반응형 sizes (default: 모바일 50vw, sm 33vw, lg 25vw — grid-cols-2/3/4 기준) */
  sizes?: string
}

export function MediaThumbnail({
  src,
  alt = "",
  className,
  fit = "cover",
  priority = false,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: MediaThumbnailProps) {
  const video = isVideoUrl(src)
  const objectClass = fit === "contain" ? "object-contain" : "object-cover"
  const [loaded, setLoaded] = useState(false)

  if (video) {
    return (
      <>
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          className={cn(
            "absolute inset-0 w-full h-full bg-black",
            objectClass,
            className,
          )}
        />
        {/* 플레이 오버레이 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>
        </div>
      </>
    )
  }

  // priority 가 아니면 lazy (스크롤 후 로드 — 카드 30개 중 화면 밖 26개 미로드)
  // fade-in 효과: opacity-0 → 100. 이미지 도착 깜빡임 부드럽게.
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      quality={75}
      priority={priority}
      // priority 시 fetchPriority="high" 자동 — LCP 후보 우선 로드
      // referrerPolicy 는 next/image 내부 처리, 명시 X
      onLoad={() => setLoaded(true)}
      className={cn(
        "transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0",
        objectClass,
        className,
      )}
    />
  )
}
