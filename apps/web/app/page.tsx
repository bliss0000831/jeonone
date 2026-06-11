import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { FarmHome, type NoticeItem } from "@/components/farm-home"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { plazaCityName } from "@/lib/plaza/city-name"
import { HubLanding } from "@/components/hub-landing"

export async function generateMetadata(): Promise<Metadata> {
  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return {
      title: "전원일기 — 전국의 농촌을 잇는 플랫폼",
      description: "지역별 농기구 직거래·대여·경매, 로컬푸드, 품앗이, 이웃 커뮤니티를 한곳에서.",
      openGraph: { title: "전원일기", description: "전국의 농촌을 잇는 플랫폼", type: "website", locale: "ko_KR" },
    }
  }
  const supabase = await createClient()
  const { data } = await supabase.from("plazas").select("name").eq("id", plaza).single()
  const name = data?.name || "전원일기"
  const cityName = plazaCityName(name)
  const title = `${name} — 농기구 직거래·로컬푸드·마을 커뮤니티`
  const description = `${cityName} 농업인을 위한 농기구 직거래·대여·경매, 로컬푸드, 품앗이, 이웃 커뮤니티.`
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
  // 멀티-광장 분기: 허브 도메인이면 전국 전원일기 지도, 광장(도) 서브도메인이면 그 도 홈
  const plaza = await getCurrentPlaza()

  if (!plaza) {
    // 허브 (전국 전원일기 포털)
    const supabase = await createClient()

    // ── plazas + hub_background 병렬 조회
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

    // coverage 컬럼이 없을 수 있어서 실패하면 coverage 빼고 재시도
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

    // 광장별 통계: 회원수·오늘 글수·최근글 (목업 카드의 "142명 · 8 곳 활동중" 같은 실데이터)
    const memberCountByPlaza = new Map<string, number>()
    const postsTodayByPlaza = new Map<string, number>()
    const recentSnippetByPlaza = new Map<string, string>()
    let liveActivities: any[] = []
    try {
      const openPlazaIds = (plazasData ?? [])
        .filter((p: any) => p.is_active)
        .map((p: any) => p.id)

      // 회원수 — plaza_profiles (active) GROUP BY plaza_id
      const { data: memberRows } = await supabase
        .from('plaza_profiles')
        .select('plaza_id')
        .eq('is_active', true)
      for (const r of memberRows ?? []) {
        const pid = (r as any).plaza_id
        memberCountByPlaza.set(pid, (memberCountByPlaza.get(pid) ?? 0) + 1)
      }

      if (openPlazaIds.length > 0) {
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: posts } = await supabase
          .from('board_posts')
          .select('id, title, plaza_id, author_id, created_at, profiles:author_id(nickname)')
          .in('plaza_id', openPlazaIds)
          .eq('status', 'published')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(60)

        const plazaNameMap = new Map<string, string>(
          (plazasData ?? []).map((p: any) => [p.id, p.name]),
        )
        for (const p of (posts as any[] | null) ?? []) {
          postsTodayByPlaza.set(p.plaza_id, (postsTodayByPlaza.get(p.plaza_id) ?? 0) + 1)
          if (!recentSnippetByPlaza.has(p.plaza_id)) {
            recentSnippetByPlaza.set(p.plaza_id, p.title)
          }
        }
        liveActivities = ((posts as any[] | null) || []).map((p: any) => ({
          plaza_id: p.plaza_id,
          plaza_name: plazaNameMap.get(p.plaza_id) ?? '전원일기',
          author_nickname: p.profiles?.nickname ?? '이웃',
          title: p.title,
          created_at: p.created_at,
        }))
      }
    } catch (e) {
      console.warn('[hub] stats fetch failed:', e)
    }

    // plaza 객체에 통계 부착 (HubLanding 에서 카드 채울 용도)
    const enrichedPlazas = (plazasData ?? []).map((p: any) => ({
      ...p,
      member_count: memberCountByPlaza.get(p.id) ?? 0,
      posts_today: postsTodayByPlaza.get(p.id) ?? 0,
      recent_post_title: recentSnippetByPlaza.get(p.id) ?? null,
    }))

    return (
      <HubLanding
        plazas={enrichedPlazas}
        background={hubBackground}
        liveActivities={liveActivities}
      />
    )
  }

  // ── 광장(도) 진입 — 전원일기 농업 홈 ──────────────────────────────
  const supabase = await createClient()

  const [userRes, plazaRow, noticesRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('plazas').select('name').eq('id', plaza).single(),
    // 시군 필터는 클라(NoticeSection)에서 selectedRegion 기준으로 수행하므로
    // 충분히 받아와야 시군 공지가 최신 전체대상 공지에 밀려 누락되지 않음.
    supabase
      .from('notices')
      .select('id, title, created_at, region')
      .eq('is_published', true)
      .eq('plaza_id', plaza)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const user = userRes.data.user
  const plazaName = plazaRow?.data?.name || '전원일기'
  const plazaCity = plazaCityName(plazaName)

  const now = Date.now()
  const notices: NoticeItem[] = (noticesRes?.data ?? []).map((n: any) => ({
    id: n.id,
    title: n.title,
    created_at: n.created_at,
    region: n.region ?? null,
    is_new: n.created_at
      ? now - new Date(n.created_at).getTime() < 14 * 24 * 60 * 60 * 1000
      : false,
  }))

  return (
    <FarmHome
      user={user}
      plazaName={plazaName}
      plazaCity={plazaCity}
      notices={notices}
    />
  )
}
