"use client"

import { useState, useEffect } from "react"
import { SlidersHorizontal, X, MapPin, TrendingUp, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilterOptions } from "@/types/app"
import { UserLocation } from "@/components/location-selector"
import { PropertyFilterModal } from "@/components/property-filter-modal"

type QuickFilter = "none" | "nearby" | "popular" | "new"

interface FilterBarProps {
  onFilterChange: (filters: FilterOptions) => void
  quickFilter?: QuickFilter
  onQuickFilterChange?: (filter: QuickFilter) => void
  userLocation?: UserLocation | null
}

export function FilterBar({ onFilterChange, quickFilter = "none", onQuickFilterChange, userLocation }: FilterBarProps) {
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({
    propertyType: "전체",
    transactionType: "전체",
    district: "전체",
    sellerType: "전체",
    option: "전체",
  })
  const [filterModalOpen, setFilterModalOpen] = useState(false)

  const clearFilters = () => {
    const clearedFilters: FilterOptions = {
      propertyType: "전체",
      transactionType: "전체",
      district: "전체",
      sellerType: "전체",
      option: "전체",
    }
    setActiveFilters(clearedFilters)
    onFilterChange(clearedFilters)
  }

  const activeFilterCount =
    (activeFilters.propertyType && activeFilters.propertyType !== "전체" ? 1 : 0) +
    (activeFilters.transactionType && activeFilters.transactionType !== "전체" ? 1 : 0) +
    (activeFilters.district && activeFilters.district !== "전체" ? 1 : 0) +
    (activeFilters.sellerType && activeFilters.sellerType !== "전체" ? 1 : 0) +
    (activeFilters.option && activeFilters.option !== "전체" ? 1 : 0) +
    (activeFilters.minPrice !== undefined || activeFilters.maxPrice !== undefined ? 1 : 0) +
    (activeFilters.minArea !== undefined || activeFilters.maxArea !== undefined ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0

  return (
    <>
      <div className="bg-card/80 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2">
          {/* Quick filters + 통합 필터 버튼 — 한 줄 */}
          <div className="flex items-center justify-center md:justify-between gap-2 flex-wrap">
            {/* Quick filters */}
            {onQuickFilterChange && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onQuickFilterChange("nearby")}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shadow-sm",
                    quickFilter === "nearby"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-primary/10 text-foreground hover:bg-primary/20 border border-primary/20",
                  )}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>내 주변</span>
                </button>
                <button
                  onClick={() => onQuickFilterChange("popular")}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shadow-sm",
                    quickFilter === "popular"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-primary/10 text-foreground hover:bg-primary/20 border border-primary/20",
                  )}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>인기매물</span>
                </button>
                <button
                  onClick={() => onQuickFilterChange("new")}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shadow-sm",
                    quickFilter === "new"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-primary/10 text-foreground hover:bg-primary/20 border border-primary/20",
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>신규매물</span>
                </button>

                {/* 통합 필터 버튼 — 매물유형/거래유형/동네/판매자/옵션/가격/면적 한 곳에 */}
                <button
                  onClick={() => setFilterModalOpen(true)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shadow-sm",
                    hasActiveFilters
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-card text-foreground hover:bg-secondary border border-border/50",
                  )}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>필터</span>
                  {activeFilterCount > 0 && (
                    <span
                      className={cn(
                        "ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold",
                        hasActiveFilters
                          ? "bg-white text-primary"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>초기화</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Location warning */}
          {quickFilter === "nearby" && !userLocation && (
            <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg mt-3">
              상단의 &quot;위치 설정&quot;을 눌러 내 위치를 설정해주세요
            </p>
          )}
        </div>
      </div>

      {/* 공유 필터 모달 — properties 페이지와 동일 컴포넌트 사용 */}
      <PropertyFilterModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        value={activeFilters}
        onChange={(next) => {
          setActiveFilters(next)
          onFilterChange(next)
        }}
        showDistrict
      />

    </>
  )
}
