"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { PullToRefreshWrapper } from "@/components/pull-to-refresh-wrapper"
import type { SharingPost } from "@/components/sharing-card"
import { Heart, Plus, Eye } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"
import { User } from "@supabase/supabase-js"
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
  { value: "농기구/자재", label: "농기구/자재" },
  { value: "종자·모종", label: "종자·모종" },
  { value: "농산물", label: "농산물" },
  { value: "생활용품", label: "생활용품" },
  { value: "의류", label: "의류" },
  { value: "기타", label: "기타" },
]

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "active", label: "나눔중" },
  { value: "reserved", label: "예약중" },
  { value: "completed", label: "나눔완료" },
]

const STATUS_BADGE: Record<string, { text: string; tone: 'gray' | 'amber' | 'emerald' }> = {
  active: { text: '나눔중', tone: 'emerald' },
  reserved: { text: '예약중', tone: 'amber' },
  completed: { text: '나눔완료', tone: 'gray' },
}

function SharingPageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const searchParams = useSearchParams()
  const router = useRouter()
  const PAGE_SIZE = 50
  const [posts, setPosts] = useState<SharingPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  // 검색/필터는 URL 을 신뢰원으로 — 새로고침/뒤로가기 보존
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>({
    category: searchParams.get("category") ?? "all",
    status: searchParams.get("status") ?? "all",
  })
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

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
    if (filters.status !== "all") params.set("status", filters.status)
    const qs = params.toString()
    router.replace(qs ? `/sharing?${qs}` : "/sharing", { scroll: false })
  }, [debouncedSearch, filters.category, filters.status, router])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      // Parallelize auth + posts fetch — posts don't depend on user
      const [{ data: { user } }, response] = await Promise.all([
        supabase.auth.getUser(),
        fetch(`/api/sharing?limit=${PAGE_SIZE}&offset=0`),
      ])
      setUser(user)

      const [data] = await Promise.all([
        response.json(),
        user
          ? Promise.all([
              supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
              supabase.from("plaza_admins").select("role, plaza_id").eq("user_id", user.id),
            ]).then(([{ data: profile }, { data: paRows }]) => {
              const r = (profile as any)?.role
              const isLegacy = r === "admin" || r === "superadmin"
              const hasSuper = ((paRows as any[]) ?? []).some((x) => x?.role === "super")
              setIsAdmin(isLegacy || hasSuper)
            })
          : Promise.resolve(),
      ])
      if (data.posts) {
        setPosts(data.posts)
        setHasMore(data.posts.length >= PAGE_SIZE)
        setOffset(data.posts.length)
      }
      setIsLoading(false)
    }
    fetchData()
    try {
      const raw = localStorage.getItem("hiddenSharingIds")
      if (raw) setHiddenIds(new Set(JSON.parse(raw)))
    } catch {}
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/sharing?limit=${PAGE_SIZE}&offset=${offset}`)
      const data = await res.json()
      const newPosts: SharingPost[] = data.posts || []
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
    if (filters.category !== "all") arr = arr.filter((p) => p.category === filters.category)
    if (filters.status !== "all") arr = arr.filter((p) => p.status === filters.status)
    if (hiddenIds.size > 0) arr = arr.filter((p) => !hiddenIds.has(p.id))
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return arr
  }, [posts, search, filters, hiddenIds])

  const items: ListingItem[] = useMemo(() => {
    return filtered.map((p) => {
      const isOwner = !!user && user.id === p.user_id
      return {
        href: `/sharing/${p.id}`,
        imageUrl: p.images?.[0] ?? null,
        title: p.title,
        price: '무료 나눔',
        badge: STATUS_BADGE[p.status] ?? null,
        meta: [p.location, timeAgoKo(p.created_at)].filter(Boolean).join(' · '),
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
            kind="sharing"
            postId={p.id}
            isOwner={isOwner}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            favoriteKind="sharing"
            shareMeta={{
              title: p.title,
              description: p.description ?? undefined,
              imageUrl: p.images?.[0] ?? undefined,
              url: typeof window !== "undefined" ? `${window.location.origin}/sharing/${p.id}` : `/sharing/${p.id}`,
            }}
            onDeleted={() => setPosts((prev) => prev.filter((x) => x.id !== p.id))}
            onHide={() => setHiddenIds((prev) => new Set(prev).add(p.id))}
          />
        ),
      }
    })
  }, [filtered, user])

  return (
    <PullToRefreshWrapper>
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <ListingMobileTabs
        options={CATEGORY_OPTIONS}
        value={filters.category}
        onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
      />

      <ListingPageShell
        loading={isLoading}
        title={`${cityName} 나눔`}
        headerAction={
          user && (
            <Link
              href="/sharing/register"
              className="inline-flex items-center gap-1 px-4 py-2 bg-rose-500 text-white rounded-full text-sm font-medium hover:bg-rose-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              나눔하기
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
        afterItems={<LoadMoreButton hasMore={hasMore} loading={loadingMore} onClick={loadMore} />}
        emptyState={
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Heart className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {posts.length === 0 ? "아직 등록된 나눔이 없어요" : "검색 결과가 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {posts.length === 0 ? "첫 번째 나눔을 등록해보세요!" : "다른 조건으로 검색해보세요"}
            </p>
          </div>
        }
      />

      <BottomNav />
    </div>
    </PullToRefreshWrapper>
  )
}

export default function SharingPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SharingPageContent />
    </Suspense>
  )
}
