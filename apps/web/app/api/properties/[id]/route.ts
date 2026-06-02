import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { deleteR2Urls } from "@/lib/integrations/r2-cleanup"
import { prepareMutation, safeRevalidate, logAdminMutation } from "@/lib/api-helpers"

// 매물 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase.from("properties").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: property, error } = await q.maybeSingle()

  if (error) {
    console.error("[properties GET]", error)
    return NextResponse.json({ error: "매물을 불러올 수 없습니다" }, { status: 500 })
  }
  if (!property) {
    return NextResponse.json({ error: "매물을 찾을 수 없습니다" }, { status: 404 })
  }

  return NextResponse.json({ property })
}

// 매물 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const TABLE = "properties"
  const m = await prepareMutation(request, {
    table: TABLE,
    id,
    selectCols: "user_id, price, title, transaction_type, status, plaza_id",
  })
  if (m.error) return m.error
  const { writer, resource: property, isOwner, isAdmin, plaza } = m

  const oldPrice = property.price
  const body = await request.json()
  
  // 허용된 필드만 업데이트
  const allowedFields = [
    "title", "property_type", "transaction_type", "price", "monthly_rent",
    "maintenance_fee", "area_sqm", "floor_info", "total_floors", "rooms",
    "bathrooms", "direction", "parking", "elevator", "pet_allowed",
    "move_in_date", "address", "address_detail", "description", "features",
    "images", "status", "instagram_post_url", "youtube_post_url",
    "ai_video_url", "lat", "lng", "sub_region"
  ]

  // 관리자만 is_featured 설정 가능
  const adminOnlyFields = ["is_featured"]
  // owner 의 status 천이 화이트리스트 — hidden 은 moderation 결과라 owner 가 풀 수 없음
  const OWNER_STATUS_ALLOWED = new Set(["active", "reserved", "sold", "cancelled"])

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      // status: owner 는 화이트리스트 + hidden 복귀 차단, admin 은 자유
      if (key === "status" && !isAdmin) {
        if (property.status === "hidden") {
          return NextResponse.json(
            { error: "숨김 처리된 매물은 상태를 변경할 수 없습니다" },
            { status: 403 },
          )
        }
        if (!OWNER_STATUS_ALLOWED.has(String(body[key]))) {
          return NextResponse.json(
            { error: "허용되지 않은 상태 값입니다" },
            { status: 400 },
          )
        }
      }
      // lat/lng 범위 검증 — 잘못된 좌표로 DB 폴루션 방지
      if (key === 'lat') {
        const v = Number(body[key])
        if (!Number.isFinite(v) || v < -90 || v > 90) {
          return NextResponse.json({ error: 'lat 범위 오류' }, { status: 400 })
        }
        updateData.lat = v
        continue
      }
      if (key === 'lng') {
        const v = Number(body[key])
        if (!Number.isFinite(v) || v < -180 || v > 180) {
          return NextResponse.json({ error: 'lng 범위 오류' }, { status: 400 })
        }
        updateData.lng = v
        continue
      }
      updateData[key] = body[key]
    }
  }
  
  // 관리자만 is_featured 설정 가능
  if (isAdmin) {
    for (const key of adminOnlyFields) {
      if (body[key] !== undefined) {
        updateData[key] = body[key]
      }
    }
  }

  let updQ: any = writer
    .from(TABLE)
    .update(updateData)
    .eq("id", id)
  if (plaza) updQ = updQ.eq("plaza_id", plaza)
  const { error, data } = await updQ.select()

  if (error) {
    console.error("[properties PATCH] update failed", { code: error.code })
    return NextResponse.json({ error: "매물 수정 실패" }, { status: 500 })
  }

  // 가격이 변경되었으면 찜한 사용자들에게 알림 전송
  // - body.price 는 클라이언트에서 string 또는 number 로 올 수 있어 Number() 로 정규화
  // - property.price(DB) 단위는 **만원** 이므로 formatPrice 도 만원 기준으로
  // - INSERT 는 **service role (admin)** 로 수행: 판매자 세션으로는 다른 사용자(찜한 유저) 의
  //   notifications row INSERT 가 RLS 에 막혀 조용히 실패하던 문제 해결
  const newPrice = body.price != null ? Number(body.price) : NaN
  const oldPriceNum = oldPrice != null ? Number(oldPrice) : NaN
  const priceChanged =
    Number.isFinite(newPrice) && Number.isFinite(oldPriceNum) && newPrice !== oldPriceNum
  if (priceChanged) {
    try {
      const admin = createAdminClient()
      let favsQ: any = admin
        .from("favorites")
        .select("user_id")
        .eq("property_id", id)
      if (plaza) favsQ = favsQ.eq("plaza_id", plaza)
      const { data: favorites, error: favErr } = await favsQ

      if (favErr) {
        console.error("[price_change] favorites 조회 실패:", favErr)
      } else if (favorites && favorites.length > 0) {
        // 단위: 만원. 10000만원 = 1억
        const formatPrice = (price: number) => {
          if (!Number.isFinite(price) || price <= 0) return "-"
          if (price >= 10000) {
            const uk = Math.floor(price / 10000)
            const man = price % 10000
            return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억`
          }
          return `${price.toLocaleString()}만원`
        }

        const priceChange = newPrice < oldPriceNum ? "인하" : "인상"
        // 매물 주소(찜 알림에 맥락 보강용)
        const { data: fullProperty } = await admin
          .from("properties")
          .select("address, address_detail, images")
          .eq("id", id)
          .single()
        const where = fullProperty?.address
          ? ` (${fullProperty.address}${fullProperty.address_detail ? " " + fullProperty.address_detail : ""})`
          : ""
        const propThumb =
          Array.isArray((fullProperty as any)?.images) && (fullProperty as any).images.length > 0
            ? String((fullProperty as any).images[0])
            : null

        const notifications = favorites.map((f: any) => ({
          user_id: f.user_id,
          type: "price_change" as const,
          title: `관심 매물 가격 ${priceChange}`,
          message: `${property.title || "매물"}${where} 가격이 ${formatPrice(oldPriceNum)} → ${formatPrice(newPrice)} (으)로 ${priceChange}되었습니다.`,
          link: `/property/${id}`,
          property_id: id,
          thumbnail_url: propThumb,
          ...(plaza ? { plaza_id: plaza } : {}),
        }))

        const { error: insErr } = await admin.from("notifications").insert(notifications)
        if (insErr) {
          console.error("[price_change] notifications insert 실패:", insErr)
        }
      }
    } catch (err) {
      console.error("[price_change] 알림 처리 중 예외:", err)
    }
  }

  // 관리자가 타인 글 수정 시 감사 로그
  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "update", TABLE, id, property)
  }

  await safeRevalidate(`/property/${id}`)
  return NextResponse.json({ success: true })
}

// 매물 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const TABLE = "properties"
  const m = await prepareMutation(request, {
    table: TABLE,
    id,
    selectCols: "user_id, plaza_id, images",
  })
  if (m.error) return m.error
  const { writer, resource: property, isOwner, isAdmin, plaza } = m

  const { error } = await writer
    .from(TABLE)
    .delete()
    .eq("id", id)

  if (error) {
    console.error("[properties DELETE] failed", { code: error.code })
    return NextResponse.json({ error: "매물 삭제 실패" }, { status: 500 })
  }

  // 관리자가 타인 글 삭제 시 감사 로그
  if (!isOwner && isAdmin) {
    void logAdminMutation(m.user.id, "delete", TABLE, id, property)
  }

  // 고아 데이터 정리 (실패해도 응답엔 영향 없음) — favorites, notifications, R2 파일
  try {
    const { createAdminClient: getAdmin } = await import("@/lib/supabase/admin")
    const admin = getAdmin()
    // 찜 + 알림 정리 (삭제된 매물 참조하는 레코드) — 병렬
    await Promise.all([
      admin.from("favorites").delete().eq("property_id", id),
      admin.from("notifications").delete().eq("property_id", id),
    ])
  } catch (cleanupErr) {
    console.warn("[properties DELETE] cleanup (non-fatal):", cleanupErr)
  }
  void deleteR2Urls(property.images as string[] | null)

  await safeRevalidate(`/property/${id}`)
  return NextResponse.json({ success: true })
}
