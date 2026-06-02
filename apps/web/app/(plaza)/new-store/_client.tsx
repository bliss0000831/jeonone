"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import type { NewStorePost } from "@/components/new-store-card"
import { Store, Plus, Eye, Heart } from "lucide-react"
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
  { value: "음식점", label: "음식점" },
  { value: "카페", label: "카페" },
  { value: "미용", label: "미용" },
  { value: "병원", label: "병원" },
  { value: "학원", label: "학원" },
  { value: "마트", label: "마트" },
  { value: "기타", label: "기타" },
]

const PERIOD_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "week", label: "이번주" },
  { value: "month", label: "이번달" },
  { value: "3months", label: "3개월내" },
]

const EVENT_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "event", label: "오픈이벤트만" },
]

function formatOpening(opening_date: string | null | undefined): string {
  if (!opening_date) return ''
  const t = new Date(opening_date).getTime()
  if (Number.isNaN(t)) return ''
  const days = Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24))
  if (days > 0 && days <= 7) return `D-${days} 오픈예정`
  if (days === 0) return '오늘 오픈'
  if (days < 0 && days >= -7) return `${-days}일 전 오픈`
  return new Date(opening_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function NewStorePageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const searchParams = useSearchParams()
  const router = useRouter()
  const PAGE_SIZE = 50
  const [posts, setPosts] = useState<NewStorePost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  // 검색/필터는 URL 을 신뢰원으로 — 새로고침/뒤로가기 보존
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>({
    category: searchParams.get("category") ?? "all",
    period: searchParams.get("period") ?? "all",
    event: searchParams.get("event") ?? "all",
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
    if (filters.category !== "all") params.set("category", filters.category)
    if (filters.period !== "all") params.set("period", filters.period)
    if (filters.event !== "all") params.set("event", filters.event)
    const qs = params.toString()
    router.replace(qs ? `/new-store?${qs}` : "/new-store", { scroll: false })
  }, [debouncedSearch, filters.category, filters.period, filters.event, router])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const [{ data: profile }, { data: paRows }] = await Promise.all([
          supabase.from("profiles").select("account_type, role").eq("id", user.id).single(),
          supabase.from("plaza_admins").select("role, plaza_id").eq("user_id", user.id),
        ])
        setUserAccountType(profile?.account_type || null)
        const r = (profile as any)?.role
        const isLegacy = r === "admin" || r === "superadmin"
        const hasSuper = ((paRows as any[]) ?? []).some((x) => x?.role === "super")
        setIsAdmin(isLegacy || hasSuper)
      }

      const response = await fetch(`/api/new-store?limit=${PAGE_SIZE}&offset=0`)
      const data = await response.json()
      if (data.posts) {
        setPosts(data.posts)
        setHasMore(data.posts.length >= PAGE_SIZE)
        setOffset(data.posts.length)
      }
      setIsLoading(false)
    }
    fetchData()
    try {
      const raw = localStorage.getItem("hiddenNewStoreIds")
      if (raw) setHiddenIds(new Set(JSON.parse(raw)))
    } catch {}
  }, [])

  const isBusiness = userAccountType === "business"

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/new-store?limit=${PAGE_SIZE}&offset=${offset}`)
      const data = await res.json()
      const newPosts: NewStorePost[] = data.posts || []
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
          p.store_name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q)
      )
    }
    if (filters.category !== "all") arr = arr.filter((p) => p.category === filters.category)
    if (filters.event === "event") arr = arr.filter((p) => p.opening_event && p.opening_event.trim() !== "")

    if (filters.period !== "all") {
      const now = Date.now()
      const days = filters.period === "week" ? 7 : filters.period === "month" ? 30 : 90
      const cutoff = now - days * 24 * 60 * 60 * 1000
      const future = now + days * 24 * 60 * 60 * 1000
      arr = arr.filter((p) => {
        if (!p.opening_date) return false
        const t = new Date(p.opening_date).getTime()
        return t >= cutoff && t <= future
      })
    }

    if (hiddenIds.size > 0) arr = arr.filter((p) => !hiddenIds.has(p.id))
    // 올리기 한 글이 가장 최근이면 최상단, 그 외에는 오픈일 기준 정렬.
    // effective_at = COALESCE(bumped_at, created_at) 우선 — 단, 올리기 안 한 글은 opening_date 사용.
    arr.sort((a, b) => {
      const aBumped = (a as any).bumped_at ? new Date((a as any).bumped_at).getTime() : 0
      const bBumped = (b as any).bumped_at ? new Date((b as any).bumped_at).getTime() : 0
      if (aBumped || bBumped) return bBumped - aBumped
      const ta = a.opening_date ? new Date(a.opening_date).getTime() : 0
      const tb = b.opening_date ? new Date(b.opening_date).getTime() : 0
      return tb - ta
    })
    return arr
  }, [posts, search, filters, hiddenIds])

  const items: ListingItem[] = useMemo(() => {
    return filtered.map((p) => {
      const isOwner = !!user && user.id === p.user_id
      return {
        href: `/new-store/${p.id}`,
        imageUrl: p.images?.[0] ?? null,
        title: p.store_name,
        price: p.opening_event && p.opening_event.trim() !== '' ? '오픈이벤트 진행중' : null,
        badge: p.opening_event ? { text: '이벤트', tone: 'amber' as const } : null,
        meta: [p.address, formatOpening(p.opening_date)].filter(Boolean).join(' · '),
        stats: (
          <>
            {p.likes > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {p.likes}
              </span>
            )}
            {p.views > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {p.views}
              </span>
            )}
          </>
        ),
        categoryChip: p.category,
        moreMenu: (
          <ListingActionsMenu
            kind="new-store"
            postId={p.id}
            isOwner={isOwner}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            favoriteKind="new-store"
            shareMeta={{
              title: p.store_name,
              description: p.description ?? undefined,
              imageUrl: p.images?.[0] ?? undefined,
              url: typeof window !== "undefined" ? `${window.location.origin}/new-store/${p.id}` : `/new-store/${p.id}`,
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
        options={CATEGORY_OPTIONS}
        value={filters.category}
        onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
      />

      <ListingPageShell
        loading={isLoading}
        title={`${cityName} 신장개업`}
        headerAction={
          user && isBusiness && (
            <Link
              href="/new-store/register"
              className="inline-flex items-center gap-1 px-4 py-2 bg-amber-500 text-white rounded-full text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              신장개업 등록
            </Link>
          )
        }
        sidebar={
          <ListingFilterSidebar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="가게명, 설명, 주소 검색"
            filterGroups={[
              { key: "period", label: "오픈시기", options: PERIOD_OPTIONS },
              { key: "event", label: "이벤트", options: EVENT_OPTIONS },
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
            <Store className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {posts.length === 0 ? "아직 등록된 신장개업이 없어요" : "검색 결과가 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {posts.length === 0 ? "사장님이라면 신장개업 소식을 알려보세요!" : "다른 조건으로 검색해보세요"}
            </p>
          </div>
        }
      />

      <BottomNav />
    </div>
  )
}

export default function NewStorePageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <NewStorePageContent />
    </Suspense>
  )
}
