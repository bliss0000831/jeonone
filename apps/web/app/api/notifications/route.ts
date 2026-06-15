import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

// 알림 목록 조회 — 광장별 격리
export async function GET(request: Request) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // bell 드롭다운: 20개면 충분 (최대 10개 노출 + "모든 알림 보기")
  // /notifications 페이지: ?full=1 로 50개
  const { searchParams } = new URL(request.url)
  const full = searchParams.get("full") === "1"
  const limit = full ? 50 : 20

  // Bearer 경로는 anon 으로 실행되어 RLS SELECT 차단 → admin 사용
  // (user.id 로 명시적으로 필터링하므로 본인 알림만 반환)
  let reader: any = supabase
  if (tokenSource === "bearer") {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      reader = createAdminClient()
    } catch (e) {
      console.warn("[notifications GET] admin client unavailable, falling back", e)
    }
  }

  let q: any = reader
    .from("notifications")
    .select("id, type, title, message, link, is_read, created_at, thumbnail_url, actor_id, property_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: notifications, error } = await q

  if (error) {
    console.error('[notifications]', error)
    return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
  }

  // 정확한 안읽음 총수 (목록 limit 와 무관) — 벨 뱃지가 20·50개에 갇히지 않도록
  let unreadQ: any = reader
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false)
  if (plaza) unreadQ = unreadQ.eq("plaza_id", plaza)
  const { count: unreadCount } = await unreadQ

  // 클라이언트 60초 polling — 브라우저 HTTP private cache 20초로 RTT 절감
  return NextResponse.json(notifications, {
    headers: {
      'Cache-Control': 'private, max-age=20',
      'X-Unread-Count': String(unreadCount ?? 0),
    },
  })
}

// 알림 생성 — 본인에게만 허용 (피싱·사칭 방어).
//   타인에게 알림 보내는 것은 server-side notify() 헬퍼 (admin client) 또는
//   /api/admin/notify 라우트 (관리자 권한) 만 가능.
//   link 는 내부 경로(`/...`)만 허용 — 외부 URL 사칭 차단.
export async function POST(request: Request) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { user_id, type, title, message, link, property_id, thumbnail_url, actor_id } = body

  // 본인에게만 알림 INSERT 허용
  if (user_id !== user.id) {
    return NextResponse.json(
      { error: "다른 사용자에게 알림을 보낼 수 없습니다" },
      { status: 403 },
    )
  }

  // link 화이트리스트: 내부 경로만 (`/...`) 또는 빈값
  if (link && (typeof link !== "string" || !link.startsWith("/"))) {
    return NextResponse.json(
      { error: "link 는 내부 경로(`/...`)만 허용됩니다" },
      { status: 400 },
    )
  }

  // 길이 제한 — XSS/도배 방어
  if (typeof title === "string" && title.length > 200) {
    return NextResponse.json({ error: "title 너무 김" }, { status: 400 })
  }
  if (typeof message === "string" && message.length > 1000) {
    return NextResponse.json({ error: "message 너무 김" }, { status: 400 })
  }

  // Bearer 경로는 anon 으로 실행되어 RLS INSERT 차단 → admin 사용 (본인 알림만 허용 가드 위에서 이미 통과).
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      writer = createAdminClient()
    } catch (e) {
      console.warn("[notifications POST] admin client unavailable, falling back", e)
    }
  }

  const { data, error } = await writer
    .from("notifications")
    .insert({
      user_id,
      type,
      title,
      message,
      link,
      property_id,
      thumbnail_url: thumbnail_url ?? null,
      actor_id: actor_id ?? null,
      ...(plaza ? { plaza_id: plaza } : {}),
    })
    .select()
    .single()

  if (error) {
    // 운영에선 raw error 노출 X
    console.error("[notifications POST]", error)
    return NextResponse.json({ error: "알림 생성 실패" }, { status: 500 })
  }

  return NextResponse.json(data)
}

// 알림 읽음 처리
//   - body 없음 또는 { all: true }  → 모든 알림
//   - { id: "..." } 또는 { ids: [...] } → 특정 알림만
export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    // body 없는 경우 = 전체 읽음 처리
  }

  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: any) => typeof x === "string")
    : body?.id
      ? [String(body.id)]
      : []

  // Bearer 모바일 경로: createServerClient 는 anon 이라 RLS update 차단 →
  // 호출자 신원을 이미 Bearer 로 검증했으므로 admin client 로 안전하게 수행.
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      writer = createAdminClient()
    } catch (e) {
      console.warn("[notifications PATCH] admin client unavailable, falling back", e)
    }
  }

  let query = writer
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false)

  if (ids.length > 0) {
    query = query.in("id", ids)
  }

  const { error } = await query
  if (error) {
    console.error('[notifications]', error)
    return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
