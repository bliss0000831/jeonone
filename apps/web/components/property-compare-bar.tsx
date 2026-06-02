"use client"

import { usePropertyCompare } from "@/hooks/use-property-compare"
import { useRouter } from "next/navigation"
import { BarChart2, X, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function PropertyCompareBar() {
  const { compareIds, removeFromCompare, clearCompare } = usePropertyCompare()
  const router = useRouter()

  if (compareIds.length === 0) return null

  return (
    <div
      className={cn(
        "fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-3 px-4 py-3 rounded-2xl",
        "bg-card/90 backdrop-blur-xl border border-border shadow-lg",
      )}
    >
      {/* Selected property slots */}
      <div className="flex items-center gap-2">
        {compareIds.map((id) => (
          <div
            key={id}
            className="relative w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center text-[10px] text-muted-foreground overflow-hidden"
          >
            <BarChart2 className="w-4 h-4" />
            <button
              onClick={() => removeFromCompare(id)}
              aria-label="비교에서 제거"
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {/* Empty slots */}
        {Array.from({ length: 3 - compareIds.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-10 h-10 rounded-lg border-2 border-dashed border-border flex items-center justify-center"
          >
            <span className="text-[10px] text-muted-foreground">+</span>
          </div>
        ))}
      </div>

      <span className="text-sm font-medium text-foreground whitespace-nowrap">
        {compareIds.length}개 매물
      </span>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={clearCompare}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5 inline mr-1" />
          초기화
        </button>
        <button
          disabled={compareIds.length < 2}
          onClick={() => router.push(`/properties/compare?ids=${compareIds.join(",")}`)}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
            compareIds.length >= 2
              ? "bg-primary text-primary-foreground shadow-md hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          비교하기
        </button>
      </div>
    </div>
  )
}
