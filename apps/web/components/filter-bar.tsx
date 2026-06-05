"use client"

import { MapPin, TrendingUp, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserLocation } from "@/components/location-selector"

type QuickFilter = "none" | "nearby" | "popular" | "new"

interface FilterBarProps {
  // 부동산 필터 제거 후 남은 선택적 prop — 호출부 호환을 위해 허용(무시됨).
  onFilterChange?: (filters: any) => void
  quickFilter?: QuickFilter
  onQuickFilterChange?: (filter: QuickFilter) => void
  userLocation?: UserLocation | null
}

export function FilterBar({ quickFilter = "none", onQuickFilterChange, userLocation }: FilterBarProps) {
  return (
    <div className="bg-card/80 backdrop-blur-md border-b border-border/50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-center md:justify-between gap-2 flex-wrap">
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
                <span>인기</span>
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
                <span>신규</span>
              </button>
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
  )
}
