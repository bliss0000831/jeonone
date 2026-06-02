"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { PullToRefreshWrapper } from "@/components/pull-to-refresh-wrapper"
import { GroupBuyingCard, GroupBuyingPost } from "@/components/group-buying-card"
import { ListingToolbar } from "@/components/listing-toolbar"
import { PageHero } from "@/components/page-hero"
import { ShoppingCart, Plus } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"

// 카테고리는 DB 컬럼이 없어 제목·상품명·설명의 키워드 매칭으로 분류
const CATEGORY_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "food", label: "식품/식자재" },
  { value: "fruit", label: "과일/채소" },
  { value: "meat", label: "정육/수산" },
  { value: "daily", label: "생활용품" },
  { value: "appliance", label: "가전/디지털" },
  { value: "beauty", label: "뷰티/화장품" },
  { value: "health", label: "건강/영양제" },
  { value: "fashion", label: "의류/잡화" },
  { value: "kids", label: "유아/아동" },
  { value: "pet", label: "반려동물" },
  { value: "etc", label: "기타" },
]

// 카테고리별 키워드(소문자). 'etc'는 어떤 카테고리에도 매칭되지 않는 항목
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: ["식품", "식자재", "쌀", "김치", "반찬", "라면", "과자", "음료", "커피", "차", "간식", "빵", "떡", "견과", "양념", "기름", "꿀", "잼", "소스", "분유"],
  fruit: ["과일", "사과", "배", "감", "귤", "오렌지", "딸기", "포도", "수박", "참외", "복숭아", "자두", "블루베리", "토마토", "채소", "야채", "배추", "무", "감자", "고구마", "양파", "마늘", "대파"],
  meat: ["정육", "수산", "고기", "소고기", "돼지", "삼겹살", "닭", "계란", "달걀", "생선", "수산물", "오징어", "새우", "게", "문어", "전복", "굴", "조개", "멸치", "한우"],
  daily: ["생활", "세제", "세탁", "휴지", "화장지", "물티슈", "키친타올", "칫솔", "치약", "비누", "샴푸", "린스", "바디워시", "청소", "수세미", "락스", "섬유유연제"],
  appliance: ["가전", "디지털", "노트북", "태블릿", "스마트폰", "폰", "충전기", "이어폰", "헤드폰", "tv", "티비", "냉장고", "세탁기", "에어컨", "청소기", "공기청정기", "전자레인지", "에어프라이어", "블루투스"],
  beauty: ["뷰티", "화장품", "스킨", "로션", "크림", "에센스", "세럼", "마스크팩", "쿠션", "파운데이션", "립", "아이섀도", "향수", "바디"],
  health: ["건강", "영양제", "비타민", "홍삼", "콜라겐", "프로바이오틱", "오메가", "루테인", "유산균", "보조식품", "한약"],
  fashion: ["의류", "옷", "패션", "잡화", "가방", "지갑", "신발", "운동화", "티셔츠", "니트", "코트", "자켓", "바지", "원피스", "양말", "속옷", "액세서리"],
  kids: ["유아", "아동", "아기", "어린이", "육아", "기저귀", "분유", "이유식", "장난감", "동화책", "학습", "유치원", "초등"],
  pet: ["반려", "강아지", "개사료", "고양이", "사료", "간식", "펫", "애견", "애묘"],
}

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "recruiting", label: "모집중" },
  { value: "confirmed", label: "모집완료" },
  { value: "completed", label: "거래완료" },
]

function matchCategory(post: GroupBuyingPost, cat: string): boolean {
  if (cat === "all") return true
  const haystack = `${post.title} ${post.product_name ?? ""} ${post.description ?? ""}`.toLowerCase()
  if (cat === "etc") {
    // 어떤 카테고리 키워드에도 매칭되지 않으면 기타
    return !Object.values(CATEGORY_KEYWORDS).some((kws) => kws.some((k) => haystack.includes(k)))
  }
  const kws = CATEGORY_KEYWORDS[cat] || []
  return kws.some((k) => haystack.includes(k))
}

const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "deadline", label: "마감임박" },
  { value: "participants", label: "참여자많은순" },
  { value: "discount", label: "할인율순" },
  { value: "price_asc", label: "가격 낮은순" },
]

function GroupBuyingPageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const searchParams = useSearchParams()
  const router = useRouter()
  const PAGE_SIZE = 50
  const [posts, setPosts] = useState<GroupBuyingPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  // 검색/필터/정렬은 URL 을 신뢰원으로 — 새로고침/뒤로가기 보존
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>({
    category: searchParams.get("category") ?? "all",
    status: searchParams.get("status") ?? "all",
  })
  const [sort, setSort] = useState(searchParams.get("sort") ?? "latest")
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

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
    if (filters.category !== "all") params.set("category", filters.category)
    if (filters.status !== "all") params.set("status", filters.status)
    if (sort !== "latest") params.set("sort", sort)
    const qs = params.toString()
    router.replace(qs ? `/group-buying?${qs}` : "/group-buying", { scroll: false })
  }, [debouncedSearch, filters.category, filters.status, sort, router])

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      // Parallelize auth + posts fetch — posts don't depend on user
      const [{ data: { user } }, response] = await Promise.all([
        supabase.auth.getUser(),
        fetch(`/api/group-buying?limit=${PAGE_SIZE}&offset=0`),
      ])
      setUser(user)

      const [data] = await Promise.all([
        response.json(),
        // Fetch profile only when user is known, non-blocking relative to posts
        user
          ? supabase
              .from("profiles")
              .select("account_type")
              .eq("id", user.id)
              .single()
              .then(({ data: profile }) => {
                setUserAccountType(profile?.account_type || null)
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
  }, [])

  const isBusiness = userAccountType === "business"

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/group-buying?limit=${PAGE_SIZE}&offset=${offset}`)
      const data = await res.json()
      const newPosts: GroupBuyingPost[] = data.posts || []
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
          p.product_name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q)
      )
    }
    if (filters.category !== "all") arr = arr.filter((p) => matchCategory(p, filters.category))
    if (filters.status !== "all") arr = arr.filter((p) => p.status === filters.status)

    const discount = (p: GroupBuyingPost) =>
      p.original_price && p.original_price > 0 ? (p.original_price - p.group_price) / p.original_price : 0
    const deadlineTs = (p: GroupBuyingPost) => (p.deadline ? new Date(p.deadline).getTime() : Infinity)

    if (sort === "deadline") arr.sort((a, b) => deadlineTs(a) - deadlineTs(b))
    else if (sort === "participants") arr.sort((a, b) => b.current_participants - a.current_participants)
    else if (sort === "discount") arr.sort((a, b) => discount(b) - discount(a))
    else if (sort === "price_asc") arr.sort((a, b) => a.group_price - b.group_price)
    else arr.sort((a, b) => {
      // 올리기 반영 — effective_at = COALESCE(bumped_at, created_at)
      const at = new Date((a as any).effective_at ?? (a as any).bumped_at ?? a.created_at).getTime()
      const bt = new Date((b as any).effective_at ?? (b as any).bumped_at ?? b.created_at).getTime()
      return bt - at
    })
    return arr
  }, [posts, search, filters, sort])

  return (
    <PullToRefreshWrapper>
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <PageHero
          pageKey="group-buying"
          bannerImage="/banners/group-buying-banner.jpg"
          eyebrow={`${cityName} · 함께 사면 싸다`}
          icon={<ShoppingCart className="w-7 h-7 sm:w-8 sm:h-8 text-blue-300" />}
          title="동네"
          titleAccent="공동구매"
          accentGradient="from-blue-300 to-indigo-300"
          subtitle="이웃과 함께 담으면 더 저렴해져요"
          action={
            user && isBusiness && (
              <Link
                href="/group-buying/register"
                className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-black/20"
              >
                <Plus className="w-4 h-4" />
                공동구매 등록
              </Link>
            )
          }
          notice={
            !isBusiness && user ? (
              <div className="px-4 py-2.5 rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 text-sm text-white/90">
                공동구매 등록은 사장님 계정만 가능합니다
              </div>
            ) : null
          }
        >
          <div className="rounded-xl overflow-hidden border border-white/50 bg-white/70 dark:bg-slate-900/55 backdrop-blur-2xl shadow-xl ring-1 ring-black/5">
            <ListingToolbar
              className="!bg-transparent border-none"
              searchPlaceholder="상품명, 제목, 지역 검색"
              searchValue={search}
              onSearchChange={setSearch}
              filterGroups={[
                { key: "category", label: "종류", options: CATEGORY_OPTIONS },
                { key: "status", label: "상태", options: STATUS_OPTIONS },
              ]}
              filterValues={filters}
              onFilterChange={setFilters}
              sortOptions={SORT_OPTIONS}
              sortValue={sort}
              onSortChange={setSort}
              resultCount={filtered.length}
              resultLabel="공구"
            />
          </div>
        </PageHero>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length > 0 ? (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((post) => (
              <GroupBuyingCard key={post.id} post={post} currentUserId={user?.id} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center py-6">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                {loadingMore ? "불러오는 중..." : "더 보기"}
              </button>
            </div>
          )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingCart className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {posts.length === 0 ? "아직 등록된 공동구매가 없어요" : "검색 결과가 없어요"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {posts.length === 0 ? "사장님이라면 공동구매를 등록해보세요!" : "다른 조건으로 검색해보세요"}
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
    </PullToRefreshWrapper>
  )
}

export default function GroupBuyingPageClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <GroupBuyingPageContent />
    </Suspense>
  )
}
