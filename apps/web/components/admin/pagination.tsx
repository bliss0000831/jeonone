'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

interface Props {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  setPage: (p: number) => void
  search?: string
  setSearch?: (s: string) => void
  searchPlaceholder?: string
}

/**
 * 관리자 리스트 페이지네이션 + 검색 바 (2026-04 audit, #8).
 * useAdminTable 훅과 함께 사용.
 */
export function AdminPagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  setPage,
  search,
  setSearch,
  searchPlaceholder = '검색…',
}: Props) {
  const start = totalCount === 0 ? 0 : page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, totalCount)

  // 페이지 번호 윈도우 — 현재 ± 2 + 처음/끝
  const windowed: (number | 'gap')[] = []
  const maxButtons = 7
  if (totalPages <= maxButtons) {
    for (let i = 0; i < totalPages; i++) windowed.push(i)
  } else {
    windowed.push(0)
    let from = Math.max(1, page - 2)
    let to = Math.min(totalPages - 2, page + 2)
    if (from > 1) windowed.push('gap')
    for (let i = from; i <= to; i++) windowed.push(i)
    if (to < totalPages - 2) windowed.push('gap')
    windowed.push(totalPages - 1)
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4">
      {/* 좌측: 검색 */}
      {setSearch && (
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
          <Input
            value={search ?? ''}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 h-8 text-[13px] bg-muted/30 border-border/50 focus:bg-background"
          />
        </div>
      )}

      {/* 우측: 페이지네이션 */}
      <div className="flex items-center gap-3 ml-auto">
        <span className="text-[12px] text-muted-foreground/70 whitespace-nowrap tabular-nums">
          {start.toLocaleString()}–{end.toLocaleString()} / {totalCount.toLocaleString()}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage(Math.max(0, page - 1))}
            aria-label="이전"
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          {windowed.map((w, i) =>
            w === 'gap' ? (
              <span key={`gap-${i}`} className="px-0.5 text-[11px] text-muted-foreground/50">
                ···
              </span>
            ) : (
              <button
                key={w}
                onClick={() => setPage(w)}
                className={cn(
                  'h-7 min-w-[28px] px-1.5 text-[12px] rounded-md transition-colors',
                  w === page
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {w + 1}
              </button>
            ),
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            aria-label="다음"
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
