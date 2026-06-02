'use client'

/**
 * 이웃 별 — 별점 5.0 시스템 (구 신뢰지수/매너온도 36.5 폐지).
 *
 * - score: 평균 별점 (0.0 ~ 5.0). null = 후기 없음.
 * - reviewCount: 누적 후기 개수.
 *
 * 표시 규칙:
 *   후기 0개      → "⭐ 새 이웃" (점수 표시 안 함)
 *   후기 1개 이상 → "⭐ 4.3 (12)"
 */
import { Star, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NeighborStarProps {
  score: number | null
  reviewCount: number | null
  /** "compact" : 카드/배지용 한 줄 / "full" : 모달용 풀 뷰 */
  variant?: 'compact' | 'full'
  className?: string
}

function levelOf(score: number) {
  if (score >= 4.5) return { label: '훌륭한 이웃', color: 'text-emerald-600 dark:text-emerald-400' }
  if (score >= 4.0) return { label: '좋은 이웃',   color: 'text-blue-600 dark:text-blue-400' }
  if (score >= 3.0) return { label: '평범한 이웃', color: 'text-amber-600 dark:text-amber-400' }
  if (score >= 2.0) return { label: '아쉬운 이웃', color: 'text-orange-500 dark:text-orange-400' }
  return { label: '주의 필요', color: 'text-rose-600 dark:text-rose-400' }
}

export function TrustScore({ score, reviewCount, variant = 'full', className }: NeighborStarProps) {
  // legacy alias — 기존 호출처 호환
  return <NeighborStar score={score} reviewCount={reviewCount} variant={variant} className={className} />
}

export function NeighborStar({ score, reviewCount, variant = 'full', className }: NeighborStarProps) {
  const hasReviews = (reviewCount ?? 0) > 0 && score != null
  const lv = hasReviews ? levelOf(score!) : null

  if (variant === 'compact') {
    if (!hasReviews) {
      return (
        <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
          <Star className="w-3.5 h-3.5" />
          새 이웃
        </span>
      )
    }
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
        <Star className={cn('w-3.5 h-3.5 fill-amber-400 stroke-amber-400')} />
        <span className={cn('font-bold tabular-nums', lv!.color)}>{score!.toFixed(1)}</span>
        <span className="text-muted-foreground tabular-nums">({reviewCount})</span>
      </span>
    )
  }

  // full 변형 — 모달용
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className={cn('w-5 h-5', hasReviews ? 'fill-amber-400 stroke-amber-400' : 'text-muted-foreground')} />
          <span className="text-sm font-semibold text-foreground">이웃 별</span>
        </div>
        {hasReviews ? (
          <span className={cn('text-2xl font-bold tabular-nums', lv!.color)}>
            {score!.toFixed(1)}
            <span className="text-sm text-muted-foreground font-medium ml-1">/ 5.0</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">아직 후기가 없어요</span>
        )}
      </div>

      {/* 별 5개 비주얼 (호버나 강조 X — 정적 표시) */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = hasReviews && n <= Math.round(score!)
          return (
            <Star
              key={n}
              className={cn(
                'w-6 h-6 transition-colors',
                filled ? 'fill-amber-400 stroke-amber-400' : 'fill-transparent stroke-muted-foreground/30',
              )}
            />
          )
        })}
        {lv && (
          <span className={cn('ml-2 text-xs font-medium', lv.color)}>{lv.label}</span>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MessageCircle className="w-4 h-4" />
        <span>거래 후기 {(reviewCount ?? 0).toLocaleString()}개</span>
      </div>
    </div>
  )
}
