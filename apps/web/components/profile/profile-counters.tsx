"use client"

import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

export type CounterKind = "posts" | "followers" | "following" | "trust"

interface ProfileCountersProps {
  /** 표시 안 함 — 호환성용으로만 받음 */
  posts: number
  followers: number
  following: number
  /** 이웃 별 평균 점수 (0.0~5.0). NULL/0 = 후기 없음 */
  trustScore?: number | null
  reviewCount?: number | null
  onClick?: (kind: CounterKind) => void
}

export function ProfileCounters({
  followers,
  following,
  trustScore,
  reviewCount,
  onClick,
}: ProfileCountersProps) {
  const rc = reviewCount ?? 0
  // 0~5 범위 밖이거나 후기 0 이면 'NEW' 처리
  const validScore =
    trustScore != null && trustScore >= 0 && trustScore <= 5 && rc > 0
      ? trustScore
      : null

  return (
    <div className="grid grid-cols-3 divide-x divide-border bg-card rounded-xl border border-border overflow-hidden">
      {/* 팔로워 */}
      <button
        type="button"
        onClick={() => onClick?.("followers")}
        className={cn(
          "py-2.5 px-1 text-center transition-colors",
          onClick && "hover:bg-secondary/60 active:bg-secondary",
        )}
      >
        <div className="font-bold text-[15px] leading-tight">{formatCount(followers)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">팔로워</div>
      </button>

      {/* 팔로잉 */}
      <button
        type="button"
        onClick={() => onClick?.("following")}
        className={cn(
          "py-2.5 px-1 text-center transition-colors",
          onClick && "hover:bg-secondary/60 active:bg-secondary",
        )}
      >
        <div className="font-bold text-[15px] leading-tight">{formatCount(following)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">팔로잉</div>
      </button>

      {/* 이웃 별 */}
      <button
        type="button"
        onClick={() => onClick?.("trust")}
        className={cn(
          "py-2.5 px-1 text-center transition-colors",
          "bg-amber-50/60 dark:bg-amber-950/20",
          onClick && "hover:bg-amber-100/70 dark:hover:bg-amber-900/30 active:bg-amber-100",
        )}
        aria-label={
          validScore != null
            ? `이웃 별 ${validScore.toFixed(1)}, 후기 ${rc}개 — 보기`
            : "아직 후기 없음 — 후기 보기"
        }
      >
        <div className="flex items-center justify-center gap-0.5 font-bold text-[15px] leading-tight text-amber-700 dark:text-amber-400 tabular-nums">
          <Star
            className={cn(
              "w-3.5 h-3.5",
              validScore != null ? "fill-amber-400 stroke-amber-400" : "stroke-amber-500/60",
            )}
          />
          {validScore != null ? validScore.toFixed(1) : "0"}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          이웃 별 {rc > 0 ? `(${rc})` : ""}
        </div>
      </button>
    </div>
  )
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}천`
  return String(n)
}
