'use client'

/**
 * 리스팅 사이드바 필터 (PC 전용).
 *
 * 좌측 고정. 검색창 + 라디오 필터 그룹들.
 * 모바일에선 hidden — 모바일은 상단 가로 스크롤 카테고리 탭 (ListingMobileCategoryBar) 사용.
 */
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ListingFilterGroup } from './listing-types'

interface Props {
  searchValue?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  filterGroups: ListingFilterGroup[]
  filterValues: Record<string, string>
  onFilterChange: (next: Record<string, string>) => void
  /** "거래 가능만 보기" 같은 추가 토글 */
  extras?: React.ReactNode
}

export function ListingFilterSidebar({
  searchValue = '',
  onSearchChange,
  searchPlaceholder = '검색',
  filterGroups,
  filterValues,
  onFilterChange,
  extras,
}: Props) {
  const setFilter = (key: string, value: string) => {
    onFilterChange({ ...filterValues, [key]: value })
  }

  const reset = () => {
    const next: Record<string, string> = {}
    filterGroups.forEach((g) => {
      next[g.key] = g.options[0]?.value ?? 'all'
    })
    onFilterChange(next)
    onSearchChange?.('')
  }

  return (
    <aside className="sticky top-20 self-start hidden md:flex flex-col gap-5 w-[220px] flex-shrink-0">
      {/* 헤더: 필터 + 초기화 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">필터</h2>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          초기화
        </button>
      </div>

      {/* 검색 */}
      {onSearchChange && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-secondary"
              aria-label="검색어 지우기"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {extras}

      {/* 필터 그룹들 */}
      {filterGroups.map((g) => (
        <div key={g.key} className="space-y-2">
          <h3 className="text-sm font-bold text-foreground">{g.label}</h3>
          <ul className="space-y-1">
            {g.options.map((opt) => {
              const checked = filterValues[g.key] === opt.value
              return (
                <li key={opt.value}>
                  <label
                    className={cn(
                      'flex items-center gap-2 text-sm cursor-pointer py-1 px-1 rounded transition-colors',
                      'hover:text-foreground',
                      checked ? 'text-foreground font-medium' : 'text-muted-foreground',
                    )}
                  >
                    <input
                      type="radio"
                      name={g.key}
                      value={opt.value}
                      checked={checked}
                      onChange={() => setFilter(g.key, opt.value)}
                      className="w-3.5 h-3.5 text-primary focus:ring-primary/30"
                    />
                    <span className="flex-1">{opt.label}</span>
                    {opt.count != null && (
                      <span className="text-xs text-muted-foreground">{opt.count}</span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </aside>
  )
}
