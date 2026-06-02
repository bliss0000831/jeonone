"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface DetailBodyProps {
  children: ReactNode
  className?: string
}

/** 갤러리 바로 아래 본문 래퍼 — 모든 상세페이지 공용 좌우 패딩 */
export function DetailBody({ children, className }: DetailBodyProps) {
  return (
    <div className={cn("px-4 py-6 space-y-6", className)}>{children}</div>
  )
}

interface DetailSectionProps {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  /** 상단 구분선 표시 여부 (기본 true) */
  divider?: boolean
  className?: string
}

/** 상세페이지 본문 섹션 — 구분선 + 제목을 통일 */
export function DetailSection({
  title,
  right,
  children,
  divider = true,
  className,
}: DetailSectionProps) {
  return (
    <section
      className={cn(
        divider && "border-t border-border pt-6 first:border-t-0 first:pt-0",
        className,
      )}
    >
      {(title || right) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          )}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

/** 박스형 설명문 — 중립 회색(muted)으로 가독성 확보 */
export function DetailInfoBox({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "p-4 bg-muted rounded-xl text-foreground whitespace-pre-wrap leading-relaxed",
        className,
      )}
    >
      {children}
    </div>
  )
}

interface KeyValueRowProps {
  label: ReactNode
  value: ReactNode
}

/** 라벨-값 한 줄 (상세정보 섹션) */
export function DetailKeyValue({ label, value }: KeyValueRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  )
}
