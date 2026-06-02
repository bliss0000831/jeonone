"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, ChevronLeft, ChevronRight, Trash2, Loader2 } from "lucide-react"
import type { Highlight } from "./profile-highlights"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface StoryViewerProps {
  items: Highlight[]
  startIndex: number
  authorName?: string | null
  authorAvatar?: string | null
  /** 본인 프로필인 경우 true — 삭제 버튼 표시 */
  canDelete?: boolean
  /** 삭제 성공 시 부모가 목록에서 제거 */
  onDelete?: (id: string) => void
  onClose: () => void
}

const IMAGE_DURATION = 5000 // 이미지 5초
const VIDEO_MAX_DURATION = 15000 // 비디오 최대 15초 cap

export function StoryViewer({
  items,
  startIndex,
  authorName,
  authorAvatar,
  canDelete = false,
  onDelete,
  onClose,
}: StoryViewerProps) {
  const [index, setIndex] = useState(startIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const startRef = useRef<number>(Date.now())
  const elapsedRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => setMounted(true), [])

  const current = items[index]
  const isVideo = current?.media_type === "video"
  const duration = Math.min(
    current?.duration_ms || (isVideo ? VIDEO_MAX_DURATION : IMAGE_DURATION),
    isVideo ? VIDEO_MAX_DURATION : IMAGE_DURATION,
  )

  // 진행률 타이머
  useEffect(() => {
    setProgress(0)
    elapsedRef.current = 0
    startRef.current = Date.now()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const tick = () => {
      if (paused) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const now = Date.now()
      const delta = now - startRef.current
      startRef.current = now
      elapsedRef.current += delta
      const p = Math.min(1, elapsedRef.current / duration)
      setProgress(p)
      if (p >= 1) {
        next()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, duration])

  useEffect(() => {
    // paused 전환 시 타임 기준 재설정
    startRef.current = Date.now()
    if (isVideo && videoRef.current) {
      if (paused) videoRef.current.pause()
      else videoRef.current.play().catch(() => {})
    }
  }, [paused, isVideo])

  const next = () => {
    if (index < items.length - 1) setIndex(index + 1)
    else onClose()
  }

  const handleDelete = async () => {
    if (!canDelete || !current || deleting) return
    setPaused(true)
    const ok = confirm("이 하이라이트를 삭제할까요?")
    if (!ok) {
      setPaused(false)
      return
    }
    setDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("profile_highlights")
        .delete()
        .eq("id", current.id)
      if (error) throw error
      onDelete?.(current.id)
      // 현재가 마지막이면 닫고, 아니면 다음으로
      if (items.length <= 1) {
        onClose()
      } else if (index >= items.length - 1) {
        setIndex(Math.max(0, index - 1))
      }
      // index 는 유지 → 자동으로 다음 아이템이 현재 자리를 채움
    } catch (e: any) {
      toast.error(e?.message || "삭제 실패")
    } finally {
      setDeleting(false)
      setPaused(false)
    }
  }
  const prev = () => {
    if (index > 0) setIndex(index - 1)
    else {
      // 첫 스토리에서 뒤로 → 다시시작
      elapsedRef.current = 0
      setProgress(0)
      startRef.current = Date.now()
    }
  }

  // 키보드
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") next()
      else if (e.key === "ArrowLeft") prev()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // 스와이프 다운 → 닫기
  const touchStartY = useRef<number | null>(null)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (dy > 80) onClose()
    touchStartY.current = null
  }

  if (!mounted || !current) return null

  const mediaUrl = current.media_url || current.cover_url

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 상단 progress bars */}
      <div className="absolute top-0 inset-x-0 z-20 p-2 flex gap-1">
        {items.map((_, i) => (
          <div
            key={i}
            className="h-0.5 flex-1 bg-white/30 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-white transition-[width] duration-100"
              style={{
                width:
                  i < index ? "100%" : i === index ? `${progress * 100}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      {/* 상단 헤더 */}
      <div className="absolute top-4 inset-x-0 z-20 px-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={authorAvatar}
              alt={authorName || "프로필"}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-white/30"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20" />
          )}
          <div className="flex flex-col">
            <span className="text-white text-sm font-medium">
              {authorName || "프로필"}
            </span>
            <span className="text-white/70 text-xs">{current.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 pointer-events-auto">
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="p-2 text-white rounded-full hover:bg-white/10 disabled:opacity-50"
              aria-label="삭제"
            >
              {deleting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white rounded-full hover:bg-white/10"
            aria-label="닫기"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 미디어 */}
      <div
        className="relative w-full h-full md:max-w-2xl mx-auto flex items-center justify-center"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        onTouchStartCapture={() => setPaused(true)}
        onTouchEndCapture={() => setPaused(false)}
      >
        {isVideo && mediaUrl ? (
          <video
            ref={videoRef}
            key={current.id}
            src={mediaUrl}
            autoPlay
            playsInline
            muted={false}
            className="max-w-full max-h-full object-contain"
            onEnded={next}
          />
        ) : mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt={current.title}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-white/60">미디어 없음</div>
        )}
      </div>

      {/* 좌우 탭 영역 */}
      <button
        type="button"
        onClick={prev}
        className="absolute left-0 top-0 bottom-0 w-1/3 z-10 flex items-center justify-start pl-2 text-white/0 hover:text-white/70 transition-colors"
        aria-label="이전"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        type="button"
        onClick={next}
        className="absolute right-0 top-0 bottom-0 w-1/3 z-10 flex items-center justify-end pr-2 text-white/0 hover:text-white/70 transition-colors"
        aria-label="다음"
      >
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>,
    document.body,
  )
}
