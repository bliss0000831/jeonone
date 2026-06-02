'use client'

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import dynamicImport from 'next/dynamic'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { useSiteBranding } from '@/components/site-branding-client'
import { plazaCityName } from '@/lib/plaza/city-name'
import { PropertyCard } from '@/components/property-card'
import { Header } from '@/components/header'
import { BottomNav } from '@/components/bottom-nav'
import { ListingToolbar } from '@/components/listing-toolbar'
import { PageHero } from '@/components/page-hero'
import { PropertyFilterModal } from '@/components/property-filter-modal'
import { Loader2, Filter, Building2, Map as MapIcon, LayoutGrid, MapPin, TrendingUp, Sparkles, SlidersHorizontal, X } from 'lucide-react'
import { User } from '@supabase/supabase-js'
import { Property, DbProperty, dbToProperty, FilterOptions } from '@/types/app'
// Naver Maps SDK (~300KB+) 는 지도 모드 진입 시에만 로드 — 초기 번들에서 분리
const PropertyMapView = dynamicImport(
  () => import('@/components/property-map-view').then((m) => m.PropertyMapView),
  { ssr: false, loading: () => <div className="w-full h-[500px] bg-muted/30 rounded-md animate-pulse" /> },
)
import { PropertyCompareBar } from '@/components/property-compare-bar'
import { cn } from '@/lib/utils'

const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'price_desc', label: '가격 높은순' },
  { value: 'price_asc', label: '가격 낮은순' },
  { value: 'views', label: '조회순' },
  { value: 'likes', label: '찜많은순' },
]

function PropertiesPageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const PAGE_SIZE = 50
  const router = useRouter()
  const pathname = usePathname()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [userFavorites, setUserFavorites] = useState<string[]>([])
  const [propOffset, setPropOffset] = useState(0)
  const [propHasMore, setPropHasMore] = useState(false)
  const [propLoadingMore, setPropLoadingMore] = useState(false)
  const searchParams = useSearchParams()
  const initialSeller = (() => {
    const s = searchParams?.get('seller')
    return s === 'agent' || s === 'individual' ? s : 'all'
  })()
  const [search, setSearch] = useState(searchParams?.get('q') ?? '')
  // 통합 필터 — 홈 화면과 같은 FilterOptions 모양 (공유 모달 사용)
  const [filters, setFilters] = useState<FilterOptions>({
    propertyType: (searchParams?.get('type') ?? '전체') as FilterOptions['propertyType'],
    transactionType: (searchParams?.get('tx') ?? '전체') as FilterOptions['transactionType'],
    sellerType: (initialSeller === 'agent' || initialSeller === 'individual' ? initialSeller : (searchParams?.get('seller') ?? '전체')) as FilterOptions['sellerType'],
    option: (searchParams?.get('opt') ?? '전체') as FilterOptions['option'],
  })
  const [sort, setSort] = useState(searchParams?.get('sort') ?? 'latest')

  // 필터/정렬 변경 시 URL 동기화 (뒤로가기/새로고침 보존)
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (filters.propertyType && filters.propertyType !== '전체') params.set('type', filters.propertyType)
    if (filters.transactionType && filters.transactionType !== '전체') params.set('tx', filters.transactionType)
    if (filters.sellerType && filters.sellerType !== '전체') params.set('seller', filters.sellerType)
    if (filters.option && filters.option !== '전체') params.set('opt', filters.option)
    if (sort !== 'latest') params.set('sort', sort)
    const qs = params.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    router.replace(url, { scroll: false })
  }, [filters, sort, search, pathname, router])
  // 빠른 필터 (홈 화면 스타일) — 정렬을 함께 변경하는 토글식 quick action
  const [quickFilter, setQuickFilter] = useState<'none' | 'nearby' | 'popular' | 'new'>('none')
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const handleQuickFilter = (qf: 'nearby' | 'popular' | 'new') => {
    if (quickFilter === qf) {
      setQuickFilter('none')
      return
    }
    setQuickFilter(qf)
    if (qf === 'popular') setSort('likes')
    else if (qf === 'new') setSort('latest')
  }
  const [view, setView] = useState<'grid' | 'map'>('grid')
  const supabase = createClient()

  // user/favorites/properties 를 한 번에 병렬 조회 — properties 가 favorites 를 기다리지 않게.
  // (이전엔 favorites 셋된 후 fetchProperties 가 다시 fire → 두 번 fetch)
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoadError(false)
      const plaza = getCurrentPlazaClient()
      const userRes = supabase.auth.getUser()
      const propsP = (async () => {
        let q = supabase
          .from('properties')
          .select(
            'id, user_id, title, property_type, transaction_type, price, monthly_rent, maintenance_fee, area_sqm, floor_info, total_floors, rooms, bathrooms, address, lat, lng, description, images, features, move_in_date, direction, parking, elevator, pet_allowed, views, status, seller_type, is_featured, created_at, updated_at, bumped_at, effective_at, profiles:user_id(id, nickname, phone, avatar_url, account_type, location)'
          )
          .eq('status', 'active')
          .order('effective_at', { ascending: false })
          .range(0, PAGE_SIZE - 1)
        if (plaza) q = q.eq('plaza_id', plaza)
        return q
      })()
      const [{ data: { user } }, propsRes] = await Promise.all([userRes, propsP])
      if (!alive) return
      setUser(user)

      // 찜 — user 있으면 별도 조회 (속도 향상 위해 비동기, 도착 즉시 머지)
      let favIds: string[] = []
      if (user) {
        let favQ: any = supabase
          .from('favorites')
          .select('property_id')
          .eq('user_id', user.id)
        if (plaza) favQ = favQ.eq('plaza_id', plaza)
        const { data: favorites } = await favQ
        if (!alive) return
        favIds = favorites?.map((f: any) => f.property_id) ?? []
        setUserFavorites(favIds)
      }

      // properties 처리
      const data = propsRes.data
      const error = propsRes.error
      if (error) {
        console.error('Error fetching properties:', error)
        setLoadError(true)
        setLoading(false)
        return
      }
      const profilesMap: Record<string, any> = {}
      data?.forEach((p: any) => {
        if (p.profiles) profilesMap[p.user_id] = p.profiles
      })
      const propertyIds = (data || []).map((p: any) => p.id)
      const favoriteCountMap: Record<string, number> = {}
      if (propertyIds.length > 0) {
        const { data: counts } = await supabase.rpc('get_property_favorite_counts', {
          p_plaza_id: plaza ?? "",
          p_property_ids: propertyIds,
        })
        if (!alive) return
        if (Array.isArray(counts)) {
          for (const row of counts as any[]) {
            favoriteCountMap[row.property_id] = Number(row.favorite_count ?? 0)
          }
        }
      }
      const propertiesWithProfiles = (data as any[] | null)?.map((p: any) => ({
        ...p,
        profiles: profilesMap[p.user_id] || null,
      })) ?? []
      const converted = (propertiesWithProfiles as DbProperty[]).map((p) =>
        dbToProperty(p, favoriteCountMap[p.id] || 0, favIds.includes(p.id))
      )
      if (!alive) return
      setProperties(converted)
      setPropHasMore((data as any[] | null)?.length ? (data as any[]).length >= PAGE_SIZE : false)
      setPropOffset((data as any[] | null)?.length ?? 0)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMoreProperties = useCallback(async () => {
    if (propLoadingMore || !propHasMore) return
    setPropLoadingMore(true)
    try {
      const plaza = getCurrentPlazaClient()
      let q = supabase
        .from('properties')
        .select(
          'id, user_id, title, property_type, transaction_type, price, monthly_rent, maintenance_fee, area_sqm, floor_info, total_floors, rooms, bathrooms, address, lat, lng, description, images, features, move_in_date, direction, parking, elevator, pet_allowed, views, status, seller_type, is_featured, created_at, updated_at, bumped_at, effective_at, profiles:user_id(id, nickname, phone, avatar_url, account_type, location)'
        )
        .eq('status', 'active')
        .order('effective_at', { ascending: false })
        .range(propOffset, propOffset + PAGE_SIZE - 1)
      if (plaza) q = q.eq('plaza_id', plaza)
      const { data, error } = await q
      if (error || !data) {
        setPropLoadingMore(false)
        return
      }
      const profilesMap: Record<string, any> = {}
      data.forEach((p: any) => {
        if (p.profiles) profilesMap[p.user_id] = p.profiles
      })
      const propertyIds = data.map((p: any) => p.id)
      const favoriteCountMap: Record<string, number> = {}
      if (propertyIds.length > 0) {
        const { data: counts } = await supabase.rpc('get_property_favorite_counts', {
          p_plaza_id: plaza ?? "",
          p_property_ids: propertyIds,
        })
        if (Array.isArray(counts)) {
          for (const row of counts as any[]) {
            favoriteCountMap[row.property_id] = Number(row.favorite_count ?? 0)
          }
        }
      }
      const propertiesWithProfiles = data.map((p: any) => ({
        ...p,
        profiles: profilesMap[p.user_id] || null,
      }))
      const converted = (propertiesWithProfiles as DbProperty[]).map((p) =>
        dbToProperty(p, favoriteCountMap[p.id] || 0, userFavorites.includes(p.id))
      )
      setProperties(prev => [...prev, ...converted])
      setPropHasMore(data.length >= PAGE_SIZE)
      setPropOffset(prev => prev + data.length)
    } finally {
      setPropLoadingMore(false)
    }
  }, [propLoadingMore, propHasMore, propOffset, userFavorites])

  const filtered = useMemo(() => {
    let arr = [...properties]
    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q) ||
          p.district?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      )
    }
    if (filters.sellerType && filters.sellerType !== '전체') {
      arr = arr.filter((p) => p.seller_type === filters.sellerType)
    }
    if (filters.propertyType && filters.propertyType !== '전체') {
      arr = arr.filter((p) => p.propertyType === filters.propertyType)
    }
    if (filters.transactionType && filters.transactionType !== '전체') {
      arr = arr.filter((p) => p.transactionType === filters.transactionType)
    }
    if (filters.option === 'parking') arr = arr.filter((p) => p.parking)
    else if (filters.option === 'elevator') arr = arr.filter((p) => p.elevator)
    else if (filters.option === 'pet') arr = arr.filter((p) => p.petAllowed)

    // 동네 (시·군·구·동) — 주소에 키워드 포함되면 매칭
    if (filters.district && filters.district !== '전체') {
      const d = filters.district as string
      arr = arr.filter((p) => p.address?.includes(d) || p.district?.includes(d))
    }

    // 가격(만원) / 면적(m²) 범위
    if (filters.minPrice != null) arr = arr.filter((p) => p.price >= filters.minPrice!)
    if (filters.maxPrice != null) arr = arr.filter((p) => p.price <= filters.maxPrice!)
    if (filters.minArea != null) arr = arr.filter((p) => (p.area ?? 0) >= filters.minArea!)
    if (filters.maxArea != null) arr = arr.filter((p) => (p.area ?? 0) <= filters.maxArea!)

    if (sort === 'price_desc') arr.sort((a, b) => b.price - a.price)
    else if (sort === 'price_asc') arr.sort((a, b) => a.price - b.price)
    else if (sort === 'views') arr.sort((a, b) => b.views - a.views)
    else if (sort === 'likes') arr.sort((a, b) => b.likes - a.likes)
    else arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return arr
  }, [properties, search, filters, sort])

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <PageHero
          pageKey="properties"
          bannerImage="/banners/properties-banner.jpg"
          eyebrow={`${cityName} · 우리 동네 부동산`}
          icon={<Building2 className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-300" />}
          title="동네"
          titleAccent="부동산"
          accentGradient="from-indigo-300 to-purple-300"
          subtitle="중개사와 일반 매물, 한 곳에서 비교해요"
        >
          {/* Hero 안에는 검색만 (제목+부제+검색) — 깔끔한 인상 */}
          <div className="rounded-xl overflow-hidden border border-white/50 bg-white/70 dark:bg-slate-900/55 backdrop-blur-2xl shadow-xl ring-1 ring-black/5">
            <ListingToolbar
              className="!bg-transparent border-none"
              searchPlaceholder="제목, 주소, 동네 검색"
              searchValue={search}
              onSearchChange={setSearch}
              filterValues={{}}
              onFilterChange={() => {}}
              showFilters={false}
              showFooter={false}
            />
          </div>
        </PageHero>

        {/* 컨트롤 스트립 — 2줄 레이아웃
            Row 1: 빠른 필터 pill (좌) + 카드/지도 토글 (우)
            Row 2: 매물 N개 (좌) + 최신순 (우) */}
        <div className="mb-3 space-y-2">
          {/* Row 1 — pills + 카드/지도 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 min-w-0 flex-1">
            <button
              onClick={() => handleQuickFilter('nearby')}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shadow-sm',
                quickFilter === 'nearby'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-primary/10 text-foreground hover:bg-primary/20 border border-primary/20',
              )}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>내 주변</span>
            </button>
            <button
              onClick={() => handleQuickFilter('popular')}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shadow-sm',
                quickFilter === 'popular'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-primary/10 text-foreground hover:bg-primary/20 border border-primary/20',
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>인기매물</span>
            </button>
            <button
              onClick={() => handleQuickFilter('new')}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shadow-sm',
                quickFilter === 'new'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-primary/10 text-foreground hover:bg-primary/20 border border-primary/20',
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>신규매물</span>
            </button>
            </div>
            {/* 카드/지도 토글 — 같은 줄 우측 */}
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-card flex-shrink-0">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                  view === 'grid'
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="w-3 h-3" />
                카드
              </button>
              <button
                type="button"
                onClick={() => setView('map')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                  view === 'map'
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <MapIcon className="w-3 h-3" />
                지도
              </button>
            </div>
          </div>

          {/* Row 2 — 매물 N개 (좌) ······ 초기화 + 필터 + 최신순 (우) */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground flex-shrink-0">
              매물 <span className="font-semibold text-primary">{filtered.length.toLocaleString()}</span>개
            </p>

            <div className="flex items-center gap-2 flex-shrink-0">
              {(() => {
                const activeCount =
                  (filters.propertyType && filters.propertyType !== '전체' ? 1 : 0) +
                  (filters.transactionType && filters.transactionType !== '전체' ? 1 : 0) +
                  (filters.sellerType && filters.sellerType !== '전체' ? 1 : 0) +
                  (filters.option && filters.option !== '전체' ? 1 : 0) +
                  (filters.minPrice != null || filters.maxPrice != null ? 1 : 0) +
                  (filters.minArea != null || filters.maxArea != null ? 1 : 0)
                const hasActive = activeCount > 0
                return (
                  <>
                    {(hasActive || quickFilter !== 'none') && (
                      <button
                        onClick={() => {
                          setFilters({
                            propertyType: '전체',
                            transactionType: '전체',
                            sellerType: '전체',
                            option: '전체',
                          })
                          setQuickFilter('none')
                        }}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                        aria-label="필터 초기화"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>초기화</span>
                      </button>
                    )}
                    <button
                      onClick={() => setFilterModalOpen(true)}
                      className={cn(
                        'flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shadow-sm',
                        hasActive
                          ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30'
                          : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30',
                      )}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>필터</span>
                      {activeCount > 0 && (
                        <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold bg-white text-primary">
                          {activeCount}
                        </span>
                      )}
                    </button>
                  </>
                )
              })()}

              {/* 정렬 */}
              <div className="flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-muted-foreground" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="text-xs text-foreground bg-transparent border-none focus:outline-none cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 공유 필터 모달 — 홈 화면과 동일 컴포넌트 (동네까지 완전 통일) */}
        <PropertyFilterModal
          open={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          value={filters}
          onChange={setFilters}
          showDistrict
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium text-foreground mb-1">데이터를 불러오지 못했습니다</h3>
            <p className="text-xs text-muted-foreground mb-4">네트워크 상태를 확인하고 다시 시도해주세요</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
            >
              다시 시도
            </button>
          </div>
        ) : view === 'map' ? (
          <PropertyMapView
            properties={filtered}
            plazaId={getCurrentPlazaClient()}
            height={640}
          />
        ) : filtered.length > 0 ? (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((property) => (
              <PropertyCard key={property.id} property={property} currentUserId={user?.id} />
            ))}
          </div>
          {propHasMore && (
            <div className="flex justify-center py-6">
              <button
                onClick={loadMoreProperties}
                disabled={propLoadingMore}
                className="px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                {propLoadingMore ? "불러오는 중..." : "더 보기"}
              </button>
            </div>
          )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Filter className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium text-foreground mb-1">
              {properties.length === 0 ? '등록된 매물이 없습니다' : '조건에 맞는 매물이 없습니다'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {properties.length === 0 ? '첫 번째 매물을 등록해보세요' : '다른 조건으로 검색해보세요'}
            </p>
          </div>
        )}
      </main>

      <PropertyCompareBar />
      <BottomNav />
    </div>
  )
}

export default function PropertiesPageClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <PropertiesPageContent />
    </Suspense>
  )
}
