"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import type { JobsPost } from "@/components/jobs-card"
import { Briefcase, Plus, Eye } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"
import {
  ListingPageShell,
  ListingFilterSidebar,
  ListingMobileTabs,
  LoadMoreButton,
  type ListingItem,
} from "@/components/listing"
import { timeAgoKo } from "@/components/listing/time-ago"
import { ListingActionsMenu } from "@/components/listing-actions-menu"

const CATEGORY_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "음식점/카페/매장", label: "음식점/카페/매장" },
  { value: "물류/배달", label: "물류/배달" },
  { value: "사무/콜센터", label: "사무/콜센터" },
  { value: "과외/교육", label: "과외/교육" },
  { value: "행사/이벤트", label: "행사/이벤트" },
  { value: "단순노무", label: "단순노무" },
  { value: "전문직/기술직", label: "전문직/기술직" },
  { value: "IT/디자인", label: "IT/디자인" },
  { value: "홍보/마케팅", label: "홍보/마케팅" },
  { value: "기타", label: "기타" },
]

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "active", label: "모집중" },
  { value: "closed", label: "모집마감" },
]

const KIND_TABS = [
  { value: "all", label: "전체" },
  { value: "hiring", label: "구인" },
  { value: "seeking", label: "구직" },
]

const STATUS_BADGE: Record<string, { text: string; tone: 'gray' | 'sky' | 'emerald' }> = {
  active: { text: '모집중', tone: 'emerald' },
  closed: { text: '마감', tone: 'gray' },
}

function formatWage(wage: number | null | undefined, kind: string): string {
  if (!wage || wage <= 0) return kind === 'seeking' ? '협의' : '협의'
  if (wage >= 10000) {
    const man = Math.floor(wage / 10000)
    const rest = wage % 10000
    return rest > 0 ? `시급 ${man}만 ${rest.toLocaleString()}원` : `시급 ${man}만원`
  }
  return `시급 ${wage.toLocaleString()}원`
}

function JobsPageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const searchParams = useSearchParams()
  const router = useRouter()
  const PAGE_SIZE = 50
  const [posts, setPosts] = useState<JobsPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  // 검색/필터는 URL 을 신뢰원으로 — 새로고침/뒤로가기 보존
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>({
    kind: searchParams.get("kind") ?? "all",
    category: searchParams.get("category") ?? "all",
    status: searchParams.get("status") ?? "all",
  })

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
    if (filters.kind !== "all") params.set("kind", filters.kind)
    if (filters.category !== "all") params.set("category", filters.category)
    if (filters.status !== "all") params.set("status", filters.status)
    const qs = params.toString()
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false })
  }, [debouncedSearch, filters.kind, filters.category, filters.status, router])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      // Auth check and posts fetch are independent — run in parallel
      const [{ data: { user } }, postsResponse] = await Promise.all([
        supabase.auth.getUser(),
        fetch(`/api/jobs?limit=${PAGE_SIZE}&offset=0`),
      ])
      setUser(user)
      const postsData = await postsResponse.json()
      if (postsData.posts) {
        setPosts(postsData.posts)
        setHasMore(postsData.posts.length >= PAGE_SIZE)
        setOffset(postsData.posts.length)
      }
      if (user) {
        const [{ data: profile }, { data: paRows }] = await Promise.all([
          supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
          supabase.from("plaza_admins").select("role, plaza_id").eq("user_id", user.id),
        ])
        const r = (profile as any)?.role
        const isLegacy = r === "admin" || r === "superadmin"
        const hasSuper = ((paRows as any[]) ?? []).some((x) => x?.role === "super")
        setIsAdmin(isLegacy || hasSuper)
      }
      setIsLoading(false)
    }
    fetchData()
    try {
      const raw = localStorage.getItem("hiddenJobsIds")
      if (raw) setHiddenIds(new Set(JSON.parse(raw)))
    } catch {}
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/jobs?limit=${PAGE_SIZE}&offset=${offset}`)
      const data = await res.json()
      const newPosts: JobsPost[] = data.posts || []
      setPosts(prev => [...prev, ...newPosts])
      setHasMore(newPosts.length >= PAGE_SIZE)
      setOffset(prev => prev + newPosts.length)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, offset])

  const filtered = useMemo(() => {
    let arr = [...posts]
    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q)
      )
    }
    if (filters.kind !== "all") arr = arr.filter((p) => p.kind === filters.kind)
    if (filters.category !== "all") arr = arr.filter((p) => p.category === filters.category)
    if (filters.status !== "all") arr = arr.filter((p) => p.status === filters.status)
    if (hiddenIds.size > 0) arr = arr.filter((p) => !hiddenIds.has(p.id))
    // 올리기 반영 — effective_at = COALESCE(bumped_at, created_at)
    arr.sort((a, b) => {
      const at = new Date((a as any).effective_at ?? (a as any).bumped_at ?? a.created_at).getTime()
      const bt = new Date((b as any).effective_at ?? (b as any).bumped_at ?? b.created_at).getTime()
      return bt - at
    })
    return arr
  }, [posts, search, filters, hiddenIds])

  const items: ListingItem[] = useMemo(() => {
    return filtered.map((p) => {
      const isOwner = !!user && user.id === p.user_id
      return {
        href: `/jobs/${p.id}`,
        imageUrl: p.images?.[0] ?? null,
        title: p.title,
        price: formatWage(p.hourly_wage, p.kind),
        badge: STATUS_BADGE[p.status] ?? null,
        meta: [p.location, timeAgoKo((p as any).bumped_at ?? p.created_at)].filter(Boolean).join(' · '),
        stats: p.views > 0 ? (
          <span className="inline-flex items-center gap-0.5">
            <Eye className="w-3 h-3" />
            {p.views}
          </span>
        ) : undefined,
        categoryChip: p.kind === 'hiring' ? '구인' : p.kind === 'seeking' ? '구직' : p.category,
        moreMenu: (
          <ListingActionsMenu
            kind="jobs"
            postId={p.id}
            isOwner={isOwner}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            shareMeta={{
              title: p.title,
              description: p.description ?? undefined,
              imageUrl: p.images?.[0] ?? undefined,
              url: typeof window !== "undefined" ? `${window.location.origin}/jobs/${p.id}` : `/jobs/${p.id}`,
            }}
            onDeleted={() => setPosts((prev) => prev.filter((x) => x.id !== p.id))}
            onHide={() => setHiddenIds((prev) => new Set(prev).add(p.id))}
          />
        ),
      }
    })
  }, [filtered, user])

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <ListingMobileTabs
        options={KIND_TABS}
        value={filters.kind}
        onChange={(v) => setFilters((f) => ({ ...f, kind: v }))}
      />

      <ListingPageShell
        loading={isLoading}
        title={`${cityName} 구인구직`}
        headerAction={
          user && (
            <Link
              href="/jobs/register"
              className="inline-flex items-center gap-1 px-4 py-2 bg-teal-600 text-white rounded-full text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              등록하기
            </Link>
          )
        }
        sidebar={
          <ListingFilterSidebar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="제목, 설명, 지역 검색"
            filterGroups={[
              { key: "kind", label: "유형", options: KIND_TABS },
              { key: "status", label: "상태", options: STATUS_OPTIONS },
              { key: "category", label: "카테고리", options: CATEGORY_OPTIONS },
            ]}
            filterValues={filters}
            onFilterChange={setFilters}
          />
        }
        items={items}
        afterItems={<LoadMoreButton hasMore={hasMore} loading={loadingMore} onClick={loadMore} />}
        emptyState={
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Briefcase className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {posts.length === 0 ? "아직 등록된 공고가 없어요" : "검색 결과가 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {posts.length === 0 ? "첫 번째 구인구직을 등록해보세요!" : "다른 조건으로 검색해보세요"}
            </p>
          </div>
        }
      />

      <BottomNav />
    </div>
  )
}

export default function JobsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <JobsPageContent />
    </Suspense>
  )
}
