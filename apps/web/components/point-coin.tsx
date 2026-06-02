/**
 * 포인트 동전 아이콘 — 원 안에 흰 P.
 *  - 옛 ✨ Sparkles 자리에 통일된 디자인으로 사용.
 *  - 사이즈: sm(14) | md(16, default) | lg(20) | xl(24)
 */
import { cn } from "@/lib/utils"

interface PointCoinProps {
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}

const SIZE_CLS: Record<NonNullable<PointCoinProps["size"]>, { box: string; text: string }> = {
  sm: { box: "w-3.5 h-3.5", text: "text-[8px]" },
  md: { box: "w-4 h-4", text: "text-[9px]" },
  lg: { box: "w-5 h-5", text: "text-[11px]" },
  xl: { box: "w-6 h-6", text: "text-[13px]" },
}

export function PointCoin({ size = "md", className }: PointCoinProps) {
  const s = SIZE_CLS[size]
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        "bg-gradient-to-br from-amber-400 to-amber-500 text-white",
        "shadow-inner ring-1 ring-amber-600/30 font-bold leading-none",
        s.box,
        s.text,
        className,
      )}
    >
      P
    </span>
  )
}
