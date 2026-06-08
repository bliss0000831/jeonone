'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { useSiteBranding } from '@/components/site-branding-client'
import { plazaCityName } from '@/lib/plaza/city-name'
import { Header } from '@/components/header'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MessageSquare, Search, Plus, Eye, MessageCircle, Heart, Loader2,
  Trophy, Medal, Award, MapPin, Sparkles
} from 'lucide-react'
import {
  ListingFilterSidebar,
  ListingMobileTabs,
} from '@/components/listing'
import { BoardListItem } from '@/components/listing/board-list-item'
import { User } from '@supabase/supabase-js'

interface BoardPost {
  id: string
  category_id: string
  title: string
  content: string
  author_name: string | null
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  created_at: string | null
  is_pinned: boolean | null
  thumbnail_url: string | null
  images: string[] | null
}

interface BoardCategory {
  id: string
  name: string
  slug: string
  icon: string
}


function BoardPageContent() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  // 표시용 지역명 — 사용자 sub_region 우선, 없으면 광장 city명, 그것도 없으면 "우리 동네"
  // (userRegion 은 아래 useState 로 정의되며, useEffect 로 채움)
  // displayRegion 의 실제 값 계산은 userRegion 정의 이후 한 번에.
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const categoryParam = searchParams.get('category')

  const PAGE_SIZE = 50
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [categories, setCategories] = useState<BoardCategory[]>([])
  const [boardOffset, setBoardOffset] = useState(0)
  const [boardHasMore, setBoardHasMore] = useState(false)
  const [boardLoadingMore, setBoardLoadingMore] = useState(false)
  // 카테고리 선택은 URL 단일 소스(?category=xxx) 에서 유도.
  // useState 로 관리하지 않는 이유:
  //   App Router 가 detail 진입 후 뒤로가기 할 때 페이지 캐시 + state 잔여 때문에
  //   탭 표시와 URL 이 어긋나는 케이스가 있음 → URL 만 신뢰원으로 두면 항상 일치.
  const selectedCategory = categoryParam || 'free'
  const setSelectedCategory = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('category', next)
    router.push(`/board?${params.toString()}`, { scroll: false })
  }
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') ?? '')
  // 검색어 디바운스 — 키 입력마다 서버 쿼리/URL replace 가 발생하지 않도록 300ms 지연
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(t)
  }, [searchTerm])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [hotPosts, setHotPosts] = useState<any[]>([])
  const [rankers, setRankers] = useState<any[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [heroImage, setHeroImage] = useState<string | null>(null)
  // 지역 필터 — 사용자의 sub_region 자동 채움. "전체" 선택 시 모든 지역
  const [userRegion, setUserRegion] = useState<string>('')
  const [regionFilter, setRegionFilter] = useState<string>(searchParams.get('region') ?? '') // '' = 내 지역, 'all' = 전체, 그 외 = 특정 지역
  const [coverage, setCoverage] = useState<string[]>([])

  // 검색어/지역 필터 → URL 동기화 (새로고침/뒤로가기 보존). category 는 별도 관리됨.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim())
    else params.delete('q')
    if (regionFilter) params.set('region', regionFilter)
    else params.delete('region')
    const qs = params.toString()
    router.replace(qs ? `/board?${qs}` : '/board', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, regionFilter])

  // 표시용 지역명 — 사용자 지역 우선, 광장 city명 fallback, 둘 다 없으면 "우리 동네"
  // 단 'all' 필터 선택 시엔 cityName(광장명) 사용 (= "춘천광장 핫글" 컨텍스트)
  // 전체 광장 모드일 땐 지역명 비움 (= "핫글 TOP 3", "· 우리 동네 이야기" 식 표시).
  // 사용자 지역 미설정/비로그인도 동일하게 광장 전체로 취급 → 빈 문자열.
  const displayRegion =
    regionFilter === 'all'
      ? ''
      : regionFilter || userRegion || ''

  // 마운트 시 3개의 독립 fetch 를 단일 Promise.all 로 통합 — 첫 페인트 ~250ms 절감
  // (stats 는 userRegion 결정된 후 별도 useEffect 에서 호출)
  useEffect(() => {
    let alive = true
    const plaza = getCurrentPlazaClient()
    const heroUrl = plaza ? `/api/page-heroes?key=board&plaza=${encodeURIComponent(plaza)}` : '/api/page-heroes?key=board'
    const heroP = fetch(heroUrl).then((r) => r.json()).catch(() => null)
    const userP = supabase.auth.getUser()
    let catQ: any = supabase.from('board_categories').select('*').order('sort_order')
    if (plaza) catQ = catQ.eq('plaza_id', plaza)

    Promise.all([heroP, userP, catQ]).then(([hero, ures, cat]) => {
      if (!alive) return
      if (hero?.image_url) setHeroImage(hero.image_url)
      setUser(ures.data.user)
      setCategories(cat.data || [])

      // 사용자 지역 + 광장 coverage 로드
      const u = ures.data.user
      if (u) {
        supabase
          .from('profiles')
          .select('sub_region')
          .eq('id', u.id)
          .single()
          .then(({ data }) => {
            if (!alive) return
            const r = data?.sub_region || (u.user_metadata as any)?.sub_region || ''
            setUserRegion(r)
          })
      }
      if (plaza) {
        supabase
          .from('plazas')
          .select('coverage')
          .eq('id', plaza)
          .single()
          .then(({ data }) => {
            if (!alive) return
            if (Array.isArray(data?.coverage)) setCoverage(data.coverage as string[])
          })
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 핫글/수다왕 통계 — 사용자가 user 있으면 그 지역(userRegion)으로 좁힘. 미설정/비로그인은 광장 전체.
  // userRegion 미정 → user 이미 로드됐는데도 빈값이면 "지역 미설정" 으로 간주하고 전체.
  // 단 user 자체가 아직 안 왔으면(undefined) 호출 보류.
  useEffect(() => {
    if (user === null && userRegion === '') {
      // 비로그인 — 광장 전체로 즉시 호출
    } else if (user && userRegion === '') {
      // 로그인 했는데 sub_region 아직 안 옴 — 잠시 대기 (다음 tick 에 userRegion 결정)
      // userRegion 이 빈 문자열로 확정되면 fetch (지역 미설정 사용자)
    }
    let alive = true
    // 직전 페이지(상세)에서 글 삭제 등으로 통계가 무효화됐다는 플래그 → cache-buster
    let bust = false
    try {
      if (sessionStorage.getItem('board:bust-stats') === '1') {
        bust = true
        sessionStorage.removeItem('board:bust-stats')
      }
    } catch {}
    const baseUrl = userRegion
      ? `/api/board/stats?region=${encodeURIComponent(userRegion)}`
      : '/api/board/stats'
    const url = bust
      ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`
      : baseUrl
    fetch(url, bust ? { cache: 'no-store' } : undefined)
      .then((r) => r.json())
      .then((stats) => {
        if (!alive) return
        if (stats) {
          setHotPosts(stats.hotPosts || [])
          setRankers(stats.rankers || [])
        }
        setStatsLoading(false)
      })
      .catch(() => {
        if (alive) setStatsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [user, userRegion])

  useEffect(() => {
    if (categories.length === 0) return
    setLoading(true)

    const category = categories.find((c) => c.slug === selectedCategory)
    const plaza = getCurrentPlazaClient()
    let query = supabase
      .from('board_posts')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1)

    if (category) query = query.eq('category_id', category.id)
    if (plaza) query = query.eq('plaza_id', plaza)

    // 지역 필터: '' (=내 지역) → 사용자의 sub_region 또는 NULL(지역 무관) 글
    //           'all' → 모든 지역
    //           그 외 → 특정 지역
    const effectiveRegion = regionFilter === 'all' ? null : (regionFilter || userRegion)
    if (effectiveRegion) {
      // 내 지역 글 + 지역 무관 글(공지 등) 함께 표시
      query = query.or(`region.eq.${effectiveRegion},region.is.null`)
    }

    // 검색어 — 서버사이드 ilike (제목+본문) 로 전체 게시글에서 검색 (로드된 50건 한정 X)
    const term = debouncedSearch.trim()
    if (term) {
      // PostgREST or 필터 내 특수문자 이스케이프 (쉼표/괄호가 필터 구문 깨뜨림)
      const safe = term.replace(/[,()*]/g, ' ').trim()
      if (safe) query = query.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`)
    }

    query.then(({ data }) => {
      setPosts(data || [])
      setBoardHasMore((data || []).length >= PAGE_SIZE)
      setBoardOffset((data || []).length)
      setLoading(false)
    })
  }, [selectedCategory, debouncedSearch, categories, userRegion, regionFilter])

  const loadMorePosts = useCallback(async () => {
    if (boardLoadingMore || !boardHasMore) return
    setBoardLoadingMore(true)
    try {
      const category = categories.find((c) => c.slug === selectedCategory)
      const plaza = getCurrentPlazaClient()
      let query = supabase
        .from('board_posts')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(boardOffset, boardOffset + PAGE_SIZE - 1)

      if (category) query = query.eq('category_id', category.id)
      if (plaza) query = query.eq('plaza_id', plaza)

      const effectiveRegion = regionFilter === 'all' ? null : (regionFilter || userRegion)
      if (effectiveRegion) {
        query = query.or(`region.eq.${effectiveRegion},region.is.null`)
      }

      // 검색어 — 서버사이드 ilike (초기 로드와 동일 조건)
      const term = debouncedSearch.trim()
      if (term) {
        const safe = term.replace(/[,()*]/g, ' ').trim()
        if (safe) query = query.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`)
      }

      const { data } = await query
      const newPosts = data || []
      setPosts(prev => [...prev, ...newPosts])
      setBoardHasMore((data || []).length >= PAGE_SIZE)
      setBoardOffset(prev => prev + (data || []).length)
    } finally {
      setBoardLoadingMore(false)
    }
  }, [boardLoadingMore, boardHasMore, boardOffset, categories, selectedCategory, regionFilter, userRegion, debouncedSearch])

  const isVideoUrl = (url: string) =>
    /\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/i.test(url)

  const getThumb = (post: BoardPost) => {
    if (post.thumbnail_url) return post.thumbnail_url
    if (post.images && post.images.length > 0) {
      // 첫 번째 이미지(동영상 아닌 것) 찾기
      const firstImage = post.images.find((u) => !isVideoUrl(u))
      return firstImage || null
    }
    return null
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      {/* 타이틀 히어로 + 위젯 — 사진 + 그라데이션 오버레이 + 데코 (하단 위젯까지 배경 연장) */}
      <div className="relative border-b border-border pt-4 sm:pt-5 pb-6 overflow-hidden">
        {/* 배경 이미지 */}
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: heroImage
            ? `url('${encodeURI(heroImage).replace(/'/g, "%27")}'), url('/images/banner-news.jpg')`
            : "url('/images/banner-news.jpg')" }}
          aria-hidden
        />
        {/* 라이트 그라데이션 오버레이 — 다른 히어로들과 톤 맞춤 */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-slate-900/55 via-slate-900/35 to-slate-900/15"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent"
          aria-hidden
        />
        {/* 데코 블러 서클 */}
        <div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-sky-400/20 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-24 -left-10 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl"
          aria-hidden
        />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-[11px] font-semibold text-white/90 tracking-wider mb-3">
                <MapPin className="w-3 h-3" />
                {displayRegion ? `${displayRegion} · ` : ''}마을 커뮤니티
              </div>
              {/* Title
                * 카카오톡 WebView 는 CSS filter(`drop-shadow-*`) 컨텍스트 하위에
                * `bg-clip-text` 가 오면 텍스트가 로딩 후 사라지는 버그가 있음.
                * → filter 대신 text-shadow 로 그림자를 대체하고, 전체 h1 에서
                *   filter 를 완전히 제거해 gradient span 을 안전하게 보존. */}
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                {/* 그림자는 "동네" 에만 — gradient 글자 뒤에 text-shadow 글리프가
                 * 깔리면 색이 탁해지므로 gradient span 은 그림자 없이 둔다. */}
                <span style={{ textShadow: '0 2px 4px rgba(0,0,0,0.35)' }}>전원 </span>
                <span className="bg-gradient-to-r from-emerald-200 to-lime-200 bg-clip-text text-transparent">
                  소식통
                </span>
                <Sparkles className="inline-block align-middle ml-2 w-5 h-5 sm:w-6 sm:h-6 text-amber-300" />
              </h1>
              {/* Subtitle */}
              <p
                className="text-sm sm:text-base text-white/85 mt-2"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
이웃들의 동네 소식을 나눠요
              </p>
            </div>
            <Link href={user ? '/board/create' : '/auth/login'} className="flex-shrink-0">
              <Button className="gap-2 shadow-lg shadow-black/20" size="sm">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">글쓰기</span>
              </Button>
            </Link>
          </div>
          {/* Glass search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="궁금한 이야기를 검색해보세요"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 bg-white dark:bg-slate-900/85 backdrop-blur-md border-white/40 dark:border-white/10 shadow-lg shadow-black/10 text-sm"
            />
          </div>
        </div>

        {/* 인기글 + 활동왕 위젯 — 히어로 배경 위로 글래스 카드 */}
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-6">
          {/* 모바일: 가로 스와이프 슬라이드 (1장씩 snap)
              PC: 2열 그리드 (md+) */}
          {/* 모바일: 가로 스와이프 슬라이드 — 다음 카드가 우측에 살짝 보이도록 너비 ~88%
              PC: 2열 그리드 (md+) */}
          <div className="md:grid md:grid-cols-2 md:gap-3 flex md:block overflow-x-auto md:overflow-visible snap-x snap-mandatory scrollbar-hide gap-3 px-1 md:px-0 [&>*]:snap-start [&>*]:flex-shrink-0 [&>*]:w-[88%] sm:[&>*]:w-[90%] md:[&>*]:w-auto">
            {/* 주간 인기 BEST 3 */}
            <div className="bg-white/85 dark:bg-slate-900/60 backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-xl p-4 shadow-xl ring-1 ring-black/5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base" aria-hidden="true">🔥</span>
              <h2 className="font-bold text-sm">{displayRegion ? `${displayRegion} ` : ''}핫글 TOP 3</h2>
            </div>
            {statsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : hotPosts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">아직 좋아요가 없어요</p>
            ) : (
              <div className="space-y-2">
                {hotPosts.map((p: any, idx: number) => {
                  const thumb = p.thumbnail_url || (p.images?.[0] ?? null)
                  const rankColors = [
                    'bg-gradient-to-br from-amber-400 to-amber-600 text-white',
                    'bg-gradient-to-br from-slate-300 to-slate-500 text-white',
                    'bg-gradient-to-br from-orange-400 to-orange-600 text-white',
                  ]
                  return (
                    <Link key={p.id} href={`/board/${p.id}`}>
                      <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/70 transition-colors cursor-pointer">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${rankColors[idx]}`}>
                          {idx + 1}
                        </div>
                        {thumb ? (
                          <Image src={thumb} alt="" width={40} height={40} className="w-10 h-10 rounded-md object-cover flex-shrink-0" sizes="40px" />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="w-4 h-4 text-primary/50" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.author_name || '익명'} · <Heart className="w-2.5 h-2.5 inline-block fill-rose-500 text-rose-500" /> {p.like_count ?? 0}
                          </p>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* 우리 마을 활동왕 */}
          <div className="bg-white/85 dark:bg-slate-900/60 backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-xl p-4 shadow-xl ring-1 ring-black/5">
            <div className="flex items-center gap-1.5 mb-3 min-w-0">
              <span className="text-base" aria-hidden="true">👑</span>
              <h2 className="font-bold text-sm whitespace-nowrap">{displayRegion ? `${displayRegion} ` : ''}수다왕</h2>
              <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">글×10·댓×3·♥×1</span>
            </div>
            {statsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : rankers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">활동 기록이 없어요</p>
            ) : (
              <div className="space-y-2">
                {rankers.map((r: any, idx: number) => {
                  const icons = [
                    <Trophy key="t" className="w-3.5 h-3.5 text-amber-500" />,
                    <Medal key="m" className="w-3.5 h-3.5 text-slate-400" />,
                    <Award key="a" className="w-3.5 h-3.5 text-orange-500" />,
                  ]
                  const bgs = [
                    'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900',
                    'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800',
                    'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900',
                  ]
                  const box = idx < 3 ? bgs[idx] : 'bg-muted/40 border-border'
                  return (
                    <Link
                      key={r.user_id}
                      href={`/profile/${r.user_id}`}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors hover:brightness-105 hover:shadow-sm ${box}`}
                    >
                      <div className="w-6 flex-shrink-0 flex items-center justify-center">
                        {idx < 3 ? icons[idx] : (
                          <span className="text-[11px] font-bold text-muted-foreground">{idx + 1}</span>
                        )}
                      </div>
                      {r.avatar_url ? (
                        <Image src={r.avatar_url} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" sizes="32px" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {r.nickname?.[0] || '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate hover:text-primary transition-colors">{r.nickname || '익명'}</p>
                        <p className="text-[10px] text-muted-foreground whitespace-nowrap truncate">
                          글 {r.posts} · 댓 {r.comments} · ♥ {r.likes}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{r.score}</p>
                        <p className="text-[9px] text-muted-foreground -mt-0.5">점</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* 카테고리 탭 (모바일) + 사이드바 + 그리드/리스트 (PC) */}
      {(() => {
        const categoryOptions = [
          { value: 'free', label: '마을 사랑방' },
          ...categories
            .filter((c) => c.slug !== 'free')
            .map((c) => ({ value: c.slug, label: c.name })),
        ]
        // categories 가 아직 로드되지 않은 경우, 기본 5개 슬러그 사용
        const fallbackOptions = [
          { value: 'free', label: '마을 사랑방' },
          { value: 'restaurant', label: '맛집 추천' },
          { value: 'living', label: '생활정보' },
          { value: 'daily', label: '농업 일기' },
          { value: 'qna', label: '궁금해요' },
        ]
        const tabOptions = categories.length > 0 ? categoryOptions : fallbackOptions

        const emptyState = (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <MessageSquare className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-3">아직 게시글이 없습니다</p>
            {user && (
              <Link href="/board/create">
                <Button size="sm" variant="outline">첫 게시글 작성하기</Button>
              </Link>
            )}
          </div>
        )

        return (
          <>
            <ListingMobileTabs
              options={tabOptions}
              value={selectedCategory}
              onChange={setSelectedCategory}
            />

            {/* 지역 필터 — 사용자 지역 자동 활성화 + 전체/특정 지역 토글 */}
            {(userRegion || coverage.length > 0) && (
              <div className="md:max-w-6xl md:mx-auto md:px-6 px-3 pt-2">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
                  {/* 내 지역 (sub_region 있을 때만) */}
                  {userRegion && (
                    <button
                      onClick={() => setRegionFilter('')}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                        regionFilter === '' || regionFilter === userRegion
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      📍 {userRegion} (내 지역)
                    </button>
                  )}
                  {/* 전체 */}
                  <button
                    onClick={() => setRegionFilter('all')}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                      regionFilter === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                    }`}
                  >
                    전체 광장
                  </button>
                  {/* 다른 지역들 */}
                  {coverage
                    .filter((r) => r !== userRegion)
                    .map((r) => (
                      <button
                        key={r}
                        onClick={() => setRegionFilter(r)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                          regionFilter === r
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <main className="max-w-6xl mx-auto px-0 md:px-6 py-0 md:py-6">
              <div className="flex gap-8">
                {/* PC 사이드바 */}
                <div className="hidden md:block w-60 flex-shrink-0">
                  <ListingFilterSidebar
                    filterGroups={[
                      { key: 'category', label: '카테고리', options: tabOptions },
                    ]}
                    filterValues={{ category: selectedCategory }}
                    onFilterChange={(next) => setSelectedCategory(next.category)}
                  />
                </div>

                {/* 게시글 리스트 — 텍스트 중심 row 스타일 */}
                <div className="flex-1 min-w-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : posts.length === 0 ? (
                    <div className="px-4 md:px-0">{emptyState}</div>
                  ) : (
                    <>
                    <div className="md:rounded-xl md:border md:border-border md:overflow-hidden md:bg-card">
                      {posts.map((post) => {
                        const thumbnail = getThumb(post)
                        const imagesCount = post.images?.length ?? 0
                        const hasVideo = !!post.images?.some(isVideoUrl)
                        return (
                          <BoardListItem
                            key={post.id}
                            href={`/board/${post.id}`}
                            title={post.title}
                            authorName={post.author_name}
                            createdAt={post.created_at ?? ""}
                            views={post.view_count ?? 0}
                            commentCount={post.comment_count ?? 0}
                            thumbnailUrl={thumbnail}
                            imagesCount={imagesCount}
                            hasVideo={hasVideo}
                            isPinned={post.is_pinned ?? false}
                            region={(post as any).region ?? null}
                          />
                        )
                      })}
                    </div>
                    {boardHasMore && (
                      <div className="flex justify-center py-6">
                        <button
                          onClick={loadMorePosts}
                          disabled={boardLoadingMore}
                          className="px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {boardLoadingMore ? "불러오는 중..." : "더 보기"}
                        </button>
                      </div>
                    )}
                    </>
                  )}
                </div>
              </div>
            </main>
          </>
        )
      })()}

      <BottomNav />
    </div>
  )
}

export default function BoardPageClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <BoardPageContent />
    </Suspense>
  )
}
