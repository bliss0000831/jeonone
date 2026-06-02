"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { ServiceCard, ServicePost } from "@/components/service-card"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { ListingToolbar } from "@/components/listing-toolbar"
import { PageHero } from "@/components/page-hero"
import { SprayCan, Plus } from "lucide-react"
import { User } from "@supabase/supabase-js"
import Link from "next/link"

const CATEGORY_OPTIONS = [
  { value: "전체", label: "전체" },
  { value: "입주청소", label: "입주청소" },
  { value: "이사청소", label: "이사청소" },
  { value: "정기청소", label: "정기청소" },
  { value: "사무실청소", label: "사무실청소" },
  { value: "에어컨청소", label: "에어컨청소" },
]

const PRICE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "0-100000", label: "~10만원" },
  { value: "100000-200000", label: "10~20만원" },
  { value: "200000-400000", label: "20~40만원" },
  { value: "400000-", label: "40만원+" },
]

const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "views", label: "인기순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "likes", label: "찜많은순" },
]

function CleaningListPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [posts, setPosts] = useState<ServicePost[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  // 검색/필터/정렬은 URL 을 신뢰원으로 — 새로고침/뒤로가기 보존
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>({
    category: searchParams.get("category") ?? "전체",
    price: searchParams.get("price") ?? "all",
  })
  const [sort, setSort] = useState(searchParams.get("sort") ?? "latest")

  // 검색어 디바운스 — URL replace 빈도 제한
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
    router.replace(qs ? `/cleaning?${qs}` : "/cleaning", { scroll: false })
  }, [debouncedSearch, filters.category, filters.price, sort, router])

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    fetchUser()
  }, [])

  useEffect(() => {
    const fetchPosts = async () => {
      const supabase = createClient()
      const plaza = getCurrentPlazaClient()
      let query = supabase
        .from("cleaning_posts")
        .select("*, profiles(nickname, avatar_url)")
        .eq("status", "active")
        .order("effective_at", { ascending: false })
      if (plaza) query = query.eq("plaza_id", plaza)
      if (filters.category !== "전체") query = query.eq("category", filters.category)
      const { data } = await query
      if (data) setPosts(data as unknown as ServicePost[])
      setLoading(false)
    }
    fetchPosts()
  }, [filters.category])

  const filtered = useMemo(() => {
    let arr = [...posts]
    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.service_region?.toLowerCase().includes(q) ||
          p.service_district?.toLowerCase().includes(q)
      )
    }
    if (filters.price !== "all") {
      const [minS, maxS] = filters.price.split("-")
      const min = Number(minS) || 0
      const max = maxS ? Number(maxS) : Infinity
      arr = arr.filter((p) => {
        const price = p.min_price ?? p.max_price ?? 0
        return price >= min && price <= max
      })
    }
    if (sort === "views") arr.sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    else if (sort === "likes") arr.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    else if (sort === "price_asc") arr.sort((a, b) => (a.min_price ?? Infinity) - (b.min_price ?? Infinity))
    else if (sort === "price_desc") arr.sort((a, b) => (b.max_price ?? 0) - (a.max_price ?? 0))
    else arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return arr
  }, [posts, search, filters.price, sort])

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <PageHero
          pageKey="cleaning"
          bannerImage="/banners/cleaning-banner.jpg"
          eyebrow="홈즈 · 깨끗하게, 산뜻하게"
          icon={<SprayCan className="w-7 h-7 sm:w-8 sm:h-8 text-cyan-300" />}
          title="우리 집"
          titleAccent="청소"
          accentGradient="from-cyan-300 to-sky-300"
          subtitle="입주·이사·정기 청소, 동네 전문가가 해결해요"
          action={
            user && (
              <Link
                href="/cleaning/register"
                className="flex items-center gap-1 px-4 py-2 bg-cyan-500 text-white rounded-full text-sm font-medium hover:bg-cyan-600 transition-colors shadow-lg shadow-black/20"
              >
                <Plus className="w-4 h-4" />
                등록하기
              </Link>
            )
          }
        >
          <div className="rounded-xl overflow-hidden border border-white/50 bg-white/70 dark:bg-slate-900/55 backdrop-blur-2xl shadow-xl ring-1 ring-black/5">
            <ListingToolbar
              className="!bg-transparent border-none"
              searchPlaceholder="지역, 서비스, 업체 검색"
              searchValue={search}
              onSearchChange={setSearch}
              filterGroups={[
                { key: "category", label: "카테고리", options: CATEGORY_OPTIONS, allValue: "전체" },
                { key: "price", label: "가격대", options: PRICE_OPTIONS },
              ]}
              filterValues={filters}
              onFilterChange={setFilters}
              sortOptions={SORT_OPTIONS}
              sortValue={sort}
              onSortChange={setSort}
              resultCount={filtered.length}
              resultLabel="업체"
            />
          </div>
        </PageHero>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[4/5] bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((post) => (
              <ServiceCard key={post.id} post={post} serviceType="cleaning" currentUserId={user?.id} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <SprayCan className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {posts.length === 0 ? "아직 등록된 청소 서비스가 없어요" : "검색 결과가 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {posts.length === 0 ? "첫 번째 청소 서비스를 등록해보세요!" : "다른 조건으로 검색해보세요"}
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

export default function CleaningListPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CleaningListPageContent />
    </Suspense>
  )
}
