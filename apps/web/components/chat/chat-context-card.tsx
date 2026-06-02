'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  image?: string | null
  imageAlt?: string
  imageFallback?: ReactNode
  /** 제목 앞 상태 배지 (예: 판매중/진행중) */
  badge?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** 가격/정원/진행단계 등 강조 표기 */
  meta?: ReactNode
  /** 링크로 동작 */
  href?: string
  onClick?: () => void
  /** 아래 확장 슬롯 — 진행률 등 */
  footer?: ReactNode
  /** 카드 하단 액션 버튼 줄 (당근페이/물품추가 스타일) */
  actions?: ReactNode
  className?: string
}

/** 채팅 헤더 아래 고정 카드 — 당근 스타일: 이미지 + 배지·제목·가격 + 하단 액션 pill */
export function ChatContextCard({
  image,
  imageAlt = '',
  imageFallback,
  badge,
  title,
  subtitle,
  meta,
  href,
  onClick,
  footer,
  actions,
  className,
}: Props) {
  const interactive = Boolean(href || onClick)

  const body = (
    <>
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
          {image ? (
            <img
              src={image}
              alt={imageAlt}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px]">
              {imageFallback ?? '이미지'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {badge}
            <span className="text-sm text-foreground truncate">{title}</span>
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}
          {meta && (
            <p className="text-[15px] font-bold text-foreground mt-0.5 truncate">
              {meta}
            </p>
          )}
        </div>
        {interactive && (
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-1" />
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {actions}
        </div>
      )}
      {footer && <div className="px-4 pb-3">{footer}</div>}
    </>
  )

  const baseClass = cn(
    'block bg-card border-b border-border',
    interactive && 'hover:bg-secondary/50 transition-colors text-left w-full',
    className,
  )

  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass}>
        {body}
      </button>
    )
  }
  return <div className={baseClass}>{body}</div>
}

/** 상태 배지 — 당근 스타일: 제목과 같은 줄에 인라인 */
export function ChatContextBadge({
  children,
  tone = 'emerald',
}: {
  children: ReactNode
  tone?: 'primary' | 'muted' | 'amber' | 'emerald' | 'rose'
}) {
  const palette: Record<string, string> = {
    primary: 'text-primary',
    muted: 'text-muted-foreground',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
  }
  return (
    <span
      className={cn(
        'text-sm font-semibold shrink-0',
        palette[tone] ?? palette.emerald,
      )}
    >
      {children}
    </span>
  )
}

/** 카드 하단에 쓸 pill 액션 버튼 (당근페이 / 물품추가 스타일) */
export function ChatContextAction({
  icon,
  label,
  onClick,
  href,
}: {
  icon?: ReactNode
  label: ReactNode
  onClick?: () => void
  href?: string
}) {
  const className =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card hover:bg-secondary text-[13px] font-medium text-foreground transition-colors shrink-0'
  if (href) {
    return (
      <Link href={href} className={className}>
        {icon}
        {label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  )
}

/** 채팅 영역 상단에 삽입하는 연한 회색 인포 배너 (당근페이 안내 스타일) */
export function ChatInfoBanner({
  icon,
  children,
  actionLabel,
  onAction,
  href,
}: {
  icon?: ReactNode
  children: ReactNode
  actionLabel?: string
  onAction?: () => void
  href?: string
}) {
  return (
    <div className="mx-4 my-3 rounded-xl bg-muted/60 px-4 py-3 text-[13px] text-foreground leading-relaxed">
      <div className="flex items-start gap-2">
        {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
        <p className="flex-1">
          {children}
          {actionLabel &&
            (href ? (
              <Link
                href={href}
                className="ml-1 underline text-muted-foreground hover:text-foreground"
              >
                {actionLabel}
              </Link>
            ) : (
              <button
                type="button"
                onClick={onAction}
                className="ml-1 underline text-muted-foreground hover:text-foreground"
              >
                {actionLabel}
              </button>
            ))}
        </p>
      </div>
    </div>
  )
}
