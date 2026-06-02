'use client'

import { memo } from 'react'
import { Review } from '@/types/app'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { ko } from 'date-fns/locale'

interface ReviewCardProps {
  review: Review
}

export const ReviewCard = memo(function ReviewCard({ review }: ReviewCardProps) {
  const avgScore = review.total_score
  const getScoreColor = (score: number) => {
    if (score >= 4.5) return 'text-green-500'
    if (score >= 3.5) return 'text-blue-500'
    if (score >= 2.5) return 'text-yellow-500'
    return 'text-red-500'
  }

  return (
    <div className="p-4 border border-border rounded-lg hover:bg-secondary/30 transition-colors">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-foreground text-sm">{review.reviewer_name}</h4>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(review.created_at), {
              addSuffix: true,
              locale: ko,
            })}
          </p>
        </div>
        <div className={cn('text-lg font-bold', getScoreColor(avgScore))}>
          {avgScore.toFixed(1)}
        </div>
      </div>

      {/* 평가 항목 */}
      <div className="grid grid-cols-3 gap-2 mb-3 pb-3 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground mb-1">응답속도</p>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'w-3 h-3',
                  i < review.response_speed ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                )}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">정보정확도</p>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'w-3 h-3',
                  i < review.accuracy ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                )}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">친절도</p>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'w-3 h-3',
                  i < review.kindness ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 후기 내용 */}
      {review.content && (
        <p className="text-sm text-foreground line-clamp-3">{review.content}</p>
      )}
    </div>
  )
})
