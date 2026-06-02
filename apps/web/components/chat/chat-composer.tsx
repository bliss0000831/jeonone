'use client'

import { Plus, Send, Smile } from 'lucide-react'
import { KeyboardEvent, ReactNode, useRef } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void | Promise<void>
  onImagePick?: (file: File) => void
  placeholder?: string
  disabled?: boolean
  sending?: boolean
  /** 좌측 커스텀 버튼 (예: 전문가 초대) — 기본 + 버튼 대체 */
  leftSlot?: ReactNode
  /** 입력창 위쪽 퀵리플라이/배너 영역 */
  topSlot?: ReactNode
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onImagePick,
  placeholder = '메시지 보내기',
  disabled,
  sending,
  leftSlot,
  topSlot,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && !sending && value.trim()) onSend()
    }
  }

  const canSend = Boolean(value.trim()) && !disabled && !sending

  return (
    <div
      className="sticky bottom-0 z-40 bg-card border-t border-border"
      // iOS 가상 키보드 위로 안전하게 띄우기 — safe area inset
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {topSlot && <div className="px-3 pt-2">{topSlot}</div>}
      <div className="flex items-end gap-2 px-3 py-2">
        {/* 좌측: 커스텀 slot 또는 기본 + 버튼 (이미지 첨부 트리거) */}
        {leftSlot ??
          (onImagePick && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onImagePick(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || sending}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary text-foreground disabled:opacity-40"
                aria-label="추가"
              >
                <Plus className="w-5 h-5" />
              </button>
            </>
          ))}

        {/* 입력창 + 내부 이모지 버튼 */}
        <div className="flex-1 min-w-0 relative">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full resize-none rounded-full bg-secondary/70',
              'pl-4 pr-11 py-2 h-10',
              'text-[15px] leading-6 placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
            )}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="이모지"
            tabIndex={-1}
          >
            <Smile className="w-5 h-5" />
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSend()}
          disabled={!canSend}
          className={cn(
            'shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
            canSend
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'text-muted-foreground hover:bg-secondary',
          )}
          aria-label="전송"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/** 당근 스타일 퀵리플라이 — 가로 스크롤 */
export function QuickReplies({
  items,
  onPick,
  disabled,
}: {
  items: string[]
  onPick: (text: string) => void
  disabled?: boolean
}) {
  if (!items.length) return null
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-3 px-3 pb-1">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="shrink-0 text-[13px] px-3.5 py-1.5 rounded-full bg-card hover:bg-secondary text-foreground border border-border disabled:opacity-50 whitespace-nowrap"
        >
          {q}
        </button>
      ))}
    </div>
  )
}
