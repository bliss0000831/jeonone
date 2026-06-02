'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** 날짜 구분 칩 (오늘 / 어제 / 2026년 4월 20일) */
export function DateDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span
        className="text-xs text-muted-foreground px-3 py-1.5 rounded-full shadow-sm backdrop-blur-sm"
        style={{ backgroundColor: 'var(--chat-pill)' }}
      >
        {children}
      </span>
    </div>
  )
}

/** 시스템 이벤트 pill — "주최자가 주문을 시작했습니다" 등 */
export function SystemEvent({
  icon,
  children,
}: {
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-center py-1">
      <div
        className="flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-full text-xs text-muted-foreground shadow-sm backdrop-blur-sm"
        style={{ backgroundColor: 'var(--chat-pill)' }}
      >
        {icon}
        <span>{children}</span>
      </div>
    </div>
  )
}

interface BubbleProps {
  isMe: boolean
  showAvatar?: boolean
  senderId?: string
  senderName?: string | null
  senderAvatarUrl?: string | null
  senderBadge?: ReactNode
  time?: string
  image?: string | null
  children?: ReactNode
}

/** 말풍선 — 내 것은 primary, 상대방은 card + border */
export function MessageBubble({
  isMe,
  showAvatar = true,
  senderId,
  senderName,
  senderAvatarUrl,
  senderBadge,
  time,
  image,
  children,
}: BubbleProps) {
  return (
    <div className={cn('flex gap-2', isMe ? 'justify-end' : 'justify-start')}>
      {!isMe && (
        <div className="w-9 flex-shrink-0">
          {showAvatar && (
            <Link
              href={senderId ? `/profile/${senderId}` : '#'}
              className="block w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-primary transition-all"
            >
              {senderAvatarUrl ? (
                <img
                  src={senderAvatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  {senderName?.[0] || '?'}
                </span>
              )}
            </Link>
          )}
        </div>
      )}

      <div
        className={cn(
          // 모바일 (< 640px) 에선 85% — iPhone SE 320px 에서 텍스트 잘림 방지
          'flex flex-col max-w-[85%] sm:max-w-[70%]',
          isMe ? 'items-end' : 'items-start',
        )}
      >
        {!isMe && showAvatar && (senderName || senderBadge) && (
          <div className="flex items-center gap-1 mb-1 px-1">
            {senderName && (
              <span className="text-xs text-muted-foreground font-medium">
                {senderName}
              </span>
            )}
            {senderBadge}
          </div>
        )}

        <div
          className={cn(
            'flex items-end gap-1.5',
            isMe ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          {image ? (
            <a
              href={image}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'block overflow-hidden rounded-2xl max-w-[240px]',
                isMe ? 'rounded-br-md' : 'rounded-bl-md',
              )}
            >
              <img
                src={image}
                alt=""
                className="w-full h-auto object-cover"
              />
            </a>
          ) : (
            <div
              className={cn(
                'px-3.5 py-2.5 rounded-2xl text-[15px] leading-relaxed break-words whitespace-pre-wrap shadow-sm',
                isMe
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'text-foreground rounded-bl-md border border-border/60',
              )}
              style={
                isMe
                  ? undefined
                  : { backgroundColor: 'var(--chat-bubble-other)' }
              }
            >
              {children}
            </div>
          )}
          {time && (
            <span className="text-[11px] text-muted-foreground flex-shrink-0 mb-0.5">
              {time}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** 시:분 한국어 표시 (오전/오후 12시간) */
export function formatChatTime(iso: string) {
  const d = new Date(iso)
  const hours = d.getHours()
  const minutes = d.getMinutes().toString().padStart(2, '0')
  const period = hours < 12 ? '오전' : '오후'
  const displayHours = hours % 12 || 12
  return `${period} ${displayHours}:${minutes}`
}

/** 오늘/어제/YYYY년 M월 D일 */
export function formatChatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (target.getTime() === today.getTime()) return '오늘'
  if (target.getTime() === yesterday.getTime()) return '어제'
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
