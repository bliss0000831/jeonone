import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from '@/lib/plaza/server'
import { checkAdminAuth } from '@/lib/services/admin-auth'

/**
 * 관리자 대시보드 통계 API.
 *
 * 이전엔 클라이언트(/admin/page.tsx)에서 Supabase 30번 직접 호출 + 60초 폴링.
 * 이 라우트로 통합하면서:
 * - 모든 쿼리를 서버에서 병렬 처리 (라운드트립 30→1)
 * - 권한 체크 1회만
 * - revalidate=60 으로 같은 분 안 재호출 시 캐시 재사용
 * - 7일 추이는 row 들고와서 JS 집계 (Phase 3 에서 SQL aggregation 으로 개선 예정)
 *
 * 2026-04 audit, Phase 1.
 */
// 광장별 격리 필터를 host 헤더로 결정하므로 정적 캐시 금지
export const dynamic = 'force-dynamic'

type SafeQ = Promise<{ count: number | null; error: any } | { data: any; error: any }>

async function safeCount(p: SafeQ): Promise<number> {
  try {
    const r: any = await p
    if (r?.error) return 0
    return r?.count || 0
  } catch {
    return 0
  }
}

async function safeData<T>(p: SafeQ, fallback: T[]): Promise<T[]> {
  try {
    const r: any = await p
    if (r?.error || !r?.data) return fallback
    return r.data as T[]
  } catch {
    return fallback
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  // 권한 체크
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  // 통합 권한 체크 (legacy role + plaza_admins 동시) — 한 번에 두 쿼리 병렬
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  // 광장별 격리 필터 헬퍼 (현재 광장이 있을 때만 적용)
  const withPlaza = (q: any) => (plaza ? q.eq('plaza_id', plaza) : q)

  // ── 회원은 통합 로그인이므로 광장 격리하지 않음 (전체 플랫폼 기준)
  const accountTypeQuery = (type: string) =>
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('account_type', type)

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const yesterdayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  ).toISOString()
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // === 2-phase 병렬 쿼리: 핵심 통계 → billing 통계 ===
  // P2: 33개 동시 쿼리 → connection pool 부하 분산 (27 + 6)
  const [
    memberCount,
    agentCount,
    businessCount,
    interiorCount,
    movingCount,
    cleaningCount,
    repairCount,
    newMemberCount,
    propertyTotal,
    propertyActive,
    propertyHidden,
    sharingTotal,
    sharingActive,
    groupBuyingTotal,
    localFoodTotal,
    newStoreTotal,
    clubCount,
    currentVisitors,
    todayVisitors,
    yesterdayVisitors,
    totalVisitors,
    postsTotal,
    postsToday,
    commentsTotal,
    verificationsPending,
    reportsPending,
    inquiriesPending,
    boostTotal,
    boostActive,
    localFoodOrderTotal,
    localFoodOrderToday,
    groupBuyingOrderTotal,
    refundPending,
  ] = await Promise.all([
    // 회원 수 — 통합 로그인이므로 광장 격리 없이 전체 조회
    safeCount(supabase.from('profiles').select('*', { count: 'exact', head: true }) as any),
    // account_type 별 카운트 — 전체 플랫폼 기준
    safeCount(accountTypeQuery('agent') as any),
    safeCount(accountTypeQuery('business') as any),
    safeCount(accountTypeQuery('interior') as any),
    safeCount(accountTypeQuery('moving') as any),
    safeCount(accountTypeQuery('cleaning') as any),
    safeCount(accountTypeQuery('repair') as any),
    // 신규 회원 (오늘) — 전체 플랫폼 기준
    safeCount(
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart) as any,
    ),
    safeCount(withPlaza(supabase.from('properties').select('*', { count: 'exact', head: true })) as any),
    safeCount(
      withPlaza(
        supabase
          .from('properties')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active'),
      ) as any,
    ),
    safeCount(
      withPlaza(
        supabase
          .from('properties')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'hidden'),
      ) as any,
    ),
    safeCount(withPlaza(supabase.from('sharing_posts').select('*', { count: 'exact', head: true })) as any),
    safeCount(
      withPlaza(
        supabase
          .from('sharing_posts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'available'),
      ) as any,
    ),
    safeCount(
      withPlaza(supabase.from('group_buying_posts').select('*', { count: 'exact', head: true })) as any,
    ),
    safeCount(withPlaza(supabase.from('local_food').select('*', { count: 'exact', head: true })) as any),
    safeCount(withPlaza(supabase.from('new_store_posts').select('*', { count: 'exact', head: true })) as any),
    safeCount(withPlaza(supabase.from('clubs').select('*', { count: 'exact', head: true })) as any),
    safeCount(
      withPlaza(
        supabase
          .from('visitor_logs')
          .select('*', { count: 'exact', head: true })
          .gte('visited_at', fiveMinutesAgo),
      ) as any,
    ),
    safeCount(
      withPlaza(
        supabase
          .from('visitor_logs')
          .select('*', { count: 'exact', head: true })
          .gte('visited_at', todayStart),
      ) as any,
    ),
    safeCount(
      withPlaza(
        supabase
          .from('visitor_logs')
          .select('*', { count: 'exact', head: true })
          .gte('visited_at', yesterdayStart)
          .lt('visited_at', todayStart),
      ) as any,
    ),
    safeCount(withPlaza(supabase.from('visitor_logs').select('*', { count: 'exact', head: true })) as any),
    safeCount(withPlaza(supabase.from('board_posts').select('*', { count: 'exact', head: true })) as any),
    safeCount(
      withPlaza(
        supabase
          .from('board_posts')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayStart),
      ) as any,
    ),
    safeCount(withPlaza(supabase.from('board_comments').select('*', { count: 'exact', head: true })) as any),
    // 인증 요청 대기 — 광장별 격리 (plaza_id 컬럼 사용, 없으면 전체)
    safeCount(
      withPlaza(
        supabase
          .from('account_type_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ) as any,
    ),
    // 미처리 신고 건수
    safeCount(
      withPlaza(
        supabase
          .from('post_reports')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ) as any,
    ),
    // 미답변 문의 건수
    safeCount(
      withPlaza(
        supabase
          .from('support_inquiries')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ) as any,
    ),
    // ── 결제/부스트 통계 ──
    // 부스트 전체 건수
    safeCount(
      withPlaza(supabase.from('boost_orders').select('*', { count: 'exact', head: true })) as any,
    ),
    // 부스트 활성 건수
    safeCount(
      withPlaza(
        supabase
          .from('boost_orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active'),
      ) as any,
    ),
    // 로컬푸드 주문 건수
    safeCount(
      withPlaza(supabase.from('local_food_orders').select('*', { count: 'exact', head: true })) as any,
    ),
    // 로컬푸드 오늘 주문
    safeCount(
      withPlaza(
        supabase
          .from('local_food_orders')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayStart),
      ) as any,
    ),
    // 공구 주문 건수
    safeCount(
      withPlaza(supabase.from('group_buying_orders').select('*', { count: 'exact', head: true })) as any,
    ),
    // 환불 요청 대기 건수
    safeCount(
      withPlaza(
        supabase
          .from('local_food_orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'refund_requested'),
      ) as any,
    ),
  ])

  // === 게시판별 카운트 (5개 head-count 병렬) ===
  // Promise.all 로 라운드트립 최대 1회분 시간만 소요. count exact head:true 라
  // row 전송 없음. (category_id, created_at) 인덱스가 있으면 index-only scan.
  // 진짜 통합하려면 RPC 가 필요하지만 테이블 row 다 끌어오는 건 더 나쁨.
  const boardSlugs = ['free', 'restaurant', 'living', 'daily', 'qna'] as const
  const boardCounts: Record<(typeof boardSlugs)[number], number> = {
    free: 0,
    restaurant: 0,
    living: 0,
    daily: 0,
    qna: 0,
  }
  try {
    let catQ: any = supabase
      .from('board_categories')
      .select('id, slug')
      .in('slug', boardSlugs as unknown as string[])
    if (plaza) catQ = catQ.eq('plaza_id', plaza)
    const { data: cats } = await catQ
    if (cats && cats.length > 0) {
      await Promise.all(
        boardSlugs.map(async (slug) => {
          const cat = cats.find((c: any) => c.slug === slug)
          if (!cat) return
          boardCounts[slug] = await safeCount(
            withPlaza(
              supabase
                .from('board_posts')
                .select('*', { count: 'exact', head: true })
                .eq('category_id', cat.id),
            ) as any,
          )
        }),
      )
    }
  } catch {}

  // === 7일 방문자 추이 ===
  // 7개 head-count 쿼리 병렬 — raw row fetch 제거 (CRITICAL perf fix)
  const last7: { date: string; count: number }[] = []
  try {
    const dayBoundaries: { key: string; gte: string; lt: string }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
      dayBoundaries.push({ key, gte: dayStart, lt: dayEnd })
    }
    const dayCounts = await Promise.all(
      dayBoundaries.map(({ gte, lt }) => {
        let vq: any = supabase
          .from('visitor_logs')
          .select('*', { count: 'exact', head: true })
          .gte('visited_at', gte)
          .lt('visited_at', lt)
        if (plaza) vq = vq.eq('plaza_id', plaza)
        return safeCount(vq as any)
      }),
    )
    dayBoundaries.forEach(({ key }, idx) => last7.push({ date: key, count: dayCounts[idx] }))
  } catch {}

  // === 최근 활동 리스트 (4종) ===
  // 회원은 통합 로그인이므로 광장 격리 없이 전체 최근 가입 조회
  let recentMembersData: any[] = []
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, account_type, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    recentMembersData = data || []
  } catch {}

  const [properties, posts, verifications, recentReports, recentInquiries] = await Promise.all([
    safeData<any>(
      withPlaza(
        supabase
          .from('properties')
          .select('id, title, price, status, created_at, views')
          .order('created_at', { ascending: false })
          .limit(5),
      ) as any,
      [],
    ),
    safeData<any>(
      withPlaza(
        supabase
          .from('board_posts')
          .select('id, title, author_name, comment_count, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ) as any,
      [],
    ),
    // 인증 요청 목록 — 광장별 격리 (account_type_requests 사용)
    safeData<any>(
      withPlaza(
        supabase
          .from('account_type_requests')
          .select('id, requested_type, business_name, user_id, submitted_at')
          .eq('status', 'pending')
          .order('submitted_at', { ascending: false })
          .limit(5),
      ) as any,
      [],
    ),
    // 최근 신고
    safeData<any>(
      withPlaza(
        supabase
          .from('post_reports')
          .select('id, target_type, reason, status, created_at, target_id')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5),
      ) as any,
      [],
    ),
    // 최근 문의
    safeData<any>(
      withPlaza(
        supabase
          .from('support_inquiries')
          .select('id, subject, category, status, name, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5),
      ) as any,
      [],
    ),
  ])
  const members = recentMembersData

  return NextResponse.json({
    stats: {
      members: {
        total: memberCount,
        new: newMemberCount,
        agents: agentCount,
        business: businessCount,
        experts: interiorCount + movingCount + cleaningCount + repairCount,
      },
      properties: {
        total: propertyTotal,
        active: propertyActive,
        hidden: propertyHidden,
      },
      sharing: { total: sharingTotal, active: sharingActive },
      groupBuying: { total: groupBuyingTotal },
      localFood: { total: localFoodTotal },
      newStore: { total: newStoreTotal },
      clubs: { total: clubCount },
      boards: boardCounts,
      visitors: {
        current: currentVisitors,
        today: todayVisitors,
        yesterday: yesterdayVisitors,
        max: Math.max(todayVisitors, yesterdayVisitors, ...last7.map((d) => d.count)),
        total: totalVisitors,
        last7,
      },
      posts: { total: postsTotal, today: postsToday },
      comments: { total: commentsTotal },
      verifications: { pending: verificationsPending },
      reports: { pending: reportsPending },
      inquiries: { pending: inquiriesPending },
      billing: {
        boosts: { total: boostTotal, active: boostActive },
        localFoodOrders: { total: localFoodOrderTotal, today: localFoodOrderToday },
        groupBuyingOrders: { total: groupBuyingOrderTotal },
        refundsPending: refundPending,
      },
    },
    recent: {
      members,
      properties,
      posts,
      verifications,
      reports: recentReports,
      inquiries: recentInquiries,
    },
    generatedAt: new Date().toISOString(),
  })
}
