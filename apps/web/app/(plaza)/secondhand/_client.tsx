"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import type { SecondhandPost } from "@/components/secondhand-card"
import { ShoppingBag, Plus, Heart, Eye, Loader2 } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"
import { SECONDHAND_CATEGORIES } from "@/lib/constants/secondhand"

import {
  ListingPageShell,
  ListingFilterSidebar,
  ListingMobileTabs,
  LoadMoreButton,
  type ListingItem,
} from "@/components/listing"
import { timeAgoKo, formatPriceKo } from "@/components/listing/time-ago"
import { SecondhandActionsMenu } from "@/components/secondhand-actions-menu"

const CATEGORY_OPTIONS = [
  { value: "all", label: "전체" },
  ...SECONDHAND_CATEGORIES.map((c) => ({ value: c, label: c })),
]

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "active", label: "판매중" },
  { value: "reserved", label: "예약중" },
  { value: "completed", label: "판매완료" },
]

const STATUS_BADGE: Record<string, { text: string; tone: 'gray' | 'amber' | 'red' }> = {
  reserved: { text: '예약중', tone: 'amber' },
  completed: { text: '거래완료', tone: 'gray' },
  hidden: { text: '숨김', tone: 'red' },
}

function SecondhandPageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const searchParams = useSearchParams()
  const router = useRouter()
  const PAGE_SIZE = 50
  const [posts, setPosts] = useState<SecondhandPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  // 검색/필터는 URL 을 단일 신뢰원으로 — 새로고침/뒤로가기 시에도 보존.
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  // 검색어 디바운스 — 키 입력마다 서버 쿼리/URL replace 가 발생하지 않도록 300ms 지연
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  const [filters, setFilters] = useState<Record<string, string>>({
    category: searchParams.get("category") ?? "all",
    status: searchParams.get("status") ?? "all",
  })
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // 비소유자가 "이 글 숨기기" 한 ID 들 — localStorage 영구 보관
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem("hiddenSecondhandIds")
      if (raw) setHiddenIds(new Set(JSON.parse(raw)))
    } catch {}
  }, [])

  // 검색어/필터 → 서버 쿼리 파라미터 구성 (offset 별로 재사용).
  // category 는 "all" 일 때 보내지 않음 — 서버는 "전체" 가 아닌 값을 그대로 eq 필터링하므로
  // "all" 을 보내면 category="all" 로 0건 조회됨.
  const buildQuery = useCallback((nextOffset: number) => {
    const params = new URLSearchParams()
    params.set("limit", String(PAGE_SIZE))
    params.set("offset", String(nextOffset))
    const q = debouncedSearch.trim()
    if (q) params.set("q", q)
    if (filters.status !== "all") params.set("status", filters.status)
    if (filters.category !== "all") params.set("category", filters.category)
    return params.toString()
  }, [debouncedSearch, filters.status, filters.category])

  // 사용자/관리자 판별 — posts 와 독립이므로 1회만.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (!user) return
      Promise.all([
        // 통합 admin 판별 — profiles.role + plaza_admins (super 면 cross-plaza)
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("plaza_admins").select("role, plaza_id").eq("user_id", user.id),
      ]).then(([{ data: profile }, { data: paRows }]) => {
        const r = (profile as any)?.role
        const isLegacy = r === "admin" || r === "superadmin"
        const hasSuper = ((paRows as any[]) ?? []).some((x) => x?.role === "super")
        setIsAdmin(isLegacy || hasSuper)
      })
    })
  }, [])

  // 검색/필터 변경 시 서버에서 전체 데이터셋 대상으로 재조회 (로드된 50건 한정 X).
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetch(`/api/secondhand?${buildQuery(0)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const arr: SecondhandPost[] = data.posts || []
        setPosts(arr)
        setHasMore(arr.length >= PAGE_SIZE)
        setOffset(arr.length)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [buildQuery])

  // 검색어/필터 → URL 동기화 (새로고침/뒤로가기 보존).
  useEffect(() => {
    const params = new URLSearchParams()
    const q = debouncedSearch.trim()
    if (q) params.set("q", q)
    if (filters.status !== "all") params.set("status", filters.status)
    if (filters.category !== "all") params.set("category", filters.category)
    const qs = params.toString()
    router.replace(qs ? `/secondhand?${qs}` : "/secondhand", { scroll: false })
  }, [debouncedSearch, filters.status, filters.category, router])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/secondhand?${buildQuery(offset)}`)
      const data = await res.json()
      const newPosts: SecondhandPost[] = data.posts || []
      setPosts(prev => [...prev, ...newPosts])
      setHasMore(newPosts.length >= PAGE_SIZE)
      setOffset(prev => prev + newPosts.length)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, offset, buildQuery])

  const hasActiveQuery =
    !!debouncedSearch.trim() || filters.category !== "all" || filters.status !== "all"

  const filtered = useMemo(() => {
    // 검색/카테고리/상태 필터는 서버사이드에서 적용됨 — 여기선 로컬 전용 처리만.
    let arr = posts
    // 사용자가 영구 숨김한 글 제외 (localStorage 기반, 서버 비저장)
    if (hiddenIds.size > 0) arr = arr.filter((p) => !hiddenIds.has(p.id))
    // 올리기 반영 — effective_at = COALESCE(bumped_at, created_at) 우선 (서버 정렬 재확인)
    return [...arr].sort((a, b) => {
      const at = new Date((a as any).effective_at ?? (a as any).bumped_at ?? a.created_at).getTime()
      const bt = new Date((b as any).effective_at ?? (b as any).bumped_at ?? b.created_at).getTime()
      return bt - at
    })
  }, [posts, hiddenIds])

  const items: ListingItem[] = useMemo(() => {
    return filtered.map((p) => {
      const isOwner = !!user && user.id === p.user_id
      return {
        href: `/secondhand/${p.id}`,
        imageUrl: p.images?.[0] ?? null,
        title: p.title,
        price: formatPriceKo(p.price, { suffix: p.is_price_negotiable ? '~' : '' }),
        badge: STATUS_BADGE[p.status] ?? null,
        meta: [p.location, timeAgoKo((p as any).bumped_at ?? p.created_at)].filter(Boolean).join(' · '),
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
          <SecondhandActionsMenu
            postId={p.id}
            isOwner={isOwner}
            isAdmin={isAdmin}
            status={p.status}
            currentUserId={user?.id}
            shareMeta={{
              title: p.title,
              description: p.description ?? undefined,
              imageUrl: p.images?.[0] ?? undefined,
              url: typeof window !== "undefined" ? `${window.location.origin}/secondhand/${p.id}` : `/secondhand/${p.id}`,
            }}
            onStatusChange={(next) => {
              setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: next } : x)))
            }}
            onDeleted={() => {
              setPosts((prev) => prev.filter((x) => x.id !== p.id))
            }}
            onHide={() => {
              setHiddenIds((prev) => {
                const next = new Set(prev)
                next.add(p.id)
                try { localStorage.setItem("hiddenSecondhandIds", JSON.stringify([...next])) } catch {}
                return next
              })
            }}
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
        title={`${cityName} 중고거래`}
        headerAction={
          user && (
            <Link
              href="/secondhand/register"
              className="inline-flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              판매하기
            </Link>
          )
        }
        sidebar={
          <ListingFilterSidebar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="제목, 설명, 지역 검색"
            filterGroups={[
              { key: "status", label: "상태", options: STATUS_OPTIONS },
              { key: "category", label: "카테고리", options: CATEGORY_OPTIONS },
            ]}
            filterValues={filters}
            onFilterChange={setFilters}
          />
        }
        items={items}
        afterItems={
          /* "더 보기" 는 표시할 항목이 있을 때만 — "결과 없음" 빈 상태와 동시 노출 방지 */
          <LoadMoreButton hasMore={hasMore && items.length > 0} loading={loadingMore} onClick={loadMore} />
        }
        emptyState={
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {hasActiveQuery ? "검색 결과가 없어요" : "아직 등록된 물품이 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {hasActiveQuery ? "다른 조건으로 검색해보세요" : "첫 번째 물품을 등록해보세요!"}
            </p>
            {user && !hasActiveQuery && (
              <Link
                href="/secondhand/register"
                className="md:hidden mt-4 inline-flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                판매하기
              </Link>
            )}
          </div>
        }
      />

      <BottomNav />
    </div>
  )
}

export default function SecondhandPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <SecondhandPageContent />
    </Suspense>
  )
}
