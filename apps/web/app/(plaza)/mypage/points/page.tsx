"use client"

/**
 * 내 포인트 페이지 — 잔액 + 거래 내역 (적립/사용/회수).
 *  - 헤더의 "내 포인트" 클릭 시 진입
 *  - 정책 안내는 /points-guide 로 별도 분리
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Loader2,
  ArrowDown,
  ArrowUp,
  Clock,
  AlertCircle,
  Info,
} from "lucide-react"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { PointCoin } from "@/components/point-coin"
import { createClient } from "@/lib/supabase/client"
import { cn, formatTimeAgo } from "@/lib/utils"
import type { User } from "@supabase/supabase-js"

interface Tx {
  id: string
  type: "earn" | "spend" | "revert" | "expire" | "manual_adjust" | "penalty" | "event"
  amount: number
  source: string
  source_id: string | null
  status: "pending" | "confirmed" | "reverted"
  evaluation_at: string | null
  confirmed_at: string | null
  reverted_at: string | null
  reverted_reason: string | null
  metadata: Record<string, any>
  created_at: string
}

interface Balance {
  available: number
  pending: number
  lifetime_earned: number
  lifetime_spent: number
  reputation_score: number
}

const SOURCE_LABEL: Record<string, string> = {
  "post.create": "게시글 작성",
  "comment.create": "댓글 작성",
  "secondhand.create": "농기구/자재 등록",
  "sharing.create": "나눔 등록",
  "local_food.create": "로컬푸드 등록",
  "jobs.create": "일손 등록",
  "like.received": "좋아요 받음",
  "signup.bonus": "가입 보너스",
  "daily.login": "일일 출석",
  "local_food.purchase": "로컬푸드 결제",
  "boost.purchase": "부스트 결제",
  "event.purchase": "이벤트 응모",
  "giftcard.purchase": "기프티콘 교환",
}

function sourceLabel(source: string) {
  return SOURCE_LABEL[source] ?? source
}

function txKindClass(t: Tx) {
  if (t.type === "earn" || t.type === "manual_adjust" || t.type === "event") {
    return { sign: "+", color: "text-emerald-600 dark:text-emerald-400" }
  }
  if (t.type === "spend") {
    return { sign: "-", color: "text-rose-600 dark:text-rose-400" }
  }
  return { sign: "−", color: "text-muted-foreground" }
}

function statusBadge(t: Tx) {
  if (t.status === "pending") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        <Clock className="w-2.5 h-2.5" />
        대기
      </span>
    )
  }
  if (t.status === "reverted") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        <AlertCircle className="w-2.5 h-2.5" />
        회수
      </span>
    )
  }
  return null
}

export default function MyPointsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [items, setItems] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<number | null>(0)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/auth/login?redirect=/mypage/points")
        return
      }
      setUser(data.user)
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    setLoadError(false)
    fetch("/api/points/history?cursor=0&limit=30")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("history"))))
      .then((j) => {
        setItems(j.items || [])
        setBalance(j.balance || null)
        setCursor(j.nextCursor)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [user])

  const loadMore = async () => {
    if (cursor == null || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await fetch(`/api/points/history?cursor=${cursor}&limit=30`)
      const j = await r.json()
      setItems((prev) => [...prev, ...(j.items || [])])
      setCursor(j.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header user={user} />
      <main className="max-w-xl mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/mypage"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            마이페이지
          </Link>
          <Link
            href="/points-guide"
            className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <Info className="w-3.5 h-3.5" />
            포인트 안내
          </Link>
        </div>

        {/* 잔액 카드 */}
        <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-white p-5 shadow-lg shadow-amber-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80 mb-1">사용 가능 포인트</p>
              <p className="text-3xl font-bold flex items-end gap-1">
                {(balance?.available ?? 0).toLocaleString()}
                <span className="text-base font-medium opacity-80 mb-1">P</span>
              </p>
            </div>
            <PointCoin size="xl" className="!w-14 !h-14 !text-2xl" />
          </div>
          {balance && (balance.pending > 0 || balance.lifetime_earned > 0) && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="bg-white/15 rounded-lg px-2.5 py-1.5">
                <p className="opacity-70">대기</p>
                <p className="font-bold">{balance.pending.toLocaleString()}P</p>
              </div>
              <div className="bg-white/15 rounded-lg px-2.5 py-1.5">
                <p className="opacity-70">누적 적립</p>
                <p className="font-bold">{balance.lifetime_earned.toLocaleString()}P</p>
              </div>
              <div className="bg-white/15 rounded-lg px-2.5 py-1.5">
                <p className="opacity-70">신뢰도</p>
                <p className="font-bold">{balance.reputation_score}</p>
              </div>
            </div>
          )}
        </div>

        {/* 거래 내역 */}
        <section>
          <h2 className="text-sm font-semibold mb-2 px-1">거래 내역</h2>
          {items.length === 0 ? (
            loadError ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
                거래 내역을 불러오지 못했어요
                <br />
                <button onClick={() => window.location.reload()} className="mt-2 text-xs underline">
                  다시 시도
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
                아직 거래 내역이 없어요
                <br />
                <span className="text-xs">글을 작성하면 포인트가 적립됩니다</span>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {items.map((t) => {
                const k = txKindClass(t)
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-3">
                    <span
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                        t.type === "spend"
                          ? "bg-rose-100 text-rose-600 dark:bg-rose-950/40"
                          : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40",
                      )}
                    >
                      {t.type === "spend" ? (
                        <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUp className="w-4 h-4" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {sourceLabel(t.source)}
                        </span>
                        {statusBadge(t)}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatTimeAgo(t.created_at)}
                        {t.reverted_reason && (
                          <span className="ml-1">· 사유: {t.reverted_reason}</span>
                        )}
                      </p>
                    </div>
                    <span className={cn("text-sm font-bold whitespace-nowrap", k.color)}>
                      {k.sign}
                      {t.amount.toLocaleString()}P
                    </span>
                  </div>
                )
              })}
              {cursor != null && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      불러오는 중...
                    </>
                  ) : (
                    "더 보기"
                  )}
                </button>
              )}
            </div>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  )
}
