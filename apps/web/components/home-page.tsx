"use client"

import { useState, useEffect, useRef } from "react"
import dynamicImport from "next/dynamic"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { Header } from "@/components/header"
import { PullToRefreshWrapper } from "@/components/pull-to-refresh-wrapper"
import { BottomNav } from "@/components/bottom-nav"
import { HeroBannerClient, type BannerData } from "@/components/hero-banner-client"
import { Heart, ShoppingCart, Leaf, MessageSquare, ChevronRight, Briefcase, HandHeart } from "lucide-react"
import { SharingCard, SharingPost } from "@/components/sharing-card"
import { EditableIcon } from "@/components/editable-icon"
import { CategoryMiniNav } from "@/components/category-mini-nav"
import { useLabel } from "@/components/site-labels-client"
import { LocalFoodCard, LocalFoodPost } from "@/components/local-food-card"
import { SecondhandCard, type SecondhandPost } from "@/components/secondhand-card"
import { JobsCard, type JobsPost } from "@/components/jobs-card"
import Link from "next/link"
import { User } from "@supabase/supabase-js"
import { UserLocation } from "@/components/location-selector"
import { createClient } from "@/lib/supabase/client"
// ChuncheonNews 는 홈 페이지 하단 위젯 — 첫 LCP 무관 → dynamic import (-50KB JS)
const ChuncheonNews = dynamicImport(
  () => import("@/components/chuncheon-news").then((m) => m.ChuncheonNews),
  { ssr: false, loading: () => <div className="max-w-7xl mx-auto px-4 py-6 h-[400px]" /> },
)
// PlazaLiveWidget — 페이지 하단 위젯 (below the fold). 초기 번들 분리.
const PlazaLiveWidget = dynamicImport(
  () => import("@/components/plaza-live-widget").then((m) => m.PlazaLiveWidget),
  { ssr: false, loading: () => <div className="max-w-3xl mx-auto px-4 py-8 h-[400px]" /> },
)

interface HomePageProps {
  user: User | null
  banners: BannerData[]
  /** SSR 초기 데이터 — 서버에서 미리 가져온 각 섹션 게시물 (없으면 클라이언트에서 fetch) */
  initialData?: {
    sharingPosts?: SharingPost[]
    localFoodPosts?: LocalFoodPost[]
    secondhandPosts?: SecondhandPost[]
    jobsPosts?: JobsPost[]
  }
}

const LOCATION_STORAGE_KEY = "user-location"

