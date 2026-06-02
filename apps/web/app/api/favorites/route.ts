import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { notify, getNickname, preview } from "@/lib/services/notifications"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { apiAuthRequired } from "@/lib/api-helpers"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await apiAuthRequired(request)
  if (auth.error) return auth.error
  const { supabase, user, tokenSource } = auth

  const plaza = await getCurrentPlaza()

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // 도배·알림폭탄 방어 — 사용자당 1분 30회
  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }
  const { propertyId } = body as { propertyId?: string }

  if (!propertyId) {
    return NextResponse.json({ error: "매물 ID가 필요합니다" }, { status: 400 })
  }

  // 매물의 광장 검증 — 다른 광장 매물은 찜 불가
  if (plaza) {
    const { data: prop } = await supabase
      .from("properties")
      .select("plaza_id")
      .eq("id", propertyId)
      .maybeSingle()
    if (!prop || (prop.plaza_id && prop.plaza_id !== plaza)) {
      return NextResponse.json({ error: "매물을 찾을 수 없습니다" }, { status: 404 })
    }
  }

  // Bearer 모바일 경로는 anon 이라 RLS 차단 → admin 으로 우회 (웹 쿠키 세션은 user client 유지)
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try {
      writer = createAdminClient()
    } catch (e) {
      console.warn("[favorites] admin client unavailable, falling back", e)
    }
  }

  // 이미 찜했는지 확인 (현재 광장 안에서만)
  let existQ: any = writer
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("property_id", propertyId)
  if (plaza) existQ = existQ.eq("plaza_id", plaza)
  const { data: existing } = await existQ.maybeSingle()

  if (existing) {
    // 찜 취소
    let delQ: any = writer
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("property_id", propertyId)
    if (plaza) delQ = delQ.eq("plaza_id", plaza)
    const { error } = await delQ

    if (error) {
      return NextResponse.json({ error: "찜 취소에 실패했습니다" }, { status: 500 })
    }
    return NextResponse.json({ isLiked: false, message: "찜이 취소되었습니다" })
  } else {
    // 찜 추가
    const { error } = await writer
      .from("favorites")
      .insert({
        user_id: user.id,
        property_id: propertyId,
        ...(plaza ? { plaza_id: plaza } : {}),
      })

    if (error) {
      return NextResponse.json({ error: "찜 추가에 실패했습니다" }, { status: 500 })
    }

    // 매물 소유자에게 찜 알림
    try {
      const admin = createAdminClient()
      const { data: property } = await admin
        .from("properties")
        .select("id, title, user_id, images")
        .eq("id", propertyId)
        .maybeSingle()
      if (property?.user_id && property.user_id !== user.id) {
        const nickname = await getNickname(admin, user.id)
        const thumb = Array.isArray(property.images) && property.images.length > 0
          ? String(property.images[0])
          : null
        await notify(
          admin,
          {
            user_id: property.user_id,
            type: "favorite",
            title: "매물을 찜했습니다",
            message: `${nickname}님이 '${preview(property.title, 20)}' 매물을 찜했습니다`,
            link: `/property/${propertyId}`,
            property_id: propertyId,
            thumbnail_url: thumb,
          },
          user.id,
        )
      }
    } catch (notifyErr) {
      console.error("[favorites] notify error (non-fatal):", notifyErr)
    }

    return NextResponse.json({ isLiked: true, message: "찜 목록에 추가되었습니다" })
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  const { user } = await getAuthedUser(supabase, request)

  if (!user) {
    return NextResponse.json({ favorites: [] })
  }

  let q: any = supabase
    .from("favorites")
    .select("property_id")
    .eq("user_id", user.id)
    .limit(500)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: favorites } = await q

  return NextResponse.json({
    favorites: favorites?.map((f: any) => f.property_id) ?? []
  })
}
