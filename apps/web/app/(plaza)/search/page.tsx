"use client"

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
  Clock,
  Home as HomeIcon,
  MessageSquare,
  Gift,
  Users,
  ShoppingCart,
  Sparkles,
  ChevronRight,
  Leaf,
  Wrench,
  Store,
  User,
  TrendingUp,
  ArrowUpDown,
  Tractor,
  Gavel,
  Truck,
  Briefcase,
  Newspaper,
} from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { cn } from "@/lib/utils"
import type { SearchCategory, SearchHit, SearchSort } from "@gwangjang/types/search"
import { getCurrentPlazaClient } from "@/lib/plaza/client"

const PROPERTY_TYPES = ["전체", "아파트", "빌라", "오피스텔", "원룸", "투룸", "주택", "펜션", "상가", "사무실", "토지"] as const
const TRANSACTION_TYPES = ["전체", "매매", "전세", "월세"] as const

type TabKey = "all" | SearchCategory

interface TabMeta {
  key: TabKey
  label: string
  icon: any
  iconClass: string
}

const TABS: TabMeta[] = [
  { key: "all",          label: "전체",     icon: Sparkles,       iconClass: "text-primary" },
  { key: "local_food",   label: "로컬푸드", icon: Leaf,           iconClass: "text-green-600" },
  { key: "board",        label: "마을소식", icon: MessageSquare,  iconClass: "text-primary" },
  { key: "sharing",      label: "무료나눔", icon: Gift,           iconClass: "text-red-500" },
]

const CATEGORY_META: Record<SearchCategory, { label: string; icon: any; iconClass: string; bgClass: string }> = {
  properties:   { label: "부동산",   icon: HomeIcon,      iconClass: "text-blue-600",    bgClass: "bg-blue-500/10" },
  board:        { label: "마을소식", icon: MessageSquare, iconClass: "text-primary",     bgClass: "bg-primary/10" },
  sharing:      { label: "무료나눔", icon: Gift,          iconClass: "text-red-500",     bgClass: "bg-red-500/10" },
  clubs:        { label: "모임",     icon: Users,         iconClass: "text-indigo-500",  bgClass: "bg-indigo-500/10" },
  group_buying: { label: "공동구매", icon: ShoppingCart,  iconClass: "text-violet-500",  bgClass: "bg-violet-500/10" },
  local_food:   { label: "로컬푸드", icon: Leaf,          iconClass: "text-green-500",   bgClass: "bg-green-500/10" },
  services:     { label: "서비스",   icon: Wrench,        iconClass: "text-orange-600",  bgClass: "bg-orange-600/10" },
  new_store:    { label: "신장개업", icon: Store,         iconClass: "text-orange-500",  bgClass: "bg-orange-500/10" },
  profiles:     { label: "사람",     icon: User,          iconClass: "text-pink-500",    bgClass: "bg-pink-500/10" },
}

// 광장별 최근검색 격리: "search:recent:v2:<plaza>" 형식
// (모바일 RECENT_KEY_PREFIX 패턴과 일치)
const RECENT_KEY_PREFIX = "search:recent:v2:"
const RECENT_KEY_LEGACY = "search:recent"
const MAX_RECENT = 10

function recentKey(plaza: string | null): string {
  return RECENT_KEY_PREFIX + (plaza || "default")
}

function loadRecent(plaza: string | null): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(recentKey(plaza))
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((v) => typeof v === "string").slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function saveRecent(q: string, plaza: string | null) {
  if (typeof window === "undefined") return
  const t = q.trim()
  if (!t) return
  try {
    const prev = loadRecent(plaza).filter((v) => v !== t)
    const next = [t, ...prev].slice(0, MAX_RECENT)
    window.localStorage.setItem(recentKey(plaza), JSON.stringify(next))
  } catch {
    /* noop */
  }
}

function removeRecent(q: string, plaza: string | null) {
  if (typeof window === "undefined") return
  try {
    const next = loadRecent(plaza).filter((v) => v !== q)
    window.localStorage.setItem(recentKey(plaza), JSON.stringify(next))
  } catch {
    /* noop */
  }
}

