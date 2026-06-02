"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Siren, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface ReportButtonProps {
  targetType:
    | "secondhand"
    | "jobs"
    | "sharing"
    | "clubs"
    | "new-store"
    | "board"
    | "property"
    | "group_buying"
    | "local_food"
    | "interior"
    | "moving"
    | "cleaning"
    | "repair"
    | "requests"
    | "service-requests"
  targetId: string
  targetUserId?: string
  className?: string
  /** "icon" (기본) — 아이콘만, "button" — 아이콘+"신고" 텍스트 */
  variant?: "button" | "icon"
}

const REASONS: { value: string; label: string }[] = [
  { value: "commercial", label: "업자 의심" },
  { value: "spam", label: "스팸/광고" },
  { value: "fraud", label: "사기 의심" },
  { value: "inappropriate", label: "부적절한 내용" },
  { value: "other", label: "기타" },
]

export function ReportButton({ targetType, targetId, className, variant = "icon" }: ReportButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>("commercial")
  const [detail, setDetail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 모달 열릴 때 body 스크롤 잠금 (위치 흔들림 방지)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, reasonDetail: detail || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("신고가 접수되었습니다. 감사합니다.")
        setOpen(false)
        setDetail("")
      } else if (res.status === 409) {
        toast("이미 신고하신 글입니다.")
        setOpen(false)
      } else if (res.status === 400 && typeof data.error === "string" && data.error.includes("본인")) {
        toast("본인이 작성한 글은 신고할 수 없습니다.")
        setOpen(false)
      } else if (res.status === 401) {
        toast("로그인이 필요합니다.")
      } else {
        toast.error(data.error || "신고에 실패했습니다.")
      }
    } catch {
      toast.error("신고 요청 중 오류가 발생했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          variant === "icon"
            ? "p-2 hover:bg-secondary rounded-full transition-colors"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors",
          className,
        )}
        aria-label="신고하기"
      >
        <Siren className={variant === "icon" ? "w-5 h-5" : "w-4 h-4"} />
        {variant === "button" && <span>신고</span>}
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Siren className="w-5 h-5 text-destructive" />
                신고하기
              </h2>
              <button
                onClick={() => !submitting && setOpen(false)}
                className="p-1 hover:bg-secondary rounded-full"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              허위 신고 시 서비스 이용이 제한될 수 있습니다.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium">사유</label>
              <div className="space-y-1.5">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      reason === r.value
                        ? "border-destructive bg-destructive/5"
                        : "border-border hover:bg-secondary/50",
                    )}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={(e) => setReason(e.target.value)}
                      className="accent-destructive"
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                상세 내용 <span className="text-muted-foreground text-xs">(선택)</span>
              </label>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="신고 사유를 자세히 적어주세요"
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-destructive resize-none text-sm"
              />
              <div className="text-right text-xs text-muted-foreground">{detail.length}/500</div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => !submitting && setOpen(false)}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg border border-border hover:bg-secondary transition-colors text-sm font-medium disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                신고 제출
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
