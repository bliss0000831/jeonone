"use client"

/**
 * ListingToolbar — 전체보기 페이지 공용 검색/필터/정렬 툴바
 *
 * 3단 구성:
 *   1) 검색창 (우측 X 버튼으로 클리어)
 *   2) 필터 칩(가로 스크롤) — 여러 축 지원 + 활성 N개 뱃지
 *   3) 정렬 드롭다운 + 결과 개수 표시
 *
 * 사용 예:
 *   <ListingToolbar
 *     searchPlaceholder="가게명, 주소 검색"
 *     searchValue={q} onSearchChange={setQ}
 *     filterGroups={[
 *       { key: "category", label: "카테고리", options: [...] },
 *       { key: "status",   label: "상태",     options: [...] },
 *     ]}
 *     filterValues={filters} onFilterChange={setFilters}
 *     sortOptions={[{value:"latest",label:"최신순"},...]}
 *     sortValue={sort} onSortChange={setSort}
 *     resultCount={items.length}
 *     resultLabel="가게"
 *   />
 */

import { useMemo, type ReactNode } from "react"
import { Search, X, SlidersHorizontal, RotateCcw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface FilterOption {
  value: string
  label: string
}

export interface FilterGroup {
  key: string
  label: string           // 칩 라벨 (한 축만 있을 땐 숨길 수 있음)
  options: FilterOption[]
  // 해당 축이 "전체(= 필터 꺼짐)" 로 취급되는 값. 기본 "all" 또는 "전체"
  allValue?: string
}

export interface SortOption {
  value: string
  label: string
}

interface ListingToolbarProps {
  // 검색
  searchPlaceholder?: string
  searchValue: string
  onSearchChange: (v: string) => void

  // 필터
  filterGroups?: FilterGroup[]
  filterValues: Record<string, string>   // { category: "시공", status: "모집중" }
  onFilterChange: (values: Record<string, string>) => void

  // 정렬
  sortOptions?: SortOption[]
  sortValue?: string
  onSortChange?: (v: string) => void

  // 결과 요약
  resultCount?: number
  resultLabel?: string  // "매물", "가게" 등 — 앞에 붙음. "매물 12개"

  // 부분 렌더링 — 검색은 hero 안에, 필터/정렬은 hero 밖에 분리해서 둘 때 사용
  showSearch?: boolean   // default true
  showFilters?: boolean  // default true
  showFooter?: boolean   // default true (결과수+정렬+초기화)

  // 풋터 우측에 추가로 끼워넣을 액션 (예: 카드/지도 토글)
  actionsSlot?: ReactNode
  // 풋터 가운데에 끼워넣을 슬롯 (예: 내주변/인기/신규/필터 빠른 pill 버튼들)
  centerSlot?: ReactNode

  className?: string
}

export function ListingToolbar({
  searchPlaceholder = "검색",
  searchValue,
  onSearchChange,
  filterGroups = [],
  filterValues,
  onFilterChange,
  sortOptions,
  sortValue,
  onSortChange,
  resultCount,
  resultLabel,
  showSearch = true,
  showFilters = true,
  showFooter = true,
  actionsSlot,
  centerSlot,
  className,
}: ListingToolbarProps) {
  // 활성 필터 개수 = "전체"가 아닌 축 개수
  const activeCount = useMemo(() => {
    return filterGroups.reduce((n, g) => {
      const v = filterValues[g.key]
      const allV = g.allValue ?? "all"
      if (v && v !== allV && v !== "전체") return n + 1
      return n
    }, 0)
  }, [filterGroups, filterValues])

  const handleReset = () => {
    const reset: Record<string, string> = {}
    for (const g of filterGroups) {
      reset[g.key] = g.allValue ?? (g.options[0]?.value ?? "all")
    }
    onFilterChange(reset)
    onSearchChange("")
  }

  const setGroupValue = (key: string, value: string) => {
    onFilterChange({ ...filterValues, [key]: value })
  }

  return (
    <div className={cn("bg-card border-b border-border", className)}>
      {/* 1) 검색창 */}
      {showSearch && (
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9 bg-white dark:bg-slate-900/80 border-white/80 dark:border-slate-700/60 shadow-sm"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
              aria-label="검색어 지우기"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      )}

      {/* 2) 필터 칩 — 여러 축 가로 스크롤 */}
      {showFilters && filterGroups.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {filterGroups.map((group) => {
            const currentVal = filterValues[group.key] ?? (group.allValue ?? group.options[0]?.value)
            return (
              <div key={group.key} className="overflow-x-auto scrollbar-hide -mx-1 px-1">
                <div className="flex gap-2 items-center" style={{ minWidth: "max-content" }}>
                  {filterGroups.length > 1 && (
                    <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap mr-1">
                      {group.label}
                    </span>
                  )}
                  {group.options.map((opt) => {
                    const active = currentVal === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setGroupValue(group.key, opt.value)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground hover:bg-secondary/80",
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 3) 결과 개수 + 정렬 + 초기화 + actionsSlot */}
      {showFooter && (sortOptions || resultCount != null || activeCount > 0 || searchValue || actionsSlot || centerSlot) && (
        <div className="px-4 py-2.5 flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20">
          <div className="flex items-center gap-2 min-w-0">
            {resultCount != null && (
              <p className="text-xs text-muted-foreground truncate">
                {resultLabel ? `${resultLabel} ` : ""}
                <span className="font-semibold text-primary">{resultCount.toLocaleString()}</span>
                개
              </p>
            )}
            {(activeCount > 0 || searchValue) && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-full hover:bg-muted transition-colors"
                aria-label="필터 초기화"
              >
                <RotateCcw className="w-3 h-3" />
                초기화
                {activeCount > 0 && (
                  <span className="ml-0.5 text-primary font-semibold">{activeCount}</span>
                )}
              </button>
            )}
          </div>

          {centerSlot && (
            <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-hide flex-1 justify-center">
              {centerSlot}
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0">
            {sortOptions && sortOptions.length > 0 && onSortChange && (
              <div className="flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-muted-foreground" />
                <select
                  value={sortValue}
                  onChange={(e) => onSortChange(e.target.value)}
                  className="text-xs text-foreground bg-transparent border-none focus:outline-none cursor-pointer"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {actionsSlot}
          </div>
        </div>
      )}
    </div>
  )
}