// 만원 단위 → 카드와 동일한 한국식 표기 (12345 → "1억 2,345만원")
function manwonText(v: number): string {
  if (v >= 10000) {
    const uk = Math.floor(v / 10000)
    const man = v % 10000
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억`
  }
  return `${v.toLocaleString()}만원`
}

function formatPrice(meta: Record<string, any>): string | null {
  // properties 스키마: 매매=price, 전세=price(전세금), 월세=price(보증금)/monthly_rent
  const { transaction_type, price, monthly_rent } = meta
  if (!transaction_type) return null
  if (transaction_type === "매매" && price) return manwonText(Number(price))
  if (transaction_type === "전세" && price) return manwonText(Number(price))
  if (transaction_type === "월세" && (price || monthly_rent)) {
    return `${manwonText(Number(price || 0))}/${manwonText(Number(monthly_rent || 0))}`
  }
  return null
}

function relativeDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  return d.toLocaleDateString("ko-KR")
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  )
}

function SearchPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get("q") || ""
  const initialTab = (searchParams.get("tab") || "all") as TabKey

  const [input, setInput] = useState(initialQ)
  const [q, setQ] = useState(initialQ)
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [sort, setSort] = useState<SearchSort>("latest")
  const [results, setResults] = useState<Record<SearchCategory, SearchHit[]>>({
    properties: [], board: [], sharing: [], clubs: [], group_buying: [],
    local_food: [], services: [], new_store: [], profiles: [],
  })
  const [counts, setCounts] = useState<Record<SearchCategory, number>>({
    properties: 0, board: 0, sharing: 0, clubs: 0, group_buying: 0,
    local_food: 0, services: 0, new_store: 0, profiles: 0,
  })
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [trending, setTrending] = useState<string[]>([])

  // 부동산 탭 전용 필터
  const [showFilters, setShowFilters] = useState(false)
  const [propertyType, setPropertyType] = useState<(typeof PROPERTY_TYPES)[number]>("전체")
  const [transactionType, setTransactionType] = useState<(typeof TRANSACTION_TYPES)[number]>("전체")

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 현재 광장 (host/쿼리 기반) — 최근검색 격리에 사용
  const [plaza, setPlaza] = useState<string | null>(null)
  useEffect(() => {
    setPlaza(getCurrentPlazaClient())
  }, [])

  // 최근 검색어 + 인기 검색어 로드
  useEffect(() => {
    setRecent(loadRecent(plaza))
    ;(async () => {
      try {
        const r = await fetch(`/api/search/trending${plaza ? `?plaza=${encodeURIComponent(plaza)}` : ""}`)
        if (r.ok) {
          const data = await r.json()
          setTrending(Array.isArray(data.terms) ? data.terms : [])
        }
      } catch { /* noop */ }
    })()
  }, [plaza])

  // URL ↔ state 동기화 (뒤로가기 대응)
  useEffect(() => {
    const uq = searchParams.get("q") || ""
    const ut = (searchParams.get("tab") || "all") as TabKey
    setQ(uq)
    setInput(uq)
    setTab(ut)
  }, [searchParams])

  // 비행 중인 fetch 를 abort 하기 위한 ref
  const abortRef = useRef<AbortController | null>(null)

  // 검색 실행 (debounce + abort)
  const runSearch = useCallback(async (query: string, targetTab: TabKey, targetSort: SearchSort) => {
    if (!query) {
      setResults({
        properties: [], board: [], sharing: [], clubs: [], group_buying: [],
        local_food: [], services: [], new_store: [], profiles: [],
      })
      setCounts({
        properties: 0, board: 0, sharing: 0, clubs: 0, group_buying: 0,
        local_food: 0, services: 0, new_store: 0, profiles: 0,
      })
      return
    }
    // 이전 요청 취소 — 빠른 타이핑 시 stale 결과가 새 결과를 덮어쓰는 race 방지
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setSearchError(false)
    try {
      const scope = targetTab === "all" ? "all" : targetTab
      const limit = targetTab === "all" ? 5 : 30
      const r = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&scope=${scope}&limit=${limit}&sort=${targetSort}`,
        { signal: ctrl.signal },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setResults(data.results)
      setCounts(data.counts)
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error("[search] failed", e)
        // 실패를 "결과 없음"과 구분 — 이전 결과 비우고 에러 표시
        setSearchError(true)
        setResults({
          properties: [], board: [], sharing: [], clubs: [], group_buying: [],
          local_food: [], services: [], new_store: [], profiles: [],
        })
        setCounts({
          properties: 0, board: 0, sharing: 0, clubs: 0, group_buying: 0,
          local_food: 0, services: 0, new_store: 0, profiles: 0,
        })
      }
    } finally {
      // abort 된 요청이면 loading 상태를 다음 요청이 관리
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSearch(q, tab, sort)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      controller.abort()
      // Also abort the in-flight request ref so stale responses are discarded
      abortRef.current?.abort()
    }
  }, [q, tab, sort, runSearch])

  const updateUrl = (next: { q?: string; tab?: TabKey }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q)
      else params.delete("q")
    }
    if (next.tab !== undefined) {
      if (next.tab && next.tab !== "all") params.set("tab", next.tab)
      else params.delete("tab")
    }
    const str = params.toString()
    router.replace(`/search${str ? `?${str}` : ""}`, { scroll: false })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    setQ(trimmed)
    updateUrl({ q: trimmed })
    if (trimmed) {
      saveRecent(trimmed, plaza)
      setRecent(loadRecent(plaza))
    }
  }

  const handleTabChange = (next: TabKey) => {
    setTab(next)
    updateUrl({ tab: next })
  }

  const handlePickRecent = (word: string) => {
    setInput(word)
    setQ(word)
    updateUrl({ q: word })
    saveRecent(word, plaza)
    setRecent(loadRecent(plaza))
  }

  const handleClearRecent = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(recentKey(plaza))
      // 레거시 키도 정리 (옵션)
      window.localStorage.removeItem(RECENT_KEY_LEGACY)
    }
    setRecent([])
  }

  // 부동산 탭에서 클라이언트 필터 적용
  const filteredProperties = useMemo(() => {
    let hits = results.properties
    if (propertyType !== "전체") {
      hits = hits.filter((h) => h.meta?.property_type === propertyType)
    }
    if (transactionType !== "전체") {
      hits = hits.filter((h) => h.meta?.transaction_type === transactionType)
    }
    return hits
  }, [results.properties, propertyType, transactionType])

  const isEmptyState = !q
  const totalCount =
    counts.properties + counts.board + counts.sharing + counts.clubs + counts.group_buying +
    counts.local_food + counts.services + counts.new_store + counts.profiles

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 헤더 */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center gap-2 px-4 h-14">
          <Link href="/" aria-label="뒤로가기" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <form onSubmit={handleSubmit} className="flex-1 flex items-center">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="농기구, 로컬푸드, 경매, 대여, 일손 검색"
                className="w-full h-10 pl-9 pr-9 rounded-lg bg-secondary/60 border border-transparent focus:border-primary focus:bg-card focus:outline-none text-sm"
                autoFocus={!initialQ}
              />
              {input && (
                <button
                  type="button"
                  onClick={() => { setInput(""); inputRef.current?.focus() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
                  aria-label="입력 지우기"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </form>
          {tab === "properties" ? (
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                "p-2 rounded-full transition-colors",
                showFilters ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
              )}
              aria-label="필터"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>
          ) : tab !== "profiles" && q ? (
            <button
              onClick={() => setSort((s) => s === "latest" ? "popular" : "latest")}
              className="flex items-center gap-1 px-2.5 h-8 rounded-full text-xs font-medium bg-secondary/60 hover:bg-secondary transition-colors"
              aria-label="정렬"
              title={sort === "latest" ? "최신순" : "인기순"}
            >
              {sort === "latest"
                ? <><ArrowUpDown className="w-3.5 h-3.5" /> 최신순</>
                : <><TrendingUp className="w-3.5 h-3.5" /> 인기순</>}
            </button>
          ) : null}
        </div>

        {/* 탭 바 */}
        <div className="border-t border-border overflow-x-auto scrollbar-none">
          <div className="flex gap-1 px-2 py-1.5 min-w-max">
            {TABS.map((t) => {
              const TIcon = t.icon
              const active = tab === t.key
              const cnt = t.key === "all" ? totalCount : counts[t.key as SearchCategory]
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTabChange(t.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <TIcon className={cn("w-3.5 h-3.5", active ? "" : t.iconClass)} />
                  {t.label}
                  {q && cnt > 0 && (
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 rounded-full",
                      active ? "bg-primary-foreground/20" : "bg-muted",
                    )}>
                      {cnt}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 부동산 필터 패널 */}
        {tab === "properties" && showFilters && (
          <div className="px-4 py-3 border-t border-border bg-secondary/30 space-y-3">
            <FilterRow label="매물유형" values={PROPERTY_TYPES} active={propertyType} onPick={(v) => setPropertyType(v as any)} />
            <FilterRow label="거래유형" values={TRANSACTION_TYPES} active={transactionType} onPick={(v) => setTransactionType(v as any)} />
            {(propertyType !== "전체" || transactionType !== "전체") && (
              <button
                type="button"
                onClick={() => { setPropertyType("전체"); setTransactionType("전체") }}
                className="text-xs text-primary hover:underline"
              >
                필터 초기화
              </button>
            )}
          </div>
        )}
      </header>

      <main className="px-4 py-4">
        {isEmptyState ? (
          <EmptyState
            recent={recent}
            trending={trending}
            onPick={handlePickRecent}
            onRemove={(w) => { removeRecent(w, plaza); setRecent(loadRecent(plaza)) }}
            onClearAll={handleClearRecent}
            onShortcut={(cat) => handleTabChange(cat)}
          />
        ) : loading && totalCount === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : searchError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm font-medium text-foreground mb-1">검색 중 오류가 발생했어요</p>
            <p className="text-xs text-muted-foreground mb-4">잠시 후 다시 시도해주세요</p>
            <button
              onClick={() => runSearch(q, tab, sort)}
              className="inline-flex items-center px-4 h-9 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
            >
              다시 시도
            </button>
          </div>
        ) : totalCount === 0 ? (
          <NoResults q={q} onPick={handlePickRecent} />
        ) : tab === "all" ? (
          <AllTab results={results} counts={counts} onJumpTab={handleTabChange} />
        ) : tab === "properties" ? (
          filteredProperties.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              선택한 필터에 맞는 매물이 없어요. 필터를 조정해보세요.
            </div>
          ) : (
            <ResultList hits={filteredProperties} showBadge={false} />
          )
        ) : (
          <ResultList hits={results[tab]} showBadge={false} />
        )}
      </main>

      <BottomNav />
    </div>
  )
}

// ─── 하위 컴포넌트 ──────────────────────────────

function FilterRow({
  label,
  values,
  active,
  onPick,
}: {
  label: string
  values: readonly string[]
  active: string
  onPick: (v: string) => void
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-2 block">{label}</label>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            onClick={() => onPick(v)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              active === v
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground hover:border-primary",
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

function EmptyState({
  recent,
  trending,
  onPick,
  onRemove,
  onClearAll,
  onShortcut,
}: {
  recent: string[]
  trending: string[]
  onPick: (w: string) => void
  onRemove: (w: string) => void
  onClearAll: () => void
  onShortcut: (cat: TabKey) => void
}) {
  return (
    <div className="space-y-6">
      {recent.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> 최근 검색어
            </h3>
            <button onClick={onClearAll} className="text-xs text-muted-foreground hover:text-foreground">
              전체 삭제
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((w) => (
              <div
                key={w}
                className="inline-flex items-center gap-1 bg-secondary/60 rounded-full pl-3 pr-1 py-1 text-sm"
              >
                <button onClick={() => onPick(w)} className="hover:text-primary">{w}</button>
                <button
                  onClick={() => onRemove(w)}
                  className="p-1 hover:bg-muted rounded-full"
                  aria-label="삭제"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {trending.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" /> 인기 검색어
            <span className="text-[10px] text-muted-foreground font-normal">· 최근 7일</span>
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {trending.slice(0, 10).map((w, i) => (
              <button
                key={w}
                onClick={() => onPick(w)}
                className="flex items-center gap-2 text-sm text-left hover:text-primary transition-colors py-1"
              >
                <span className={cn(
                  "text-xs font-bold w-5 text-center flex-shrink-0",
                  i < 3 ? "text-primary" : "text-muted-foreground",
                )}>
                  {i + 1}
                </span>
                <span className="truncate">{w}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-2">카테고리별 둘러보기</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {[
            { label: "농기구/자재", icon: Tractor, href: "/secondhand" },
            { label: "로컬푸드", icon: Leaf, href: "/local-food" },
            { label: "경매장", icon: Gavel, href: "/auction" },
            { label: "농기구 대여", icon: Truck, href: "/rental" },
            { label: "일손찾기", icon: Briefcase, href: "/jobs" },
            { label: "마을소식", icon: Newspaper, href: "/board" },
            { label: "무료나눔", icon: Gift, href: "/sharing" },
          ].map((c) => {
            const CIcon = c.icon
            return (
              <Link
                key={c.label}
                href={c.href}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/50 active:scale-[0.98] transition-all"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary/10">
                  <CIcon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs font-medium">{c.label}</span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <SearchIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
        궁금한 키워드를 입력해 보세요 — 농기구 · 로컬푸드 · 경매 · 대여 · 일손을 한 번에 찾아드립니다.
      </section>
    </div>
  )
}

function NoResults({ q, onPick }: { q: string; onPick: (w: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}&limit=3`)
        if (!r.ok) return
        const data = await r.json()
        if (!cancelled) {
          setSuggestions(
            Array.isArray(data.suggestions)
              ? data.suggestions.map((s: any) => s.term).filter((t: string) => !!t)
              : [],
          )
        }
      } catch { /* noop */ }
    })()
    return () => { cancelled = true }
  }, [q])

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <SearchIcon className="w-12 h-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">
        &lsquo;<span className="text-primary">{q}</span>&rsquo; 검색 결과가 없습니다
      </h3>
      <p className="text-sm text-muted-foreground">
        다른 키워드를 시도하거나 철자를 확인해 보세요
      </p>
      {suggestions.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-muted-foreground mb-2">혹시 이 검색어를 찾으셨나요?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onPick(s)}
                className="px-3 py-1.5 text-sm rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AllTab({
  results,
  counts,
  onJumpTab,
}: {
  results: Record<SearchCategory, SearchHit[]>
  counts: Record<SearchCategory, number>
  onJumpTab: (cat: TabKey) => void
}) {
  const order: SearchCategory[] = [
    "properties", "board", "sharing", "clubs", "group_buying",
    "local_food", "services", "new_store", "profiles",
  ]
  const visible = order.filter((c) => results[c].length > 0)
  if (visible.length === 0) return null

  return (
    <div className="space-y-6">
      {visible.map((cat) => {
        const meta = CATEGORY_META[cat]
        const CIcon = meta.icon
        const hits = results[cat].slice(0, 3)
        return (
          <section key={cat}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <CIcon className={cn("w-4 h-4", meta.iconClass)} />
                {meta.label}
                <span className="text-xs text-muted-foreground font-normal">({counts[cat]})</span>
              </h3>
              {counts[cat] > 3 && (
                <button
                  onClick={() => onJumpTab(cat)}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  더보기 <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
            <ResultList hits={hits} showBadge={false} />
          </section>
        )
      })}
    </div>
  )
}

function ResultList({ hits, showBadge }: { hits: SearchHit[]; showBadge: boolean }) {
  if (hits.length === 0) return null
  return (
    <ul className="space-y-2">
      {hits.map((h) => (
        <ResultItem key={`${h.category}-${h.id}`} hit={h} showBadge={showBadge} />
      ))}
    </ul>
  )
}

function ResultItem({ hit, showBadge }: { hit: SearchHit; showBadge: boolean }) {
  const meta = CATEGORY_META[hit.category]
  const CIcon = meta.icon
  const price = hit.category === "properties" ? formatPrice(hit.meta) : null
  return (
    <li>
      <Link
        href={hit.href}
        className="flex gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
      >
        {/* 썸네일 (사람은 원형 아바타) */}
        <div className={cn(
          "w-20 h-20 bg-muted flex-shrink-0 overflow-hidden relative",
          hit.category === "profiles" ? "rounded-full" : "rounded-lg",
        )}>
          {hit.thumbnail ? (
            <Image src={hit.thumbnail} alt="" width={80} height={80} className="w-full h-full object-cover" sizes="80px" />
          ) : (
            <div className={cn("w-full h-full flex items-center justify-center", meta.bgClass)}>
              <CIcon className={cn("w-6 h-6", meta.iconClass)} />
            </div>
          )}
          {showBadge && (
            <div className={cn("absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-card/90", meta.iconClass)}>
              <CIcon className="w-2.5 h-2.5" />
              {meta.label}
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md", meta.bgClass, meta.iconClass)}>
              <CIcon className="w-2.5 h-2.5" />
              {meta.label}
            </span>
            {hit.status && (
              <span className="text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted">
                {hit.status}
              </span>
            )}
          </div>
          <h4 className="font-medium text-sm mt-1 line-clamp-1">{hit.title}</h4>
          {price && (
            <p className="text-sm font-semibold text-primary mt-0.5">{price}</p>
          )}
          {hit.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{hit.summary}</p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
            {hit.location && <span className="truncate">📍 {hit.location}</span>}
            {hit.createdAt && <span>· {relativeDate(hit.createdAt)}</span>}
          </div>
        </div>
      </Link>
    </li>
  )
}
