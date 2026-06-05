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

// 어르신용: SNS식 팔로워/팔로잉 대신 "올린 글 · 이웃 · 받은 후기" 로 구성.
export function ProfileCounters({
  posts,
  followers,
  trustScore,
  reviewCount,
  onClick,
}: ProfileCountersProps) {
  const rc = reviewCount ?? 0
  const validScore =
    trustScore != null && trustScore >= 0 && trustScore <= 5 && rc > 0
      ? trustScore
      : null

  return (
    <div className="grid grid-cols-3 divide-x divide-border bg-card rounded-xl border border-border overflow-hidden">
      {/* 올린 글 */}
      <button
        type="button"
        onClick={() => onClick?.("posts")}
        className={cn(
          "py-3.5 px-1 text-center transition-colors",
          onClick && "hover:bg-secondary/60 active:bg-secondary",
        )}
      >
        <div className="font-extrabold text-xl leading-tight">{formatCount(posts)}</div>
        <div className="text-sm text-muted-foreground mt-0.5 font-medium">올린 글</div>
      </button>

      {/* 이웃 (팔로워) */}
      <button
        type="button"
        onClick={() => onClick?.("followers")}
        className={cn(
          "py-3.5 px-1 text-center transition-colors",
          onClick && "hover:bg-secondary/60 active:bg-secondary",
        )}
      >
        <div className="font-extrabold text-xl leading-tight">{formatCount(followers)}</div>
        <div className="text-sm text-muted-foreground mt-0.5 font-medium">이웃</div>
      </button>

      {/* 받은 후기 (별점) */}
      <button
        type="button"
        onClick={() => onClick?.("trust")}
        className={cn(
          "py-3.5 px-1 text-center transition-colors",
          "bg-amber-50/60 dark:bg-amber-950/20",
          onClick && "hover:bg-amber-100/70 dark:hover:bg-amber-900/30 active:bg-amber-100",
        )}
        aria-label={
          validScore != null
            ? `받은 후기 별점 ${validScore.toFixed(1)}, 후기 ${rc}개 — 보기`
            : "아직 받은 후기 없음 — 후기 보기"
        }
      >
        <div className="flex items-center justify-center gap-0.5 font-extrabold text-xl leading-tight text-amber-700 dark:text-amber-400 tabular-nums">
          <Star
            className={cn(
              "w-4 h-4",
              validScore != null ? "fill-amber-400 stroke-amber-400" : "stroke-amber-500/60",
            )}
          />
          {validScore != null ? validScore.toFixed(1) : "0"}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5 font-medium">
          받은 후기 {rc > 0 ? `(${rc})` : ""}
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
