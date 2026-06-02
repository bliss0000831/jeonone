"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Link2, Share2, X, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { shareToKakao, type KakaoShareMeta } from "@/lib/integrations/kakao"

interface ShareSheetProps {
  open: boolean
  onClose: () => void
  meta: KakaoShareMeta
}

/** 상세페이지 공용 공유 바텀시트 — 카카오톡 / 링크복사 / 기타앱 */
export function ShareSheet({ open, onClose, meta }: ShareSheetProps) {
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      setCopied(false)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    // 스크롤 잠금
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  const url =
    meta.url ?? (typeof window !== "undefined" ? window.location.href : "")

  const handleKakao = async () => {
    try {
      setError(null)
      await shareToKakao(meta)
      // 카카오 공유창이 뜬 뒤 닫기
      setTimeout(onClose, 300)
    } catch (e: any) {
      setError(e?.message || "카카오톡 공유 실패")
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        onClose()
      }, 900)
    } catch {
      setError("링크 복사에 실패했습니다")
    }
  }

  const handleNative = async () => {
    if (typeof navigator === "undefined" || !navigator.share) {
      await handleCopy()
      return
    }
    try {
      await navigator.share({
        title: meta.title,
        text: meta.description,
        url,
      })
      onClose()
    } catch {
      // 사용자가 취소한 경우 무시
    }
  }

  const hasNative =
    typeof navigator !== "undefined" && typeof navigator.share === "function"

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Backdrop */}
      <button
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
      />

      {/* Sheet */}
      <div
        className={cn(
          "relative w-full sm:w-[420px] max-h-[85vh] overflow-auto bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl",
          "p-5 sm:p-6 animate-in slide-in-from-bottom sm:zoom-in-95",
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">공유하기</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-secondary rounded-full transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-2">
          <ShareButton
            onClick={handleKakao}
            label="카카오톡"
            icon={<KakaoIcon />}
            bg="bg-[#FEE500]"
          />
          <ShareButton
            onClick={handleCopy}
            label={copied ? "복사됨" : "링크복사"}
            icon={
              copied ? (
                <Check className="w-6 h-6 text-white" />
              ) : (
                <Link2 className="w-6 h-6 text-white" />
              )
            }
            bg={copied ? "bg-green-500" : "bg-zinc-700"}
          />
          <ShareButton
            onClick={handleNative}
            label={hasNative ? "다른 앱" : "복사"}
            icon={<Share2 className="w-6 h-6 text-white" />}
            bg="bg-primary"
          />
        </div>

        {error && (
          <p className="mt-3 text-xs text-destructive text-center">{error}</p>
        )}

        <p className="mt-4 text-xs text-muted-foreground text-center break-all line-clamp-1">
          {url}
        </p>
      </div>
    </div>,
    document.body,
  )
}

function ShareButton({
  onClick,
  label,
  icon,
  bg,
}: {
  onClick: () => void
  label: string
  icon: React.ReactNode
  bg: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 py-2 rounded-xl hover:bg-secondary/60 transition-colors"
    >
      <div
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-sm",
          bg,
        )}
      >
        {icon}
      </div>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </button>
  )
}

function KakaoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-7 h-7"
      fill="#181600"
      aria-hidden="true"
    >
      <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.79 1.86 5.238 4.646 6.642-.205.77-.74 2.786-.847 3.22-.133.537.197.53.414.386.17-.113 2.72-1.847 3.82-2.598.632.09 1.284.138 1.967.138 5.523 0 10-3.477 10-7.788C22 6.477 17.523 3 12 3z" />
    </svg>
  )
}
