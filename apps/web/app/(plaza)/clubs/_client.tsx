"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { ClubCard, type ClubPost } from "@/components/club-card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import Link from "next/link"
import { Users, PlusCircle, SlidersHorizontal, X } from "lucide-react"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"
import { ListingFilterSidebar } from "@/components/listing"

const CATEGORY_OPTIONS = [
  { value: "전체", label: "전체" },
  { value: "러닝", label: "러닝" },
  { value: "배드민턴", label: "배드민턴" },
  { value: "축구", label: "축구" },
  { value: "농구", label: "농구" },
  { value: "테니스", label: "테니스" },
  { value: "등산", label: "등산" },
  { value: "수영", label: "수영" },
  { value: "자전거", label: "자전거" },
  { value: "요가", label: "요가" },
  { value: "기타", label: "기타" },
]

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "recruiting", label: "모집중" },
  { value: "full", label: "마감" },
]

const SKILL_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "누구나", label: "누구나" },
  { value: "초급", label: "초급" },
  { value: "중급", label: "중급" },
  { value: "고급", label: "고급" },
]

function ClubsPageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const searchParams = useSearchParams()
  const router = useRouter()
  const [posts, setPosts] = useState<ClubPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  // 검색/필터는 URL 을 신뢰원으로 — 새로고침/뒤로가기 보존
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>({
    category: searchParams.get("category") ?? "전체",
    status: searchParams.get("status") ?? "all",
    skill: searchParams.get("skill") ?? "all",
  })
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  // 모바일 필터 시트
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  // 검색어 디바운스 — URL replace 빈도 제한 (목록 필터링 자체는 search 로 즉시 반영)
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // 검색어/필터 → URL 동기화 (새로고침/뒤로가기 보존)
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim())
    if (filters.category !== "전체") params.set("category", filters.category)
    if (filters.status !== "all") params.set("status", filters.status)
    if (filters.skill !== "all") params.set("skill", filters.skill)
    const qs = params.toString()
    router.replace(qs ? `/clubs?${qs}` : "/clubs", { scroll: false })
  }, [debouncedSearch, filters.category, filters.status, filters.skill, router])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
    try {
      const raw = localStorage.getItem("hiddenClubsIds")
      if (raw) setHiddenIds(new Set(JSON.parse(raw)))
    } catch {}
  }, [])

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        const params = new URLSearchParams({ limit: "50" })
        if (filters.category !== "전체") params.set("category", filters.category)
        if (filters.status !== "all") params.set("status", filters.status)
        const res = await fetch(`/api/clubs?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setPosts(data.posts || [])
      } catch {
        // 네트워크/서버 오류 — "내용 없음"과 구분해서 재시도 노출
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchPosts()
  }, [filters.category, filters.status, retryKey])

  const filtered = useMemo(() => {
    let arr = [...posts]
    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.location || "").toLowerCase().includes(q)
      )
    }
    // 실력 필터 (skill_level)
    if (filters.skill && filters.skill !== "all") {
      arr = arr.filter((p) => p.skill_level === filters.skill)
    }
    if (hiddenIds.size > 0) arr = arr.filter((p) => !hiddenIds.has(p.id))
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return arr
  }, [posts, search, hiddenIds, filters.skill])

  // ClubCard 가 ⋮ 메뉴와 favorite 을 자체 처리하므로 ListingItem 매핑 불필요

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      {/* 모바일: 3개 필터 트리거 버튼 (상태 / 실력 / 카테고리) — 클릭 시 시트 오픈 */}
      <div className="md:hidden bg-background sticky top-14 z-30 px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          {([
            { key: "status", label: "상태", value: filters.status, opts: STATUS_OPTIONS },
            { key: "skill", label: "실력 수준", value: filters.skill, opts: SKILL_OPTIONS },
            { key: "category", label: "카테고리", value: filters.category, opts: CATEGORY_OPTIONS },
          ] as const).map((f) => {
            const labelText = f.opts.find((o) => o.value === f.value)?.label || f.label
            const isDefault = f.value === "all" || f.value === "전체"
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilterSheetOpen(true)}
                className={`flex-1 inline-flex items-center justify-between gap-1 px-3 py-2 rounded-lg border text-[13px] font-medium min-h-[38px] transition-colors ${
                  isDefault
                    ? "bg-white border-border text-foreground hover:bg-secondary/40"
                    : "bg-violet-500 border-violet-500 text-white shadow-sm"
                }`}
              >
                <span className="truncate">
                  {f.label}
                  {!isDefault && <span className="ml-1 opacity-90">· {labelText}</span>}
                </span>
                <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
              </button>
            )
          })}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-0 md:px-6 py-0 md:py-6">
        <div className="flex gap-8">
          {/* PC 사이드바 */}
          <div className="hidden md:block w-60 flex-shrink-0">
            <ListingFilterSidebar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="모임명, 설명, 지역 검색"
              filterGroups={[
                { key: "status", label: "상태", options: STATUS_OPTIONS },
                { key: "skill", label: "실력 수준", options: SKILL_OPTIONS },
                { key: "category", label: "카테고리", options: CATEGORY_OPTIONS },
              ]}
              filterValues={filters}
              onFilterChange={setFilters}
            />
          </div>

          <div className="flex-1 min-w-0">
            {/* PC 상단 헤더 */}
            <div className="hidden md:flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-foreground">{cityName} 모임</h1>
              {user && (
                <Link href="/clubs/register">
                  <Button
                    size="sm"
                    className="flex items-center gap-1.5 bg-violet-500 hover:bg-violet-600 text-white rounded-full"
                  >
                    <PlusCircle className="w-4 h-4" />
                    모임 만들기
                  </Button>
                </Link>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">
                  목록을 불러오지 못했어요
                </p>
                <p className="text-xs text-muted-foreground/70 mb-4">
                  잠시 후 다시 시도해주세요
                </p>
                <Button size="sm" variant="outline" onClick={() => setRetryKey((k) => k + 1)}>
                  다시 시도
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-indigo-400" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {posts.length === 0 ? "아직 모임이 없어요" : "검색 결과가 없어요"}
                </p>
                <p className="text-xs text-muted-foreground/70 mb-4">
                  {posts.length === 0 ? "첫 번째 모임을 만들어보세요!" : "다른 조건으로 검색해보세요"}
                </p>
                {user && posts.length === 0 && (
                  <Link href="/clubs/register">
                    <Button size="sm" variant="outline">
                      <PlusCircle className="w-4 h-4 mr-1" />
                      모임 만들기
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              // 홈 화면과 동일하게 ClubCard 그리드 — 스포츠 이모지 + 그라데이션 + 회비/일정/참여현황 표시
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 px-3 sm:px-0">
                {filtered.map((p) => (
                  <ClubCard
                    key={p.id}
                    post={p}
                    currentUserId={user?.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 모바일 필터 바텀시트 */}
      {filterSheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-[100] bg-black/50 flex items-end"
          onClick={() => setFilterSheetOpen(false)}
        >
          <div
            className="w-full bg-card rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-violet-500" />
                필터
              </h3>
              <button
                onClick={() => setFilterSheetOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* 상태 */}
              <div>
                <h4 className="font-medium mb-3 text-sm">모집 상태</h4>
                <div className="grid grid-cols-3 gap-2">
                  {STATUS_OPTIONS.map((opt) => {
                    const active = filters.status === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFilters((f) => ({ ...f, status: opt.value }))}
                        className={`flex items-center justify-center px-3 py-2.5 rounded-xl text-center transition-colors text-sm font-medium ${
                          active
                            ? "bg-violet-500 text-white"
                            : "bg-secondary hover:bg-secondary/80 text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 실력 수준 */}
              <div>
                <h4 className="font-medium mb-3 text-sm">실력 수준</h4>
                <div className="grid grid-cols-5 gap-2">
                  {SKILL_OPTIONS.map((opt) => {
                    const active = filters.skill === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFilters((f) => ({ ...f, skill: opt.value }))}
                        className={`flex items-center justify-center px-2 py-2.5 rounded-xl text-center transition-colors text-xs font-medium ${
                          active
                            ? "bg-violet-500 text-white"
                            : "bg-secondary hover:bg-secondary/80 text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 카테고리 */}
              <div>
                <h4 className="font-medium mb-3 text-sm">종목</h4>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORY_OPTIONS.map((opt) => {
                    const active = filters.category === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFilters((f) => ({ ...f, category: opt.value }))}
                        className={`flex items-center justify-center px-3 py-2.5 rounded-xl text-center transition-colors text-sm font-medium ${
                          active
                            ? "bg-violet-500 text-white"
                            : "bg-secondary hover:bg-secondary/80 text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-border bg-card">
              <button
                onClick={() => setFilters({ category: "전체", status: "all", skill: "all" })}
                className="flex-1 py-2.5 rounded-xl border border-border bg-background hover:bg-secondary text-sm font-medium"
              >
                초기화
              </button>
              <button
                onClick={() => setFilterSheetOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-bold"
              >
                {filtered.length}개 결과 보기
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

export default function ClubsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <ClubsPageContent />
    </Suspense>
  )
}