export function HomePage({ user, banners, initialData }: HomePageProps) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  // 배너 carousel index — HeroBanner 와 CategoryMiniNav 가 같은 이미지 배경을 공유하기 위해 부모로 끌어올림
  const [bannerIndex, setBannerIndex] = useState(0)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sharingPosts, setSharingPosts] = useState<SharingPost[]>(initialData?.sharingPosts ?? [])
  const [localFoodPosts, setLocalFoodPosts] = useState<LocalFoodPost[]>(initialData?.localFoodPosts ?? [])
  const [secondhandPosts, setSecondhandPosts] = useState<SecondhandPost[]>(initialData?.secondhandPosts ?? [])
  const [jobsPosts, setJobsPosts] = useState<JobsPost[]>(initialData?.jobsPosts ?? [])
  // H6: 로딩 상태 — SSR 초기 데이터가 있으면 로딩 완료 상태로 시작
  const [communityLoading, setCommunityLoading] = useState(true)
  // 슈퍼관리자 편집 가능한 미니네비 라벨
  const lblMiniBoard       = useLabel("home.minimav.board.label",        "게시판")
  const lblMiniSecondhand  = useLabel("home.minimav.secondhand.label",   "중고거래")
  const lblMiniSharing     = useLabel("home.minimav.sharing.label",      "나눔")
  const lblMiniLocalFood   = useLabel("home.minimav.local_food.label",   "로컬푸드")
  const lblMiniJobs        = useLabel("home.minimav.jobs.label",         "구인구직")

  // 저장된 위치 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
    if (saved) {
      try {
        setUserLocation(JSON.parse(saved))
      } catch {
        // ignore
      }
    }
  }, [])

  // 사용자 역할 및 위치 가져오기
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('role, account_type, location, is_admin')
        .eq('id', user.id)
        .single()
      if (data) {
        setUserRole(data.role)
        setUserAccountType(data.account_type)
        // role이 'admin' 또는 'superadmin'이면 관리자
        setIsAdmin(data.role === 'admin' || data.role === 'superadmin')

        // 프로필에 저장된 location 은 localStorage 가 "아직 비어있을 때"만 기본값으로 사용.
        // (사용자가 헤더에서 직접 고른 동네를 매 페이지 이동 시 덮어쓰면 안 됨)
        if (data.location && typeof data.location === 'string') {
          const already = localStorage.getItem(LOCATION_STORAGE_KEY)
          if (!already) {
            const parts = data.location.split(' ')
            if (parts.length >= 2) {
              const parsedLocation: UserLocation = {
                sido: parts[0],
                sigungu: parts[1],
                dong: parts.slice(2).join(' ') || undefined
              }
              setUserLocation(parsedLocation)
              localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(parsedLocation))
            }
          }
        }
      }
    }
    fetchUserProfile()
  }, [user])

  // 커뮤니티 게시글 가져오기 — plaza 만 의존
  const plazaKey = (typeof window !== 'undefined') ? getCurrentPlazaClient() : null

  // SSR 초기 데이터가 있으면 첫 마운트 스킵
  const skipInitialPlazaFetch = useRef(!!initialData)
  useEffect(() => {
    if (skipInitialPlazaFetch.current) {
      skipInitialPlazaFetch.current = false
      return
    }
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()
    const withPlaza = (query: any) => (plaza ? query.eq('plaza_id', plaza) : query)

    const sharingQ = withPlaza(
      supabase.from('sharing_posts')
        .select('*')
        .eq('status', 'active'),
    ).order('likes', { ascending: false }).order('created_at', { ascending: false }).limit(4)

    const localFoodQ = withPlaza(
      supabase
        .from('local_food')
        .select('*, author:profiles!user_id(id, nickname, avatar_url)')
        .eq('status', 'available'),
    ).order('effective_at', { ascending: false }).limit(4)

    const secondhandQ = withPlaza(
      supabase.from('secondhand_posts')
        .select('*')
        .eq('status', 'active'),
    ).order('effective_at', { ascending: false }).limit(4)

    const jobsQ = withPlaza(
      supabase.from('jobs_posts')
        .select('*')
        .eq('status', 'active'),
    ).order('effective_at', { ascending: false }).limit(4)

    Promise.all([sharingQ, localFoodQ, secondhandQ, jobsQ]).then(
      ([sh, lf, se, jb]: any[]) => {
        if (sh.data) setSharingPosts(sh.data as SharingPost[])
        if (lf.data) setLocalFoodPosts(lf.data as LocalFoodPost[])
        if (se.data) setSecondhandPosts(se.data as SecondhandPost[])
        if (jb.data) setJobsPosts(jb.data as JobsPost[])
        setCommunityLoading(false)
      },
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plazaKey])

  // 위치 변경 핸들러
  const handleLocationChange = (location: UserLocation) => {
    setUserLocation(location)
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location))
  }

  return (
    <PullToRefreshWrapper>
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header
        user={user}
        location={userLocation}
        onLocationChange={handleLocationChange}
        userRole={userRole}
        userAccountType={userAccountType}
      />

      {/* Hero Banner Carousel — 배너와 미니네비가 같은 이미지 배경을 공유 */}
      <HeroBannerClient
        banners={banners}
        currentIndex={bannerIndex}
        onIndexChange={setBannerIndex}
      />

      {/* 카테고리 미니네비 — 한 줄 가로 스크롤 (모바일) / 가운데 정렬 (PC, overflow 없을 때) */}
      <CategoryMiniNav
        backgroundImageUrl={banners[bannerIndex]?.image_url || null}
        items={[
          { href: "/board",        icon: MessageSquare, iconKey: "home.minimav.board.icon",        label: lblMiniBoard },
          { href: "/secondhand",   icon: ShoppingCart,  iconKey: "home.minimav.secondhand.icon",   label: lblMiniSecondhand },
          { href: "/local-food",   icon: Leaf,          iconKey: "home.minimav.local_food.icon",   label: lblMiniLocalFood },
          { href: "/jobs",         icon: Briefcase,     iconKey: "home.minimav.jobs.icon",         label: lblMiniJobs },
          { href: "/sharing",      icon: HandHeart,     iconKey: "home.minimav.sharing.icon",      label: lblMiniSharing },
        ]}
      />

      {/* 중고거래 · 나눔 Section (동네장터 혼합 2+2) */}
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <EditableIcon
                iconKey="home.section.market.icon"
                fallback={Heart}
                tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 shadow-sm flex-shrink-0"
                iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">중고거래 · 나눔</h2>
                <p className="text-xs text-muted-foreground whitespace-nowrap">동네 이웃과 거래하고 나눠요</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/secondhand"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-amber-600 hover:text-amber-500 transition-colors whitespace-nowrap"
              >
                중고거래
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
              <Link
                href="/sharing"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-rose-600 hover:text-rose-500 transition-colors whitespace-nowrap"
              >
                나눔
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
            </div>
          </div>

          {communityLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map((i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-3 animate-pulse">
                  <div className="w-full aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 w-3/4 bg-muted rounded mb-1" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (sharingPosts.length > 0 || secondhandPosts.length > 0) ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {secondhandPosts.slice(0, 2).map((post) => (
                <SecondhandCard
                  key={`secondhand-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                />
              ))}
              {sharingPosts.slice(0, 2).map((post, index) => (
                <SharingCard
                  key={`sharing-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  isHighlighted={index === 0}
                  highlightLabel="우리동네 나눔왕!"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-gradient-to-br from-rose-50 to-amber-50 dark:from-rose-950/20 dark:to-amber-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
              <Heart className="w-12 h-12 text-rose-300 dark:text-rose-700 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">아직 등록된 나눔이 없어요</p>
              <p className="text-xs text-muted-foreground/70 mt-1">첫 번째 나눔을 시작해보세요</p>
            </div>
          )}
        </div>
      </section>

      {/* 로컬푸드 Section */}
      <section className="bg-gradient-to-b from-secondary/50 to-background py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <EditableIcon
                iconKey="home.section.fresh.icon"
                fallback={ShoppingCart}
                tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-green-500 shadow-sm flex-shrink-0"
                iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">신선하게 먹고</h2>
                <p className="text-xs text-muted-foreground whitespace-nowrap">로컬푸드로 알뜰하게</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/local-food"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-green-600 hover:text-green-500 transition-colors whitespace-nowrap"
              >
                로컬푸드
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
            </div>
          </div>

          {communityLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map((i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-3 animate-pulse">
                  <div className="w-full aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 w-3/4 bg-muted rounded mb-1" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : localFoodPosts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {localFoodPosts.slice(0, 4).map((post, index) => (
                <LocalFoodCard
                  key={`lf-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  isHighlighted={index === 0}
                  highlightLabel="신선함!"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950/20 dark:to-green-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/30">
              <ShoppingCart className="w-12 h-12 text-blue-300 dark:text-blue-700 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">아직 등록된 상품이 없어요</p>
              <p className="text-xs text-muted-foreground/70 mt-1">신선한 로컬푸드를 만나보세요</p>
            </div>
          )}
        </div>
      </section>

      {/* 구인구직 Section */}
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              <EditableIcon
                iconKey="home.section.jobs.icon"
                fallback={Briefcase}
                tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-teal-500 to-purple-500 shadow-sm flex-shrink-0"
                iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
                imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">동네 일자리</h2>
                <p className="text-xs text-muted-foreground whitespace-nowrap">일손도 가까이서</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/jobs"
                prefetch={false}
                className="flex items-center gap-0.5 text-xs sm:text-sm font-medium text-teal-600 hover:text-teal-500 transition-colors whitespace-nowrap"
              >
                구인구직
                <ChevronRight className="w-3 sm:w-4 h-3 sm:h-4" />
              </Link>
            </div>
          </div>

          {communityLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map((i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-3 animate-pulse">
                  <div className="w-full aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 w-3/4 bg-muted rounded mb-1" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : jobsPosts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {jobsPosts.slice(0, 4).map((post) => (
                <JobsCard
                  key={`job-${post.id}`}
                  post={post}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-gradient-to-br from-teal-50 to-purple-50 dark:from-teal-950/20 dark:to-purple-950/20 rounded-2xl border border-teal-100 dark:border-teal-900/30">
              <Briefcase className="w-12 h-12 text-teal-300 dark:text-teal-700 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">아직 등록된 공고가 없어요</p>
              <p className="text-xs text-muted-foreground/70 mt-1">동네에서 일손을 찾아봐요</p>
            </div>
          )}
        </div>
      </section>

      {/* 춘천 소식 섹션 */}
      <section id="chuncheon-news" className="py-6 border-t border-border">
        <ChuncheonNews preview />
      </section>

      {/* 지금 광장에선 — 실시간 이야기 위젯 */}
      <PlazaLiveWidget
        sharingPosts={sharingPosts}
        localFoodPosts={localFoodPosts}
        secondhandPosts={secondhandPosts}
        jobsPosts={jobsPosts}
      />

      <BottomNav />
    </div>
    </PullToRefreshWrapper>
  )
}
