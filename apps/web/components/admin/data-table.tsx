'use client'

import { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AdminColumn<T = any> {
  key: string
  label?: string
  header?: string   // alias for label (backward compat)
  render?: (row: T) => ReactNode
  className?: string
  hideOn?: 'sm' | 'md' | 'lg'
}

interface Props<T = any> {
  columns: AdminColumn<T>[]
  rows?: T[]
  data?: T[]   // alias for rows (backward compat)
  loading?: boolean
  emptyText?: string
  rowKey?: (row: T) => string
  actions?: (row: T) => ReactNode
  onRowClick?: (row: T) => void
  onRowDoubleClick?: (row: T) => void
}

/**
 * 관리자 페이지 공용 데이터 테이블.
 * 반응형 + 로딩/빈 상태 처리. 제네릭 타입은 any로 느슨하게 다룸.
 *
 * Pro Admin Design v2 — 클린 라인, 서브틀 호버, 타이트 간격
 */
export function AdminDataTable<T = any>({
  columns,
  rows,
  data,
  loading,
  emptyText = '데이터가 없습니다',
  rowKey,
  actions,
  onRowClick,
  onRowDoubleClick,
}: Props<T>) {
  const effectiveRows: T[] = (rows ?? data ?? []) as T[]
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!effectiveRows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">{emptyText}</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-4 py-2.5',
                    c.hideOn === 'sm' && 'hidden sm:table-cell',
                    c.hideOn === 'md' && 'hidden md:table-cell',
                    c.hideOn === 'lg' && 'hidden lg:table-cell',
                    c.className
                  )}
                >
                  {c.label ?? c.header ?? c.key}
                </th>
              ))}
              {actions && (
                <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-4 py-2.5">
                  관리
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {effectiveRows.map((r: any, idx: number) => {
              const key = rowKey ? rowKey(r) : String(r?.id ?? idx)
              return (
                <tr
                  key={key}
                  className={cn(
                    'border-b border-border/50 last:border-0 transition-colors',
                    'hover:bg-accent/40',
                    (onRowClick || onRowDoubleClick) && 'cursor-pointer'
                  )}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(r) : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-3 text-[13px]',
                        c.hideOn === 'sm' && 'hidden sm:table-cell',
                        c.hideOn === 'md' && 'hidden md:table-cell',
                        c.hideOn === 'lg' && 'hidden lg:table-cell',
                        c.className
                      )}
                    >
                      {c.render ? c.render(r) : (r?.[c.key] ?? '-')}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {actions(r)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
