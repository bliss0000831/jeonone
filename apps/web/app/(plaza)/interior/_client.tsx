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
import { Paintbrush, Plus } from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"

const CATEGORY_OPTIONS = [
  { value: "전체", label: "전체" },
  { value: "전체리모델링", label: "전체 리모델링" },
  { value: "부분시공", label: "부분 시공" },
  { value: "주방", label: "주방" },
  { value: "욕실", label: "욕실" },
  { value: "도배장판", label: "도배/장판" },
  { value: "바닥재", label: "바닥재" },
  { value: "타일", label: "타일" },
  { value: "붙박이장", label: "붙박이장" },
  { value: "조명전기", label: "조명/전기" },
  { value: "페인팅", label: "페인팅" },
  { value: "샷시창호", label: "샷시/창호" },
  { value: "발코니확장", label: "발코니 확장" },
  { value: "기타", label: "기타" },
]

const SPACE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "아파트", label: "아파트" },
  { value: "빌라", label: "빌라/주택" },
  { value: "원룸", label: "원룸/오피스텔" },
  { value: "상가", label: "상가" },
  { value: "사무실", label: "사무실" },
]

const PRICE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "0-3000000", label: "~300만원" },
  { value: "3000000-10000000", label: "300~1000만원" },
  { value: "10000000-30000000", label: "1천~3천만원" },
  { value: "30000000-", label: "3천만원+" },
]

const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "views", label: "인기순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
  { value: "likes", label: "찜많은순" },
]

function InteriorListPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [posts, setPosts] = useState<ServicePost[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  // 검색/필터/정렬은 URL 을 신뢰원으로 — 새로고침/뒤로가기 보존
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>({
    category: searchParams.get("category") ?? "전체",
    space: searchParams.get("space") ?? "all",
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
    if (filters.space !== "all") params.set("space", filters.space)
    if (filters.price !== "all") params.set("price", filters.price)
    if (sort !== "latest") params.set("sort", sort)
    const qs = params.toString()
    router.replace(qs ? `/interior?${qs}` : "/interior", { scroll: false })
  }, [debouncedSearch, filters.category, filters.space, filters.price, sort, router])

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

      // 1) 먼저 interior_posts 만 단순 조회 (FK 조인 문제로 빈 배열 되는 케이스 회피)
      //    status 필터도 없음 — 글이 실제로 존재하는지 그대로 확인.
      const plaza = getCurrentPlazaClient()
      let base = supabase
        .from("interior_posts")
        .select("*")
        .order("effective_at", { ascending: false })
      if (plaza) base = base.eq("plaza_id", plaza)
      if (filters.category !== "전체") base = base.eq("category", filters.category)

      const { data: baseRows, error: baseErr } = await base
      if (baseErr) {
        console.error("[interior] interior_posts 조회 실패", baseErr)
        setPosts([])
        setLoading(false)
        return
      }
      // 2) profiles 를 별도로 조회해서 병합 (단일 쿼리 FK 조인보다 안전)
      const rows = baseRows ?? []
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)))
      let profileMap: Record<string, { nickname: string | null; avatar_url: string | null }> = {}
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nickname, avatar_url")
          .in("id", userIds)
        for (const p of profs ?? []) {
          profileMap[p.id] = { nickname: p.nickname, avatar_url: p.avatar_url }
        }
      }
      const merged = rows.map((r) => ({ ...r, profiles: profileMap[r.user_id] ?? null }))
      setPosts(merged as ServicePost[])
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
    if (filters.space !== "all") {
      const keyword = filters.space.toLowerCase()
      arr = arr.filter(
        (p) =>
          p.title.toLowerCase().includes(keyword) ||
          p.content.toLowerCase().includes(keyword)
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
  }, [posts, search, filters.space, filters.price, sort])

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <PageHero
          pageKey="interior"
          bannerImage="/banners/interior-banner.jpg"
          eyebrow="홈즈 · 공간을 새롭게"
          icon={<Paintbrush className="w-7 h-7 sm:w-8 sm:h-8 text-purple-300" />}
          title="우리 집"
          titleAccent="인테리어"
          accentGradient="from-purple-300 to-fuchsia-300"
          subtitle="취향을 아는 우리 동네 인테리어 전문가"
          action={
            user && (
              <Link
                href="/interior/register"
                className="flex items-center gap-1 px-4 py-2 bg-purple-500 text-white rounded-full text-sm font-medium hover:bg-purple-600 transition-colors shadow-lg shadow-black/20"
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
                { key: "category", label: "시공종류", options: CATEGORY_OPTIONS, allValue: "전체" },
                { key: "space", label: "공간", options: SPACE_OPTIONS },
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
              <ServiceCard serviceType="interior" key={post.id} post={post} currentUserId={user?.id} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Paintbrush className="w-12 h-12 text-purple-500/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {posts.length === 0 ? "등록된 인테리어 업체가 없어요" : "검색 결과가 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {posts.length === 0 ? "첫 번째 업체가 되어보세요" : "다른 조건으로 검색해보세요"}
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

export default function InteriorListPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <InteriorListPageContent />
    </Suspense>
  )
}
