"use client"

import { cn } from "@/lib/utils"
import type { ProfileTabDef, ProfileTabId } from "./role-config"

interface ProfileTabsProps {
  tabs: ProfileTabDef[]
  active: ProfileTabId
  onChange: (id: ProfileTabId) => void
  /** 각 탭의 카운트 표시 (선택) */
  counts?: Partial<Record<ProfileTabId, number>>
}

export function ProfileTabs({ tabs, active, onChange, counts }: ProfileTabsProps) {
  return (
    <div className="bg-card border-b border-border sticky top-14 z-30">
      {/*
        모바일: 각 탭이 flex-1로 화면 너비를 균등 분할 → 우측 빈 공간 제거
        sm 이상: 탭은 내용 너비, 그룹은 가운데 정렬
      */}
      <div className="flex sm:justify-center overflow-x-auto scrollbar-hide">
        {tabs.map((t) => {
          const Icon = t.icon
          const isActive = t.id === active
          const count = counts?.[t.id]
          const showCount = typeof count === "number" && count > 0
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 sm:px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                "flex-1 sm:flex-none",
                isActive
                  ? "text-foreground border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground",
                t.mobileOnly && "lg:hidden",
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {showCount && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
