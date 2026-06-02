import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextResponse, type NextRequest } from "next/server"
import { dbToProperty, DbProperty } from "@/types/app"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

/**
 * 월별 일반 사용자 매물 등록 한도 — agent 가 아닌 모든 계정에 적용.
 * agent 는 무제한 (직업이라 N개 등록 자연스러움).
 */
const MONTHLY_LIMIT_NON_AGENT = 2

export async function GET(request: NextRequest) {
  // IP 기반 rate limit — 비로그인 스크래핑 방어
  const limited = await enforceRateLimit(request, "search")
  if (limited) return limited

  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  // GET 은 비로그인 허용 — 쿠키에서 user 확인
  const { data: { user } } = await supabase.auth.getUser()

  // 매물 목록 — 안전하게 select('*') 사용 (컬럼명 오타 위험 회피)
  let propsQ: any = supabase
    .from("properties")
    .select("id, title, transaction_type, property_type, price, deposit, monthly_rent, area_sqm, address, dong, floor_info, images, effective_at, boosted_until, boost_score, status, user_id, plaza_id")
    .eq("status", "active")
    .order("effective_at", { ascending: false })
    .limit(200)
  // 광장 격리 필수 — plaza 미지정 시 전체 광장 데이터 노출 방지
  if (plaza) {
    propsQ = propsQ.eq("plaza_id", plaza)
  } else {
    return NextResponse.json({ error: "광장이 지정되지 않았습니다" }, { status: 400 })
  }
  const { data: properties, error } = await propsQ
  
  if (error) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 프로필 정보 별도로 가져오기
  const userIds = [...new Set((properties as any[] | null)?.map((p: any) => p.user_id) ?? [])]
  let profilesMap: Record<string, { id: string; nickname: string | null; phone: string | null; avatar_url: string | null; location: string | null }> = {}
  
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, phone, avatar_url, location")
      .in("id", userIds)
    
    profiles?.forEach(p => {
      profilesMap[p.id] = p
    })
  }

  // 찜 카운트 + 유저 찜 — 병렬 실행 (이전: 순차 2 RTT → 1 RTT)
  const propertyIds = (properties || []).map((p: any) => p.id)
  const favoriteCountMap: Record<string, number> = {}
  let userFavorites: string[] = []

  const favCountPromise = propertyIds.length > 0
    ? supabase.rpc('get_property_favorite_counts', {
        p_plaza_id: plaza ?? "",
        p_property_ids: propertyIds,
      })
    : Promise.resolve({ data: null })

  const userFavPromise = user
    ? (() => {
        let myFavQ: any = supabase
          .from("favorites")
          .select("property_id")
          .eq("user_id", user.id)
        if (plaza) myFavQ = myFavQ.eq("plaza_id", plaza)
        return myFavQ
      })()
    : Promise.resolve({ data: null })

  const [favCountRes, userFavRes] = await Promise.all([favCountPromise, userFavPromise])

  if (Array.isArray(favCountRes.data)) {
    for (const row of favCountRes.data as any[]) {
      favoriteCountMap[row.property_id] = Number(row.favorite_count ?? 0)
    }
  }
  userFavorites = userFavRes.data?.map((f: any) => f.property_id) ?? []

  // properties에 profiles 정보 매핑
  const propertiesWithProfiles = (properties as any[] | null)?.map((p: any) => ({
    ...p,
    profiles: profilesMap[p.user_id] || null,
  })) ?? []

  // DB 데이터를 UI 타입으로 변환
  const convertedProperties = (propertiesWithProfiles as DbProperty[]).map(p => 
    dbToProperty(p, favoriteCountMap[p.id] || 0, userFavorites.includes(p.id))
  )

  return NextResponse.json(
    { properties: convertedProperties },
    {
      // 사용자별 favorites 가 섞여있어 edge 공유 캐시는 안 됨 (private).
      // 대신 브라우저 캐시 10초 — 같은 페이지 내 빠른 네비게이션에서 재요청 안 함.
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
      },
    },
  )
}

