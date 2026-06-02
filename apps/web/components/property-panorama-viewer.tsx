"use client"

/**
 * 360° 가상 투어 뷰어 (Pannellum 래퍼).
 *
 * 사용처: 부동산 매물 상세 페이지.
 * 입력: panorama_images = [{ url, title }, ...]
 *
 * 동작:
 *  - 첫 번째 사진을 default 로 표시
 *  - 방 여러 개 있으면 하단에 탭/썸네일로 전환
 *  - 마우스 드래그 / 터치 스와이프로 360° 회전
 *  - 자동 회전 (auto-rotate) 기본 켜짐
 */
import { useEffect, useRef, useState } from "react"
import { loadPannellumScript } from "@/lib/integrations/pannellum"
import { cn } from "@/lib/utils"
import { Loader2, AlertCircle, Maximize2, RotateCw } from "lucide-react"

export interface PanoramaImage {
  url: string
  title?: string | null
}

interface Props {
  images: PanoramaImage[]
  height?: number | string
  className?: string
  /** 자동 회전 활성화 (기본 true) */
  autoRotate?: boolean
}

export function PropertyPanoramaViewer({
  images,
  height = 480,
  className,
  autoRotate = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (images.length === 0) return
    let cancelled = false

    loadPannellumScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        const pannellum = (window as any).pannellum
        if (!pannellum) {
          setError("뷰어 로드 실패")
          return
        }

        // 기존 인스턴스 정리
        if (viewerRef.current) {
          try { viewerRef.current.destroy() } catch {}
          viewerRef.current = null
        }

        const cur = images[activeIdx]
        if (!cur?.url) {
          setError("이미지가 없습니다")
          return
        }

        const v = pannellum.viewer(containerRef.current, {
          type: "equirectangular",
          panorama: cur.url,
          autoLoad: true,
          autoRotate: autoRotate ? -2 : 0,
          autoRotateInactivityDelay: 4000,
          showControls: true,
          showFullscreenCtrl: true,
          showZoomCtrl: true,
          compass: false,
          mouseZoom: true,
          touchPanSpeedCoeffFactor: 1,
        })

        v.on("load", () => {
          if (!cancelled) setReady(true)
        })
        v.on("error", (e: any) => {
          if (!cancelled) setError("이미지를 불러오지 못했어요")
          console.error("[panorama] viewer error", e)
        })

        viewerRef.current = v
      })
      .catch((e) => {
        if (cancelled) return
        console.error("[panorama] script load failed", e)
        setError("뷰어 스크립트 로드 실패")
      })

    return () => {
      cancelled = true
      if (viewerRef.current) {
        try { viewerRef.current.destroy() } catch {}
        viewerRef.current = null
      }
      setReady(false)
    }
  }, [activeIdx, images, autoRotate])

  if (images.length === 0) return null

  const cur = images[activeIdx]

  return (
    <div className={cn("relative w-full", className)}>
      {/* 뷰어 */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden border border-border bg-slate-900"
        style={{ height }}
      />

      {/* 로딩 */}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm rounded-xl pointer-events-none">
          <div className="flex items-center gap-2 text-sm text-white/90">
            <Loader2 className="w-4 h-4 animate-spin" />
            360° 투어 로딩 중...
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/60 rounded-xl">
          <AlertCircle className="w-6 h-6 text-amber-400" />
          <p className="text-sm text-white/90">{error}</p>
        </div>
      )}

      {/* 현재 방 라벨 */}
      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-white text-xs font-medium border border-white/10 shadow-sm">
        🏠 {cur.title || `방 ${activeIdx + 1}`}
      </div>

      {/* 컨트롤 안내 */}
      <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/40 backdrop-blur-md text-white/80 text-[10px] font-medium border border-white/10">
        <RotateCw className="w-3 h-3 inline-block mr-1" />
        드래그로 회전
      </div>

      {/* 방 전환 탭 (2개 이상일 때) */}
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {images.map((img, idx) => {
            const active = idx === activeIdx
            return (
              <button
                key={`${img.url}-${idx}`}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={cn(
                  "relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                  active
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent hover:border-border opacity-70 hover:opacity-100",
                )}
              >
                <img
                  src={img.url}
                  alt={img.title ?? `방 ${idx + 1}`}
                  className="w-20 h-14 object-cover"
                  loading="lazy"
                />
                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-0.5 text-white text-[10px] font-medium text-center">
                  {img.title || `방 ${idx + 1}`}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
