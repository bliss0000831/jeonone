import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { HomePage } from "@/components/home-page"
import { dbToProperty, DbProperty } from "@/types/app"
import { getHeroBanners } from "@gwangjang/api-client/hero-banners"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { plazaCityName } from "@/lib/plaza/city-name"
import { HubLanding } from "@/components/hub-landing"

export async function generateMetadata(): Promise<Metadata> {
  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return {
      title: "광장 — 더 나은 집, 더 가까운 이웃",
      description: "우리 동네 부동산, 게시판, 공동구매, 나눔, 모임을 한곳에서.",
      openGraph: { title: "광장", description: "더 나은 집, 더 가까운 이웃", type: "website", locale: "ko_KR" },
    }
  }
  const supabase = await createClient()
  const { data } = await supabase.from("plazas").select("name").eq("id", plaza).single()
  const cityName = data?.name ? plazaCityName(data.name) : "광장"
  const title = `${cityName} 광장 — 부동산·게시판·공동구매·나눔·모임`
  const description = `${cityName} 주민을 위한 지역 커뮤니티. 부동산 매물, 게시판, 공동구매, 나눔, 모임, 구인구직 정보.`
  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ko_KR" },
  }
}

// 멀티-광장: hub vs plaza 분기가 host 헤더에 의존하므로 정적 캐시 금지.
// (ISR 60초 캐시를 켜면 첫 방문자가 hub 면 그 캐시가 광장 도메인에도 새어나감)
export const dynamic = 'force-dynamic'

// Vercel 서버 함수 리전을 Supabase(ap-northeast-2, 서울)에 맞춤
export const preferredRegion = ['icn1']

