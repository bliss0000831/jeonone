"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  TrendingUp, Search, Trash2, EyeOff, Eye, RefreshCw,
  Loader2, Hash, Clock, Award, Ban, AlertTriangle,
} from "lucide-react"

interface Row {
  term: string
  count: number
  last_searched_at: string | null
  first_searched_at: string | null
  blacklisted: boolean
  blacklist_reason: string | null
}

const RANGES: { value: number; label: string }[] = [
  { value: 1, label: "1일" },
  { value: 7, label: "7일" },
  { value: 30, label: "30일" },
  { value: 90, label: "90일" },
  { value: 365, label: "1년" },
]

export default function PopularSearchAdminPage() {
  const [range, setRange] = useState(7)
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/search-terms?range=${range}&limit=500`)
      if (r.ok) {
        const data = await r.json()
        setItems(Array.isArray(data.items) ? data.items : [])
      }
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  const handleDelete = async (term: string) => {
    if (!confirm(`'${term}' 검색어 기록을 삭제합니다. 계속할까요?`)) return
    const r = await fetch(`/api/admin/search-terms?term=${encodeURIComponent(term)}`, {
      method: "DELETE",
    })
    if (r.ok) {
      setItems((prev) => prev.filter((i) => i.term !== term))
    } else {
      const data = await r.json().catch(() => ({}))
      toast.error(`삭제 실패: ${data.error || r.status}`)
    }
  }

  const handleBlacklist = async (term: string, blacklisted: boolean) => {
    let reason: string | null = null
    if (!blacklisted) {
      reason = prompt(`'${term}' 를 숨김 처리합니다. (사유, 선택)`, "") || null
    } else {
      if (!confirm(`'${term}' 숨김을 해제합니다.`)) return
    }
    const r = await fetch(`/api/admin/search-terms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term,
        reason,
        action: blacklisted ? "remove" : "add",
      }),
    })
    if (r.ok) {
      setItems((prev) =>
        prev.map((i) =>
          i.term === term
            ? { ...i, blacklisted: !blacklisted, blacklist_reason: blacklisted ? null : reason }
            : i,
        ),
      )
    } else {
      const data = await r.json().catch(() => ({}))
      toast.error(`실패: ${data.error || r.status}`)
    }
  }

  const filtered = filter.trim()
    ? items.filter((i) => i.term.includes(filter.trim().toLowerCase()))
    : items

  const stats = useMemo(() => {
    const total = items.length
    const hidden = items.filter(i => i.blacklisted).length
    const totalSearches = items.reduce((s, i) => s + i.count, 0)
    const topTerm = items.length > 0 ? items[0] : null
    return { total, hidden, totalSearches, topTerm }
  }, [items])

  const maxCount = items.reduce((m, i) => Math.max(m, i.count), 0) || 1

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="인기 검색어 관리"
        description="집계된 검색어를 확인하고, 부적절한 검색어는 숨김·삭제 처리합니다"
        icon={<TrendingUp className="w-6 h-6" />}
        badge={
          stats.hidden > 0 ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {stats.hidden}개 숨김
            </span>
          ) : null
        }
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            새로고침
          </Button>
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Hash className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-0.5">검색어 수</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Search className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.totalSearches.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">총 검색 횟수</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Award className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-lg font-bold truncate">{stats.topTerm?.term || '-'}</div>
          <div className="text-xs text-muted-foreground mt-0.5">1위 검색어 ({stats.topTerm?.count || 0}회)</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <Ban className="w-4 h-4 text-red-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.hidden}</div>
          <div className="text-xs text-muted-foreground mt-0.5">숨김 처리</div>
        </div>
      </div>

      {/* 기간 선택 + 필터 */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-medium transition-all",
                range === r.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "hover:bg-muted text-muted-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="검색어 필터..."
            className="pl-9"
          />
        </div>
        <div className="text-xs text-muted-foreground flex items-center">
          {filtered.length}건 {items.length !== filtered.length && `(전체 ${items.length})`}
        </div>
      </div>

      {/* 안내 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
          <div className="flex items-center gap-2 mb-1">
            <EyeOff className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">숨김 처리</span>
          </div>
          <p className="text-xs text-amber-600/80 dark:text-amber-400/60">집계는 유지, 사용자 인기검색어/자동완성에서 제외</p>
        </div>
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
          <div className="flex items-center gap-2 mb-1">
            <Trash2 className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">기록 삭제</span>
          </div>
          <p className="text-xs text-red-600/80 dark:text-red-400/60">누적 집계 영구 삭제, 재검색 시 1부터 재집계</p>
        </div>
      </div>

      {/* 검색어 목록 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">검색어를 불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">기록된 검색어가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row, i) => (
            <div
              key={row.term}
              className={cn(
                "flex items-center gap-4 p-4 rounded-xl border bg-card transition-all hover:shadow-sm group",
                row.blacklisted && "border-red-200/60 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/10",
              )}
            >
              {/* 순위 */}
              <span className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                i < 3 && !row.blacklisted
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}>
                {i + 1}
              </span>

              {/* 검색어 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-semibold text-sm",
                    row.blacklisted && "line-through text-muted-foreground"
                  )}>
                    {row.term}
                  </span>
                  {row.blacklisted && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300">
                      숨김
                    </span>
                  )}
                </div>
                {row.blacklist_reason && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    사유: {row.blacklist_reason}
                  </div>
                )}
              </div>

              {/* 검색 횟수 바 */}
              <div className="flex items-center gap-2 shrink-0 hidden sm:flex">
                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", row.blacklisted ? "bg-red-400" : "bg-primary/60")}
                    style={{ width: `${(row.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold w-10 text-right tabular-nums">{row.count}</span>
              </div>

              {/* 최근 검색 */}
              <div className="text-[11px] text-muted-foreground shrink-0 hidden md:block w-28">
                {row.last_searched_at
                  ? new Date(row.last_searched_at).toLocaleString("ko-KR", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : "-"}
              </div>

              {/* 액션 */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleBlacklist(row.term, row.blacklisted)}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  title={row.blacklisted ? "숨김 해제" : "숨김 처리"}
                >
                  {row.blacklisted
                    ? <Eye className="w-4 h-4 text-muted-foreground" />
                    : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button
                  onClick={() => handleDelete(row.term)}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="기록 삭제"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
