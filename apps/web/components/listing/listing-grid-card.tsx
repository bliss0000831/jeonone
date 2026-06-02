/**
 * 리스팅 그리드 카드 (PC/태블릿 용).
 *
 * 정사각 이미지 위 + 제목/가격/메타 아래 — 당근마켓 PC 스타일.
 * 모바일에선 hidden, md+ 에서만 보임.
 */
import { memo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ImageOff } from 'lucide-react'
import type { ListingItem, BadgeTone } from './listing-types'

const TONE_CLS: Record<BadgeTone, string> = {
  gray: 'bg-slate-700/85 text-white',
  red: 'bg-red-500/90 text-white',
  amber: 'bg-amber-500/90 text-white',
  sky: 'bg-sky-500/90 text-white',
  emerald: 'bg-emerald-500/90 text-white',
  violet: 'bg-violet-500/90 text-white',
}

export const ListingGridCard = memo(function ListingGridCard({ item }: { item: ListingItem }) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      className="group flex flex-col rounded-xl overflow-hidden bg-card hover:shadow-lg transition-shadow"
    >
      {/* 이미지 영역 — 정사각 */}
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
        {item.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
            {/* 이미지 있을 때만 좌상단 카테고리 칩 오버레이 */}
            {item.categoryChip && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/90 text-foreground backdrop-blur-sm shadow-sm">
                {item.categoryChip}
              </span>
            )}
          </>
        ) : (
          // 이미지 없을 때 — 카테고리 칩이 있으면 가운데 크게, 없으면 ImageOff fallback
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
            {item.categoryChip ? (
              <span className="px-3.5 py-1.5 rounded-full text-[14px] font-semibold text-muted-foreground bg-white/70 dark:bg-black/20">
                {item.categoryChip}
              </span>
            ) : (
              <ImageOff className="w-10 h-10" />
            )}
          </div>
        )}

        {/* 우상단 상태 뱃지 (이미지 유무 무관 항상 표시) */}
        {item.badge && (
          <span
            className={cn(
              'absolute top-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-medium backdrop-blur-sm',
              TONE_CLS[item.badge.tone],
            )}
          >
            {item.badge.text}
          </span>
        )}
      </div>

      {/* 텍스트 영역 */}
      <div className="px-1 py-2.5 flex flex-col gap-0.5 min-w-0">
        <h3 className="text-[15px] font-medium text-foreground line-clamp-1 leading-snug">
          {item.title}
        </h3>
        {item.price && (
          <div className="text-[15px] font-bold text-foreground">{item.price}</div>
        )}
        {(item.meta || item.meta2) && (
          <div className="text-[12px] text-muted-foreground line-clamp-1">
            {item.meta}
            {item.meta && item.meta2 && ' · '}
            {item.meta2}
          </div>
        )}
        {item.stats && (
          <div className="text-[12px] text-muted-foreground flex items-center gap-2 mt-0.5">
            {item.stats}
          </div>
        )}
      </div>
    </Link>
  )
})