export default async function Page() {
  // 멀티-광장 분기: 허브 도메인이면 전국 광장 지도, 광장 서브도메인이면 그 광장 홈
  const plaza = await getCurrentPlaza()

  if (!plaza) {
    // gwangjang.app / gwangjang.kr → 허브
    const supabase = await createClient()

    // ── plazas + hub_background 병렬 조회 (이전엔 순차 → 1 RTT 절감)
    const [plazasFull, bgRes] = await Promise.all([
      supabase
        .from('plazas')
        .select('id, name, parent_region, center_lat, center_lng, is_active, is_open_soon, sort_order, coverage')
        .order('sort_order', { ascending: true }),
      supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'hub_background')
        .maybeSingle(),
    ])

    // coverage 컬럼이 production 에 없을 수 있어서 실패하면 coverage 빼고 재시도
    let plazasData: any[] | null = null
    if (plazasFull.error) {
      console.error('[hub] plazas SELECT (with coverage) failed:', plazasFull.error.message)
      const lite = await supabase
        .from('plazas')
        .select('id, name, parent_region, center_lat, center_lng, is_active, is_open_soon, sort_order')
        .order('sort_order', { ascending: true })
      if (lite.error) {
        console.error('[hub] plazas SELECT (lite) also failed:', lite.error.message)
      }
      plazasData = (lite.data || []).map((p: any) => ({ ...p, coverage: [] }))
    } else {
      plazasData = plazasFull.data || []
    }

    let hubBackground: any = null
    if (bgRes?.data?.value) {
      const v = bgRes.data.value as any
      hubBackground = typeof v === 'string' ? JSON.parse(v) : v
    }

    // 오픈된 광장의 최근 게시글 — plazasData 의존이라 순차 실행 (이건 어쩔 수 없음)
    let liveActivities: any[] = []
    try {
      const openPlazaIds = (plazasData ?? [])
        .filter((p: any) => p.is_active)
        .map((p: any) => p.id)
      if (openPlazaIds.length > 0) {
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: posts } = await supabase
          .from('board_posts')
          .select('id, title, plaza_id, author_id, created_at, profiles:author_id(nickname)')
          .in('plaza_id', openPlazaIds)
          .eq('status', 'published')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(30)

        const plazaNameMap = new Map<string, string>(
          (plazasData ?? []).map((p: any) => [p.id, p.name]),
        )
        liveActivities = (posts || []).map((p: any) => ({
          plaza_id: p.plaza_id,
          plaza_name: plazaNameMap.get(p.plaza_id) ?? '광장',
          author_nickname: p.profiles?.nickname ?? '이웃',
          title: p.title,
          created_at: p.created_at,
        }))
      }
    } catch (e) {
      console.warn('[hub] live activities fetch failed:', e)
    }

    return (
      <HubLanding
        plazas={plazasData ?? []}
        background={hubBackground}
        liveActivities={liveActivities}
      />
    )
  }

  // 광장 진입 — 기존 홈페이지 흐름 (단, 모든 쿼리에 plaza_id 필터)
  const supabase = await createClient()

  // 광장 이름 fetch를 main Promise.all 에 합산 — 순차 RTT 제거
  const [userRes, propertiesRes, plazaRow] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("properties")
      .select(
        `*, profiles:user_id (id, nickname, phone, avatar_url, account_type),
         favorite_count:favorites(count)`
      )
      .eq("status", "active")
      .eq("plaza_id", plaza)
      .order("effective_at", { ascending: false })
      .limit(30),
    supabase
      .from('plazas')
      .select('name')
      .eq('id', plaza)
      .single(),
  ])

  const user = userRes.data.user
  const properties = (propertiesRes.data ?? []) as any[]

  const cityName = (plazaRow?.data?.name || '').replace(/광장$/, '') || null

  // banners(cityName 의존) 와 favorites(user 의존) 를 병렬 실행 — 1 RTT 절감
  const [banners, { data: favs }] = await Promise.all([
    getHeroBanners(supabase, plaza, cityName),
    user
      ? supabase
          .from("favorites")
          .select("property_id")
          .eq("user_id", user.id)
      : Promise.resolve({ data: null }),
  ])
  const userFavorites: string[] = (favs ?? []).map((f: any) => f.property_id)

  const converted = properties.map((p) =>
    dbToProperty(
      p as DbProperty,
      p.favorite_count?.[0]?.count ?? 0,
      userFavorites.includes(p.id)
    )
  )

  // ── SSR: 홈 섹션 11개 테이블 병렬 fetch — 첫 페인트에 콘텐츠 포함 (SEO + 로딩 개선)
  const withPlaza = (q: any) => q.eq('plaza_id', plaza)
  const makeServiceQ = (table: string) =>
    withPlaza((supabase as any).from(table).select('*').eq('status', 'active'))
      .order('effective_at', { ascending: false })
      .limit(8)

  // 개별 catch — 1개 테이블 실패해도 나머지 정상 표시 (홈 전체 크래시 방지)
  const safe = (q: any) => q.then((r: any) => r).catch(() => ({ data: [] }))
  const [
    interiorRes, movingRes, cleaningRes, repairRes,
    sharingRes, gbRes, newStoreRes, localFoodRes, clubsRes, secondhandRes, jobsRes,
  ] = await Promise.all([
    safe(makeServiceQ('interior_posts')),
    safe(makeServiceQ('moving_posts')),
    safe(makeServiceQ('cleaning_posts')),
    safe(makeServiceQ('repair_posts')),
    safe(withPlaza(supabase.from('sharing_posts').select('*').eq('status', 'active'))
      .order('likes', { ascending: false }).order('created_at', { ascending: false }).limit(4)),
    safe(withPlaza(supabase.from('group_buying_posts').select('*').eq('status', 'recruiting'))
      .order('effective_at', { ascending: false }).limit(20)),
    safe(withPlaza(supabase.from('new_store_posts').select('*').eq('status', 'active'))
      .order('likes', { ascending: false }).order('effective_at', { ascending: false }).limit(4)),
    safe(withPlaza(supabase.from('local_food').select('*, author:profiles!user_id(id, nickname, avatar_url)').eq('status', 'available'))
      .order('effective_at', { ascending: false }).limit(4)),
    safe(withPlaza(supabase.from('clubs').select('*').eq('status', 'recruiting'))
      .order('created_at', { ascending: false }).limit(4)),
    safe(withPlaza(supabase.from('secondhand_posts').select('*').eq('status', 'active'))
      .order('effective_at', { ascending: false }).limit(4)),
    safe(withPlaza(supabase.from('jobs_posts').select('*').eq('status', 'active'))
      .order('effective_at', { ascending: false }).limit(4)),
  ])

  const initialData = {
    interiorPosts: interiorRes.data ?? [],
    movingPosts: movingRes.data ?? [],
    cleaningPosts: cleaningRes.data ?? [],
    repairPosts: repairRes.data ?? [],
    sharingPosts: sharingRes.data ?? [],
    groupBuyingPosts: gbRes.data ?? [],
    newStorePosts: newStoreRes.data ?? [],
    localFoodPosts: localFoodRes.data ?? [],
    clubPosts: clubsRes.data ?? [],
    secondhandPosts: secondhandRes.data ?? [],
    jobsPosts: jobsRes.data ?? [],
  }

  return <HomePage properties={converted} user={user} banners={banners} initialData={initialData} />
}
