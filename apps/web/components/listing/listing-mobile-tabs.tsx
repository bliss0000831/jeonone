'use client'

/**
 * 모바일 상단 가로 스크롤 카테고리 탭 (PC 에선 hidden).
 *
 * 당근마켓 모바일 스타일 — 칩 형태 가로 스크롤.
 */
import { cn } from '@/lib/utils'

interface Props {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
}

export function ListingMobileTabs({ options, value, onChange }: Props) {
  return (
    <div className="md:hidden bg-background sticky top-14 z-30">
      <div className="flex items-center gap-2 px-3 py-2.5 overflow-x-auto scrollbar-hide">
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap min-h-[36px]',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-foreground hover:bg-secondary/70',
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
