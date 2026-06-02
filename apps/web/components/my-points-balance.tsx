"use client"

/**
 * 내 포인트 잔액 표시 위젯.
 *   - GET /api/points/balance 호출
 *   - feature flag OFF 거나 plaza 없으면 자동 숨김 (available=0 + pending=0)
 *   - 로그인 안 됐으면 401 → 숨김
 *
 * 사용처:
 *   - MY 페이지 상단
 *   - (선택) 헤더 우측 user 메뉴 안
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { PointCoin } from "@/components/point-coin"

interface BalanceData {
  available: number
  pending: number
  reputation_score?: number
  is_suspended?: boolean
}

interface MyPointsBalanceProps {
  className?: string
  /** href 가 있으면 클릭 시 이동 (기본: /mypage/points 거래 내역) */
  href?: string
  /** "내 포인트" 같은 라벨 표시 여부 */
  showLabel?: boolean
}

export function MyPointsBalance({
  className,
  href = "/mypage/points",
  showLabel = true,
}: MyPointsBalanceProps) {
  const [data, setData] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/points/balance", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          // 401 (비로그인) 등은 그냥 숨김
          if (!cancelled) setError(true)
          return null
        }
        return r.json()
      })
      .then((json) => {
        if (!cancelled && json) setData(json as BalanceData)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 로딩 중에는 placeholder — 비로그인/에러는 완전 숨김
  if (error) return null
  if (loading) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/40 animate-pulse",
          className,
        )}
        aria-hidden
      >
        <span className="w-3.5 h-3.5 rounded-full bg-muted" />
        <span className="w-12 h-3 rounded bg-muted" />
      </div>
    )
  }
  if (!data) return null

  const Wrapper: any = href ? Link : "div"
  const wrapperProps = href ? { href } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-sm font-medium",
        "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100",
        "dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
        "transition-colors whitespace-nowrap",
        href && "cursor-pointer",
        className,
      )}
      aria-label={`내 포인트 ${data.available}P${data.pending > 0 ? `, 대기 ${data.pending}P` : ""}`}
    >
      <PointCoin size="xl" />
      {showLabel && <span className="text-xs font-semibold">내 포인트</span>}
      <span className="font-bold">{data.available.toLocaleString()}</span>
      {data.pending > 0 && (
        <span className="text-[11px] opacity-70">+{data.pending}P 대기</span>
      )}
    </Wrapper>
  )
}