/**
 * POST /api/properties — 매물 등록
 *
 * 보안·검증:
 *  1. 로그인 필수
 *  2. 광장 도메인에서만 (허브에선 차단)
 *  3. agent 가 아닌 사용자는 월 2건 한도
 *  4. seller_type 은 서버에서 결정 (클라이언트 위변조 차단)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // 광장 검증
  const plaza = await getCurrentPlaza()
  if (!plaza) {
    return NextResponse.json({ error: "광장 도메인에서 등록해주세요" }, { status: 400 })
  }

  // Rate limit (분 단위 도배 방어)
  const limited = await enforceRateLimit(request, "post", user.id)
  if (limited) return limited

  // 사용자 account_type 조회 — seller_type 결정 + 월 2건 제한 판단용
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, role")
    .eq("id", user.id)
    .maybeSingle()
  const accountType = profile?.account_type || null
  const isAgent = accountType === "agent"
  const isAdmin =
    profile?.role === "admin" || profile?.role === "superadmin"

  // ─── 월 2건 제한 — agent / admin 은 면제 ──────────────────────────────────
  if (!isAgent && !isAdmin) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const { count, error: cErr } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("plaza_id", plaza)
      .gte("created_at", startOfMonth.toISOString())
    if (cErr) {
      console.error("[properties POST] count error", cErr)
      return NextResponse.json({ error: "처리 실패" }, { status: 500 })
    }
    if ((count ?? 0) >= MONTHLY_LIMIT_NON_AGENT) {
      return NextResponse.json(
        {
          error: `일반 사용자는 한 달에 ${MONTHLY_LIMIT_NON_AGENT}건까지만 매물을 등록할 수 있습니다. 공인중개사 계정 인증 후 무제한 등록 가능합니다.`,
          code: "monthly_limit_exceeded",
          limit: MONTHLY_LIMIT_NON_AGENT,
          current: count,
        },
        { status: 403 },
      )
    }
  }

  // ─── 입력값 받기 ─────────────────────────────────────────────────────────
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })

  // 클라이언트에서 받지만 서버가 결정하는 필드는 무시
  // seller_type 은 서버에서 강제 결정
  const seller_type = isAgent ? "agent" : "individual"

  const insertRow: Record<string, any> = {
    user_id: user.id,
    plaza_id: plaza,
    seller_type,
    status: "active",
  }

  // 화이트리스트 필드만 인서트 (실제 DB 컬럼명과 일치)
  const allowedKeys = [
    "title",
    "property_type",
    "transaction_type",
    "price",
    "monthly_rent",
    "maintenance_fee",
    "area_sqm",
    "floor_info",
    "total_floors",
    "rooms",
    "bathrooms",
    "direction",
    "parking",
    "elevator",
    "pet_allowed",
    "move_in_date",
    "address",
    "address_detail",
    "lat",
    "lng",
    "description",
    "features",
    "images",
    "instagram_post_url",
    "youtube_post_url",
    "panorama_images",
    "sub_region",
  ]
  for (const k of allowedKeys) {
    if (k in body) insertRow[k] = body[k]
  }

  // 필수 필드 검증
  if (!insertRow.title || !insertRow.property_type || !insertRow.transaction_type) {
    return NextResponse.json(
      { error: "필수 정보가 누락되었습니다 (title/property_type/transaction_type)" },
      { status: 400 },
    )
  }

  // Bearer 토큰(모바일) → supabase 가 anonymous 실행 → RLS 차단
  let writer: any = supabase
  if (tokenSource === "bearer") {
    const { getAdminWriteClient } = await import("@/lib/services/admin-auth")
    const wc = await getAdminWriteClient()
    if (!wc) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 })
    }
    writer = wc
  }

  const { data, error } = await writer
    .from("properties")
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    // Postgres 에러는 컬럼/제약명 그대로 노출 — 서버 로그만, 클라엔 일반 메시지
    console.error("[properties POST] insert error", error)
    return NextResponse.json({ error: "매물 등록에 실패했습니다" }, { status: 500 })
  }

  return NextResponse.json({ property: data })
}
