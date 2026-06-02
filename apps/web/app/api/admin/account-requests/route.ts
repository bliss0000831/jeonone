import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { notify } from "@/lib/services/notifications"
import { checkAdminAuth, canAccessPlaza } from "@/lib/services/admin-auth"
import { enforceRateLimit } from "@/lib/services/ratelimit"

const TYPE_LABEL: Record<string, string> = {
  agent: "공인중개사",
  business: "사장님",
  producer: "로컬푸드 생산자",
  interior: "인테리어",
  moving: "이사 전문가",
  cleaning: "청소 전문가",
  repair: "수리 전문가",
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다", status: 401 as const }
  // legacy + plaza_admins 둘 다 인식
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return { error: "관리자 권한이 필요합니다", status: 403 as const }
  }
  return { supabase, user, auth }
}

/** GET /api/admin/account-requests?status=pending&type=agent */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase, user, auth: adminAuth } = auth
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")       // pending | approved | rejected | cancelled | all
  const type = searchParams.get("type")           // agent | business | ...

  let q = (supabase as any)
    .from("account_type_requests")
    .select(
      "id, user_id, plaza_id, status, requested_type, previous_type, business_name, business_number, registration_number, office_address, contact_phone, intro, business_cert_urls, license_urls, admin_note, reviewed_at, reviewed_by, submitted_at, profiles:user_id(id, nickname, avatar_url, email)",
    )
    .order("submitted_at", { ascending: false })
    .limit(200)

  // legacy super 가 아니면 자기 광장 신청만 노출
  if (!adminAuth.isLegacySuper && adminAuth.plazaIds.length > 0) {
    q = q.in('plaza_id', adminAuth.plazaIds)
  }

  if (status && status !== "all") q = q.eq("status", status)
  if (type) q = q.eq("requested_type", type)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  return NextResponse.json({ requests: data || [] })
}

/** PATCH /api/admin/account-requests  { id, action: "approve" | "reject", admin_note? } */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase, user, auth: adminAuth } = auth
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const { id, action, admin_note } = body ?? {}

  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "id와 action(approve|reject)이 필요합니다" }, { status: 400 })
  }
  const nextStatus = action === "approve" ? "approved" : "rejected"

  // ── Cross-plaza 보호: 대상 신청 광장이 admin 권한 범위 안인지 검증
  const { data: target } = await (supabase as any)
    .from("account_type_requests")
    .select("id, plaza_id, status")
    .eq("id", id)
    .maybeSingle()
  if (!target) {
    return NextResponse.json({ error: "신청을 찾을 수 없습니다" }, { status: 404 })
  }
  if (!adminAuth.isLegacySuper && !canAccessPlaza(adminAuth, (target as any).plaza_id ?? null)) {
    return NextResponse.json(
      { error: "다른 광장의 신청은 처리할 수 없습니다" },
      { status: 403 },
    )
  }

  // 트랜잭션은 지원 불가 → 업데이트 후 알림 발송. 트리거가 profiles.account_type 업데이트 처리.
  const { data: updated, error } = await (supabase as any)
    .from("account_type_requests")
    .update({
      status: nextStatus,
      admin_note: admin_note?.toString().trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  if (!updated) return NextResponse.json({ error: "신청을 찾을 수 없습니다" }, { status: 404 })

  // ── 승인 시 사업자 인증 플래그 활성화 ──
  if (nextStatus === "approved") {
    await (supabase as any)
      .from("profiles")
      .update({ is_verified_business: true })
      .eq("id", updated.user_id)
  }

  // ── plaza_profiles.account_type 동기화 ──
  // DB 트리거는 profiles.account_type 만 업데이트하므로
  // plaza_profiles.account_type 도 명시적으로 업데이트한다.
  if (nextStatus === "approved" && updated.plaza_id) {
    // Upsert: plaza_profiles 행이 없을 수 있으므로 먼저 존재 확인 후 처리
    const { data: existingProfile } = await (supabase as any)
      .from("plaza_profiles")
      .select("user_id")
      .eq("user_id", updated.user_id)
      .eq("plaza_id", updated.plaza_id)
      .maybeSingle()

    let profileUpdateError: any = null
    if (existingProfile) {
      const { error: updateErr } = await (supabase as any)
        .from("plaza_profiles")
        .update({ account_type: updated.requested_type })
        .eq("user_id", updated.user_id)
        .eq("plaza_id", updated.plaza_id)
      profileUpdateError = updateErr
    } else {
      // plaza_profiles 행이 없으면 upsert 로 생성
      const { error: upsertErr } = await (supabase as any)
        .from("plaza_profiles")
        .upsert(
          {
            user_id: updated.user_id,
            plaza_id: updated.plaza_id,
            account_type: updated.requested_type,
          },
          { onConflict: "user_id,plaza_id" },
        )
      profileUpdateError = upsertErr
    }

    if (profileUpdateError) {
      // account_type_requests 는 이미 approved 상태이므로 롤백하지 않지만
      // 관리자에게 경고를 반환하여 수동 확인을 유도한다.
      console.warn(
        `[account-requests] plaza_profiles.account_type 동기화 실패 — ` +
        `user_id=${updated.user_id}, plaza_id=${updated.plaza_id}, ` +
        `error=${profileUpdateError.message ?? JSON.stringify(profileUpdateError)}`,
      )
      // 응답에 경고 포함 (승인 자체는 성공)
      return NextResponse.json({
        request: updated,
        warning: "승인은 완료되었으나 plaza_profiles 동기화에 실패했습니다. 수동 확인이 필요합니다.",
      })
    }
  } else if (nextStatus === "rejected") {
    // 반려 시: plaza_profiles 의 account_type 을 이전 값('user')으로 되돌릴 필요는 없음
    // (신청은 미래형이고, 현재 account_type 은 이미 반영되지 않은 상태)
  }

  // 알림 발송
  const typeLabel = TYPE_LABEL[updated.requested_type] || updated.requested_type
  const prev = (updated.previous_type || "").toLowerCase()
  const REGULAR = new Set(["", "user", "individual"])
  const isChange = !!prev && !REGULAR.has(prev)
  const prevLabel = TYPE_LABEL[prev] || "일반"
  const kindWord = isChange ? "유형 변경" : "계정"

  if (action === "approve") {
    await notify(
      supabase,
      {
        user_id: updated.user_id,
        type: "account_type_review",
        title: isChange
          ? `🎉 ${prevLabel} → ${typeLabel} 유형 변경이 승인되었습니다`
          : `🎉 ${typeLabel} 계정이 승인되었습니다`,
        message: "이제 해당 카테고리의 등록·운영 기능을 사용하실 수 있습니다.",
        link: "/mypage",
      },
      user.id,
    )
  } else {
    await notify(
      supabase,
      {
        user_id: updated.user_id,
        type: "account_type_review",
        title: `${typeLabel} ${kindWord} 신청이 반려되었습니다`,
        message: admin_note?.toString().trim()
          ? `사유: ${admin_note}`
          : "서류를 확인 후 다시 신청해 주세요.",
        link: "/mypage/account-upgrade",
      },
      user.id,
    )
  }

  return NextResponse.json({ request: updated })
}
