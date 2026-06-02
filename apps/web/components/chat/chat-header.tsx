'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  participantCount?: number
  /** 제목 옆 인라인 배지 (예: 매너온도 pill) */
  titleBadge?: ReactNode
  onTitleClick?: () => void
  rightActions?: ReactNode
  className?: string
}

/** 채팅 상단 공용 헤더 — 당근 스타일: 제목은 왼쪽 정렬, 서브타이틀 아래, 우측 액션 */
export function ChatHeader({
  title,
  subtitle,
  participantCount,
  titleBadge,
  onTitleClick,
  rightActions,
  className,
}: Props) {
  const router = useRouter()
  const clickable = Boolean(onTitleClick)

  return (
    <header
      className={cn(
        'safe-top sticky top-0 z-50 bg-card border-b border-border',
        className,
      )}
    >
      <div className="flex items-center gap-1 px-3 h-14">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-1 hover:bg-secondary rounded-full shrink-0"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        <button
          type="button"
          onClick={onTitleClick}
          disabled={!clickable}
          className={cn(
            'flex-1 min-w-0 text-left px-1 transition-opacity',
            clickable ? 'hover:opacity-70 cursor-pointer' : 'cursor-default',
          )}
        >
          <div className="flex items-center gap-1.5">
            <h1 className="text-[17px] font-bold truncate text-foreground">
              {title}
            </h1>
            {titleBadge}
            {typeof participantCount === 'number' && participantCount > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium shrink-0">
                {participantCount}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0">{rightActions}</div>
      </div>
    </header>
  )
}
