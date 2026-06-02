/**
 * 리스팅 리스트 아이템 (모바일 용).
 *
 * 가로 배치: 큰 정사각 썸네일 (좌, 140px) + 제목/가격/메타 (우) — 당근마켓 모바일 스타일.
 * - 카테고리 칩: 썸네일 좌상단
 * - 상태 배지: 썸네일 좌하단
 * - 더보기 메뉴(⋮): 우상단
 * - 통계: 우하단
 * md+ 에선 hidden.
 */
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

export function ListingListItem({ item }: { item: ListingItem }) {
  return (
    <div className="relative">
      <Link
        href={item.href}
        prefetch={false}
        className="flex gap-3 p-3 active:bg-secondary/50 transition-colors border-b border-border"
      >
        {/* 좌측: 큰 정사각 썸네일 (130px) */}
        <div className="relative w-[130px] h-[130px] flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            // 이미지 없는 게시글(주로 게시판 글) — 카테고리 칩이 있으면 그것을 가운데 크게 표시,
            // 없으면 ImageOff 아이콘으로 fallback
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
              {item.categoryChip ? (
                <span className="px-3 py-1 rounded-full text-[12px] font-semibold text-muted-foreground bg-white/60 dark:bg-black/20">
                  {item.categoryChip}
                </span>
              ) : (
                <ImageOff className="w-8 h-8" />
              )}
            </div>
          )}

          {/* 카테고리 칩 — 썸네일에 이미지 있을 때만 좌상단 오버레이로 표시 */}
          {item.imageUrl && item.categoryChip && (
            <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-white/95 text-foreground backdrop-blur-sm shadow-sm">
              {item.categoryChip}
            </span>
          )}

          {/* 상태 배지 — 썸네일 좌하단 (예약중/거래완료 등) */}
          {item.badge && (
            <span
              className={cn(
                'absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded text-[10px] font-semibold backdrop-blur-sm shadow-sm',
                TONE_CLS[item.badge.tone],
              )}
            >
              {item.badge.text}
            </span>
          )}
        </div>

        {/* 우측: 텍스트 영역 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* 우측 상단의 ⋮ 더보기 메뉴 위치 확보를 위해 제목에 우측 패딩 */}
          <h3
            className={cn(
              'text-[17px] text-foreground line-clamp-2 leading-snug break-keep font-medium',
              item.moreMenu && 'pr-7',
            )}
          >
            {item.title}
          </h3>

          {(item.meta || item.meta2) && (
            <div className="text-[13px] text-muted-foreground line-clamp-1 mt-1">
              {item.meta}
              {item.meta && item.meta2 && ' · '}
              {item.meta2}
            </div>
          )}

          {item.price && (
            <div className="text-[19px] font-bold text-foreground mt-1.5">
              {item.price}
            </div>
          )}

          {item.stats && (
            <div className="text-[12px] text-muted-foreground flex items-center gap-2.5 mt-auto pt-1 justify-end [&_svg]:w-[18px] [&_svg]:h-[18px]">
              {item.stats}
            </div>
          )}
        </div>
      </Link>

      {/* 우측 상단의 ⋮ 더보기 메뉴 — Link 바깥에 절대 위치로 두어 카드 클릭과 분리 */}
      {item.moreMenu && (
        <div className="absolute top-3 right-3 z-10">{item.moreMenu}</div>
      )}
    </div>
  )
}
