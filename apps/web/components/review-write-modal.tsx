"use client"

/**
 * 후기 작성 모달 — 별점 5.0 시스템
 *
 * 항목 3가지: 응답속도 / 정확도 / 친절도 (각 1~5)
 * + 자유 텍스트 (선택)
 *
 * 호출 예:
 *   <ReviewWriteModal
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     reviewedUserId={order.seller_id}
 *     reviewedUserName="홍길동"
 *     sourceType="local_food_order"
 *     sourceId={order.id}
 *     onSubmitted={() => reload()}
 *   />
 */
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Star, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export type ReviewSourceType =
  | "local_food_order"
  | "group_buying_order"
  | "property"
  | "secondhand"

interface Props {
  open: boolean
  onClose: () => void
  reviewedUserId: string
  reviewedUserName?: string
  sourceType: ReviewSourceType
  sourceId: string
  onSubmitted?: () => void
}

export function ReviewWriteModal({
  open,
  onClose,
  reviewedUserId,
  reviewedUserName,
  sourceType,
  sourceId,
  onSubmitted,
}: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [responseSpeed, setResponseSpeed] = useState(5)
  const [accuracy, setAccuracy] = useState(5)
  const [kindness, setKindness] = useState(5)
  const [content, setContent] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 모달 닫힐 때 초기화
  useEffect(() => {
    if (!open) {
      setResponseSpeed(5)
      setAccuracy(5)
      setKindness(5)
      setContent("")
      setError(null)
    }
  }, [open])

  // 열림 동안 배경 스크롤 잠금 + Esc 로 닫기 (다른 오버레이와 동작 통일)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, submitting, onClose])

  if (!open || !mounted) return null

  const submit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewed_user_id: reviewedUserId,
          source_type: sourceType,
          source_id: sourceId,
          response_speed: responseSpeed,
          accuracy,
          kindness,
          content: content.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "후기 등록 실패")
        return
      }
      onSubmitted?.()
      onClose()
    } catch (e) {
      setError("처리 중 오류")
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && onClose()} />
      <div className="relative w-full md:w-[460px] max-h-[90vh] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 stroke-amber-400" />
            이웃 별 남기기
          </h3>
          <button
            onClick={() => !submitting && onClose()}
            aria-label="닫기"
            className="p-1 rounded-full hover:bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {reviewedUserName && (
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{reviewedUserName}</strong>님과의
              거래는 어떠셨나요?
            </p>
          )}

          <StarRow
            label="응답속도"
            help="연락에 빨리 답해주셨나요?"
            value={responseSpeed}
            onChange={setResponseSpeed}
          />
          <StarRow
            label="정확도"
            help="설명한 대로 받으셨나요?"
            value={accuracy}
            onChange={setAccuracy}
          />
          <StarRow
            label="친절도"
            help="기분 좋게 거래하셨나요?"
            value={kindness}
            onChange={setKindness}
          />

          <div>
            <label className="text-sm font-medium block mb-1.5">후기 (선택)</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="다른 이웃들에게 도움이 될 한 마디 남겨주세요"
              rows={3}
              maxLength={500}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1 text-right">
              {content.length} / 500
            </p>
          </div>

          {error && (
            <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-md text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            • 한 거래당 한 번만 작성할 수 있습니다.
            <br />
            • 허위 후기 / 도배는 제재 대상입니다.
          </p>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-border bg-card">
          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full h-11 text-sm font-semibold gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "등록 중..." : "후기 등록"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function StarRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string
  help: string
  value: number
  onChange: (v: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">{help}</span>
      </div>
      <div className="flex items-center gap-1.5" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= display
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              className="p-1 -m-1 active:scale-90 transition-transform"
              aria-label={`${label} ${n}점`}
            >
              <Star
                className={cn(
                  "w-7 h-7 transition-colors",
                  active ? "fill-amber-400 stroke-amber-400" : "fill-transparent stroke-muted-foreground/30",
                )}
              />
            </button>
          )
        })}
        <span className="ml-2 text-sm font-bold tabular-nums w-6">{value}</span>
      </div>
    </div>
  )
}
