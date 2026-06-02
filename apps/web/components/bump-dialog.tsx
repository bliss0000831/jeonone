"use client"

/**
 * 글 올리기 모달.
 *  - 무료 잔여 표시
 *  - 무료 / 포인트 / 올리기권 3가지 결제 옵션
 *  - 본인 글 카드 메뉴 또는 상세 페이지 메뉴에서 호출
 */

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Sparkles, X, ArrowUp, Lock, Loader2, Ticket } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface BumpStatus {
  freeRemaining: number
  freeTotal: number
  pointsCost: number
  krwCost: number
  ticketBalance: number
  cooldownUntil: string | null
  accountAgeOk: boolean
  canBumpFree: boolean
  canBumpPaid: boolean
}

type BumpTarget =
  | "property"
  | "secondhand"
  | "interior"
  | "moving"
  | "cleaning"
  | "repair"
  | "group_buying"
  | "local_food"
  | "jobs"
  | "new_store"

interface BumpDialogProps {
  open: boolean
  onClose: () => void
  targetType: BumpTarget
  targetId: string
  /** 올리기 성공 시 호출 (UI 갱신용) */
  onBumped?: () => void
}

export function BumpDialog({ open, onClose, targetType, targetId, onBumped }: BumpDialogProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const [status, setStatus] = useState<BumpStatus | null>(null)
  const [pointsBalance, setPointsBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const ac = new AbortController()
    Promise.all([
      fetch(`/api/bump/status?type=${targetType}&id=${targetId}`, { signal: ac.signal }).then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error ?? "상태를 불러올 수 없습니다")
        }
        return r.json()
      }),
      fetch("/api/points/balance", { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([s, bal]) => {
        if (ac.signal.aborted) return
        setStatus(s as BumpStatus)
        if (bal && typeof bal.available === "number") setPointsBalance(bal.available)
      })
      .catch((e: any) => {
        if (e?.name === "AbortError" || ac.signal.aborted) return
        toast.error(e.message ?? "오류가 발생했습니다")
        onClose()
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => {
      ac.abort()
    }
  }, [open, targetType, targetId, onClose])

  // ESC 로 닫기 + body 스크롤 잠금 (제출 중에는 ESC 무시)
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
  }, [open, onClose, submitting])

  const submit = async (payment: "free" | "points" | "ticket") => {
    if (submitting) return
    setSubmitting(true)
    // 12초 timeout — 백엔드 응답 없으면 강제 종료 + 사용자에게 명확한 에러.
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 12_000)
    try {
      const res = await fetch("/api/bump/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, payment }),
        signal: ac.signal,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const reason = String(json?.error ?? "fail")
        const map: Record<string, string> = {
          no_free_quota: "오늘의 무료 올리기를 모두 사용했어요",
          no_tickets: "올리기권이 없어요. 먼저 충전해 주세요",
          cooldown: "방금 올린 글이에요. 잠시 후 다시 시도해 주세요",
          account_too_young: "가입 7일 이후부터 올리기를 사용할 수 있어요",
          insufficient_balance: "포인트가 부족해요",
          feature_disabled: "지금은 올리기 기능을 사용할 수 없어요",
          not_owner: "본인 글만 올릴 수 있어요",
          not_found_or_not_owner: "본인 글만 올릴 수 있어요",
          plaza_required: "광장 정보가 없습니다. 새로고침 후 다시 시도해주세요",
        }
        // eslint-disable-next-line no-console
        console.error("[bump] failed", { status: res.status, reason, json })
        toast.error(map[reason] ?? `올리기 실패 (${reason})`)
        return
      }
      toast.success("맨 위로 올라갔어요 ⬆️")
      onBumped?.()
      onClose()
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[bump] exception", err)
      if (err?.name === "AbortError") {
        toast.error("응답이 너무 느립니다. 잠시 후 다시 시도해주세요")
      } else {
        toast.error("네트워크 오류 — 다시 시도해주세요")
      }
    } finally {
      clearTimeout(timer)
      setSubmitting(false)
    }
  }

  if (!open || !mounted) return null

  // body 로 portal — 부모가 <a> 안이면 anchor nesting hydration error 발생하므로 격리
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full md:w-[420px] max-h-[90vh] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ArrowUp className="w-5 h-5 text-primary" />
            글 올리기
          </h3>
          <button onClick={onClose} aria-label="닫기" className="p-1 rounded-full hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !status ? (
            <p className="text-sm text-muted-foreground py-6 text-center">상태를 불러올 수 없어요</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                내 글을 다시 최신순 맨 위로 올립니다. (다른 분이 글을 올리면 자연스럽게 밀려요)
              </p>

              {/* 가입 연령 차단 */}
              {!status.accountAgeOk && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-200">
                  <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>가입 후 7일이 지나야 올리기를 사용할 수 있어요. 어뷰징 방지를 위한 정책이에요.</span>
                </div>
              )}

              {/* Cooldown 차단 */}
              {status.cooldownUntil && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-200">
                  <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>방금 올린 글이에요. 30분 후 다시 시도해 주세요.</span>
                </div>
              )}

              {/* 잔여 표시 — 무료 / 올리기권 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-secondary/40 text-sm">
                  <span className="text-xs text-muted-foreground">무료 잔여</span>
                  <span className="font-semibold">{status.freeRemaining}/{status.freeTotal}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-secondary/40 text-sm">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Ticket className="w-3 h-3" />
                    올리기권
                  </span>
                  <span className="font-semibold">{status.ticketBalance}장</span>
                </div>
              </div>

              {/* 옵션 버튼들 */}
              <div className="space-y-2 pt-1">
                {/* 무료 */}
                <button
                  onClick={() => submit("free")}
                  disabled={!status.canBumpFree || submitting}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-colors",
                    status.canBumpFree
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <ArrowUp className="w-4 h-4" />
                    무료로 올리기
                  </span>
                  <span className="text-xs opacity-80">
                    {status.canBumpFree ? `잔여 ${status.freeRemaining}회` : "사용 완료"}
                  </span>
                </button>

                {/* 포인트 */}
                <button
                  onClick={() => submit("points")}
                  disabled={!status.canBumpPaid || submitting}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold border transition-colors",
                    status.canBumpPaid
                      ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900"
                      : "border-border bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    포인트로 올리기
                  </span>
                  <span className="text-right">
                    <span className="block text-xs font-bold">
                      {status.pointsCost.toLocaleString()}P
                    </span>
                    {pointsBalance !== null && (
                      <span className="block text-[10px] opacity-70 font-normal">
                        보유 {pointsBalance.toLocaleString()}P
                      </span>
                    )}
                  </span>
                </button>

                {/* 올리기권 */}
                <button
                  onClick={() => submit("ticket")}
                  disabled={!status.canBumpPaid || status.ticketBalance <= 0 || submitting}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold border transition-colors",
                    status.canBumpPaid && status.ticketBalance > 0
                      ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900"
                      : "border-border bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Ticket className="w-4 h-4" />
                    올리기권으로 올리기
                  </span>
                  <span className="text-xs font-bold">
                    {status.ticketBalance > 0 ? `1장 사용 (${status.ticketBalance}장 보유)` : "보유 0장"}
                  </span>
                </button>
              </div>

              {/* 충전 안내 */}
              <Link
                href="/bump-tickets"
                onClick={onClose}
                className="block text-center text-xs text-muted-foreground hover:text-primary transition-colors pt-1"
              >
                <Ticket className="w-3 h-3 inline mr-1" />
                올리기권 충전하기 →
              </Link>

              {submitting && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  처리 중...
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
