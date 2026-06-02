import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const runtime = "nodejs"
// 페이지 히어로 이미지 — 거의 안 바뀜. CDN 1시간 캐시.
// POST 시 revalidatePath 로 무효화.
export const revalidate = 3600

/**
 * GET /api/page-heroes
 *   → 전체 히어로 이미지 맵 반환. 익명 허용.
 *   응답: { heroes: { [page_key]: image_url } }
 *
 * GET /api/page-heroes?key=secondhand
 *   → 단일 키 조회. { image_url: string | null }
 *
 * POST /api/page-heroes
 *   body: { page_key: string, image_url: string | null }
 *   → upsert. admin 전용 (RLS 로 보호).
 */

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const url = new URL(request.url)
  const key = url.searchParams.get("key")

  // CDN 캐시 헤더 — 1시간 신선, 24시간 stale 허용
  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  }

  if (key) {
    let q: any = supabase
      .from("page_heroes")
      .select("image_url")
      .eq("page_key", key)
    if (plaza) q = q.eq("plaza_id", plaza)
    const { data } = await q.maybeSingle()
    return NextResponse.json({ image_url: data?.image_url ?? null }, { headers: cacheHeaders })
  }

  let q: any = supabase
    .from("page_heroes")
    .select("page_key, image_url")
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data, error } = await q
  if (error) {
    // 테이블이 아직 없는 경우도 빈 맵으로 응답
    return NextResponse.json({ heroes: {} })
  }
  const heroes: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.image_url) heroes[row.page_key] = row.image_url
  }
  return NextResponse.json({ heroes }, { headers: cacheHeaders })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // admin 확인 — legacy + plaza_admins 통합
  const { checkAdminAuth, canAccessPlaza } = await import("@/lib/services/admin-auth")
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited
  const plazaForCheck = await getCurrentPlaza()
  if (!auth.isLegacySuper && !canAccessPlaza(auth, plazaForCheck)) {
    return NextResponse.json({ error: "이 광장의 권한이 없습니다" }, { status: 403 })
  }

  const body = await request.json()
  const page_key = typeof body.page_key === "string" ? body.page_key : null
  const image_url = typeof body.image_url === "string" ? body.image_url : null
  if (!page_key) return NextResponse.json({ error: "page_key required" }, { status: 400 })

  const plaza = await getCurrentPlaza()
  const { error } = await supabase
    .from("page_heroes")
    .upsert(
      {
        page_key,
        image_url,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
        ...(plaza ? { plaza_id: plaza } : {}),
      },
      // 광장별로 같은 page_key 가 존재할 수 있으므로 (plaza_id, page_key) 복합 onConflict
      { onConflict: plaza ? "plaza_id,page_key" : "page_key" },
    )

  if (error) {
    console.error("[page-heroes] upsert failed", error)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  // 캐시 무효화 — admin 저장 즉시 반영
  try { revalidatePath('/', 'layout') } catch {}
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // admin 가드 — POST 와 동일 (대칭)
  const { checkAdminAuth, canAccessPlaza } = await import("@/lib/services/admin-auth")
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited
  const plazaForCheck = await getCurrentPlaza()
  if (!auth.isLegacySuper && !canAccessPlaza(auth, plazaForCheck)) {
    return NextResponse.json({ error: "이 광장의 권한이 없습니다" }, { status: 403 })
  }

  const url = new URL(request.url)
  const key = url.searchParams.get("key")
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 })

  // image_url 만 비우기 (row 자체는 유지) → UI 에서 "기본 이미지로 되돌리기"
  const plaza = plazaForCheck
  const { error } = await supabase
    .from("page_heroes")
    .upsert(
      {
        page_key: key,
        image_url: null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
        ...(plaza ? { plaza_id: plaza } : {}),
      },
      { onConflict: plaza ? "plaza_id,page_key" : "page_key" },
    )
  if (error) {
    console.error("[page-heroes DELETE] failed:", error)
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
