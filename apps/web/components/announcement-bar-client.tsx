'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Megaphone, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  message: string
  link?: string
  variant?: string
}

// 하루 동안 같은 메시지는 다시 안 보이도록 localStorage에 dismiss 기록
export function AnnouncementBarClient({ message, link, variant = 'info' }: Props) {
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try {
      const key = `anno:${message}`
      const dismissedAt = localStorage.getItem(key)
      if (dismissedAt) {
        const age = Date.now() - Number(dismissedAt)
        if (age < 1000 * 60 * 60 * 24) {
          setHidden(true)
          return
        }
      }
      setHidden(false)
    } catch {
      setHidden(false)
    }
  }, [message])

  const onClose = () => {
    try {
      localStorage.setItem(`anno:${message}`, String(Date.now()))
    } catch {}
    setHidden(true)
  }

  if (hidden) return null

  const style =
    variant === 'warning'
      ? 'bg-amber-500 text-white'
      : variant === 'success'
      ? 'bg-emerald-600 text-white'
      : variant === 'danger'
      ? 'bg-rose-600 text-white'
      : 'bg-primary text-primary-foreground'

  const Icon =
    variant === 'warning'
      ? AlertTriangle
      : variant === 'success'
      ? CheckCircle2
      : variant === 'danger'
      ? AlertTriangle
      : variant === 'megaphone'
      ? Megaphone
      : Info

  const inner = (
    <span className="flex items-center gap-2">
      <Icon className="w-4 h-4 shrink-0" />
      <span className="line-clamp-1">{message}</span>
    </span>
  )

  return (
    <div className={cn('w-full text-sm', style)}>
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        {link ? (
          <Link href={link} className="flex-1 hover:underline">
            {inner}
          </Link>
        ) : (
          <div className="flex-1">{inner}</div>
        )}
        <button
          aria-label="공지 닫기"
          onClick={onClose}
          className="p-1 rounded hover:bg-black/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
