"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { PullToRefreshWrapper } from "@/components/pull-to-refresh-wrapper"
import { LocalFoodCard, LocalFoodPost } from "@/components/local-food-card"
import { ListingToolbar } from "@/components/listing-toolbar"
import { PageHero } from "@/components/page-hero"
import { Leaf, Plus } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"

const DEFAULT_CATEGORIES = ["전체", "채소", "과일", "쌀/잡곡", "축산물", "수산물", "가공식품", "기타"]

const PRICE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "0-10000", label: "~1만원" },
  { value: "10000-30000", label: "1~3만원" },
  { value: "30000-50000", label: "3~5만원" },
  { value: "50000-", label: "5만원+" },
]

const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "views", label: "인기순" },
  { value: "likes", label: "찜많은순" },
]

function LocalFoodPageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const searchParams = useSearchParams()
  const router = useRouter()
  const [posts, setPosts] = useState<LocalFoodPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  // 검색/필터/정렬은 URL 을 신뢰원으로 — 새로고침/뒤로가기 보존
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>({
    category: searchParams.get("category") ?? "전체",
    price: searchParams.get("price") ?? "all",
  })
  const [sort, setSort] = useState(searchParams.get("sort") ?? "latest")

  // 검색어 디바운스 — URL replace 빈도 제한 (목록 필터링 자체는 search 로 즉시 반영)
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // 검색어/필터/정렬 → URL 동기화 (새로고침/뒤로가기 보존)
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim())
    if (filters.category !== "전체") params.set("category", filters.category)
    if (filters.price !== "all") params.set("price", filters.price)
    if (sort !== "latest") params.set("sort", sort)
    const qs = params.toString()
    router.replace(qs ? `/local-food?${qs}` : "/local-food", { scroll: false })
  }, [debouncedSearch, filters.category, filters.price, sort, router])

  useEffect(() => {
    fetch("/api/categories?type=local_food")
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(["전체", ...data.map((c) => c.name)])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const params = new URLSearchParams({ limit: "50" })
      if (filters.category !== "전체") params.set("category", filters.category)

      // Parallelize auth + posts fetch — posts don't depend on user
      const [{ data: { user } }, response] = await Promise.all([
        supabase.auth.getUser(),
        fetch(`/api/local-food?${params}`),
      ])
      setUser(user)

      const [data] = await Promise.all([
        response.json(),
        user
          ? Promise.all([
              supabase.from("profiles").select("account_type, role").eq("id", user.id).single(),
              supabase.from("plaza_admins").select("role, plaza_id").eq("user_id", user.id),
            ]).then(([{ data: profile }, { data: paRows }]) => {
              setUserAccountType(profile?.account_type || null)
              const r = profile?.role || null
              const isLegacy = r === "admin" || r === "superadmin"
              const hasSuper = ((paRows as any[]) ?? []).some((x) => x?.role === "super")
              setUserRole(isLegacy || hasSuper ? "admin" : r)
            })
          : Promise.resolve(),
      ])
      if (data.posts) setPosts(data.posts)
      setIsLoading(false)
    }
    fetchData()
  }, [filters.category])

  const isAdmin = userRole === "admin" || userRole === "superadmin"
  const canWrite = userAccountType === "producer" || isAdmin

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c, label: c })),
    [categories]
  )

  const filtered = useMemo(() => {
    let arr = [...posts]
    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q) ||
          p.district?.toLowerCase().includes(q)
      )
    }
    if (filters.price !== "all") {
      const [minS, maxS] = filters.price.split("-")
      const min = Number(minS) || 0
      const max = maxS ? Number(maxS) : Infinity
      arr = arr.filter((p) => p.price >= min && p.price <= max)
    }

    if (sort === "price_asc") arr.sort((a, b) => a.price - b.price)
    else if (sort === "price_desc") arr.sort((a, b) => b.price - a.price)
    else if (sort === "views") arr.sort((a, b) => b.view_count - a.view_count)
    else if (sort === "likes") arr.sort((a, b) => b.like_count - a.like_count)
    else arr.sort((a, b) => {
      // 올리기 반영 — effective_at = COALESCE(bumped_at, created_at)
      const at = new Date((a as any).effective_at ?? (a as any).bumped_at ?? a.created_at).getTime()
      const bt = new Date((b as any).effective_at ?? (b as any).bumped_at ?? b.created_at).getTime()
      return bt - at
    })
    return arr
  }, [posts, search, filters.price, sort])

  return (
    <PullToRefreshWrapper>
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <PageHero
          pageKey="local-food"
          bannerImage="/banners/local-food-banner.jpg"
          eyebrow={`${cityName} · 신선한 로컬 푸드`}
          icon={<Leaf className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-300" />}
          title="동네"
          titleAccent="로컬 푸드"
          accentGradient="from-emerald-300 to-lime-300"
          subtitle={`생산자가 직접 전하는 ${cityName}의 싱싱한 식탁`}
          action={
            user && canWrite && (
              <Link
                href="/local-food/register"
                className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-black/20"
              >
                <Plus className="w-4 h-4" />
                상품 등록
              </Link>
            )
          }
          notice={
            !canWrite && user ? (
              <div className="px-4 py-2.5 rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 text-sm text-white/90">
                로컬 푸드 등록은 생산자 계정만 가능합니다
              </div>
            ) : null
          }
        >
          <div className="rounded-xl overflow-hidden border border-white/50 bg-white/70 dark:bg-slate-900/55 backdrop-blur-2xl shadow-xl ring-1 ring-black/5">
            <ListingToolbar
              className="!bg-transparent border-none"
              searchPlaceholder="상품명, 설명, 지역 검색"
              searchValue={search}
              onSearchChange={setSearch}
              filterGroups={[
                { key: "category", label: "카테고리", options: categoryOptions, allValue: "전체" },
                { key: "price", label: "가격대", options: PRICE_OPTIONS },
              ]}
              filterValues={filters}
              onFilterChange={setFilters}
              sortOptions={SORT_OPTIONS}
              sortValue={sort}
              onSortChange={setSort}
              resultCount={filtered.length}
              resultLabel="상품"
            />
          </div>
        </PageHero>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((post) => (
              <LocalFoodCard
                key={post.id}
                post={post}
                currentUserId={user?.id}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Leaf className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {posts.length === 0 ? "아직 등록된 상품이 없어요" : "검색 결과가 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {posts.length === 0 ? "생산자라면 신선한 로컬 푸드를 등록해보세요!" : "다른 조건으로 검색해보세요"}
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
    </PullToRefreshWrapper>
  )
}

export default function LocalFoodPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LocalFoodPageContent />
    </Suspense>
  )
}
