'use client'

import Link from 'next/link'
import { UserPlus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StripParticipant {
  id: string
  nickname: string | null
  avatar_url?: string | null
  /** 예: 주최 / 판매자 / 방장 — 아바타 우측 하단 점으로 표시 */
  badge?: 'owner' | 'host' | 'seller' | null
  /** 프로필 링크 원하면 profileHref 넘기기 */
  profileHref?: string | null
}

interface Props {
  participants: StripParticipant[]
  /** 총원/정원 (예: 2/4). 정원 없으면 max 생략 */
  total?: number
  max?: number | null
  onInvite?: () => void
  inviteLabel?: string
  /** 부제 텍스트 (예: 정원마감 / 모집중) */
  statusLabel?: string
  className?: string
  /** 아바타 최대 표시 개수 (나머지는 +N) */
  maxAvatars?: number
}

const BADGE_COLOR: Record<NonNullable<StripParticipant['badge']>, string> = {
  owner: 'bg-amber-500',
  host: 'bg-indigo-500',
  seller: 'bg-primary',
}

/** 헤더 바로 아래 가로 참가자 스트립 — 부동산 채팅의 "참가자 전원 표시" 패턴을 공용화 */
export function ParticipantStrip({
  participants,
  total,
  max,
  onInvite,
  inviteLabel = '초대',
  statusLabel,
  className,
  maxAvatars = 8,
}: Props) {
  const visible = participants.slice(0, maxAvatars)
  const overflow = participants.length - visible.length

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 bg-card/60 border-b border-border',
        className,
      )}
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <Users className="w-3.5 h-3.5" />
        <span>
          참가자{' '}
          <span className="font-medium text-foreground">
            {total ?? participants.length}
          </span>
          {typeof max === 'number' && max > 0 && (
            <span className="text-muted-foreground">/{max}</span>
          )}
        </span>
        {statusLabel && (
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {statusLabel}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none">
        {visible.map((p) => {
          const initial = p.nickname?.[0] || '?'
          const content = (
            <div className="relative">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border">
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {initial}
                  </span>
                )}
              </div>
              {p.badge && (
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card',
                    BADGE_COLOR[p.badge],
                  )}
                  aria-label={p.badge}
                />
              )}
            </div>
          )
          return p.profileHref ? (
            <Link
              key={p.id}
              href={p.profileHref}
              className="shrink-0 hover:opacity-80 transition-opacity"
              title={p.nickname ?? undefined}
            >
              {content}
            </Link>
          ) : (
            <div
              key={p.id}
              className="shrink-0"
              title={p.nickname ?? undefined}
            >
              {content}
            </div>
          )
        })}
        {overflow > 0 && (
          <div className="shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium text-muted-foreground">
            +{overflow}
          </div>
        )}
      </div>

      {onInvite && (
        <button
          onClick={onInvite}
          className="shrink-0 flex items-center gap-1 text-xs text-primary hover:bg-primary/5 px-2 py-1 rounded-full transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {inviteLabel}
        </button>
      )}
    </div>
  )
}
