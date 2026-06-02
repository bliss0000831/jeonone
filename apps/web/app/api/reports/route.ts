import { createClient as createAdmin } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { AUTO_HIDE_REPORT_THRESHOLD } from "@/lib/services/moderation"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { apiAuthRequired } from "@/lib/api-helpers"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

const TARGET_TABLE: Record<string, string | null> = {
  secondhand: "secondhand_posts",
  jobs: "jobs_posts",
  sharing: "sharing_posts",
  clubs: "clubs",
  "new-store": "new_store_posts",
  board: "board_posts",
  property: "properties",
  group_buying: "group_buying_posts",
  local_food: "local_food",
  interior: "interior_posts",
  moving: "moving_posts",
  cleaning: "cleaning_posts",
  repair: "repair_posts",
  requests: "property_requests",
}

function getAdmin() {
  const k =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!k || !u) return null
  return createAdmin(u, k, { auth: { persistSession: false } })
}

/**
 * 게시글 신고
 *   POST /api/reports
 *   body: { targetType: 'secondhand'|'jobs'|'sharing'|'clubs'|'new-store', targetId, reason, reasonDetail? }
 *
 *   부수효과: report_count 증가, AUTO_HIDE_REPORT_THRESHOLD 이상 누적 시 status='hidden'
 */
export async function POST(request: NextRequest) {
  const auth = await apiAuthRequired(request)
  if (auth.error) return auth.error
  const { supabase, user, tokenSource } = auth

  // 차단 사용자 체크
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  // Rate limit — 유저당 10분 10개 (신고 남용 방어)
  const limited = await enforceRateLimit(request, 'report', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }

  const { targetType, targetId } = body
  // 길이/문자 제약 — DoS 방어
  const reason = typeof body.reason === "string"
    ? body.reason.replace(/[\x00-\x1f]/g, "").trim().slice(0, 50)
    : null
  const reasonDetail = typeof body.reasonDetail === "string"
    ? body.reasonDetail.replace(/[\x00-\x1f]/g, "").trim().slice(0, 1000) || null
    : null
  const table = TARGET_TABLE[targetType]
  if (!table) {
    return NextResponse.json({ error: "지원하지 않는 대상" }, { status: 400 })
  }
  if (!targetId || !reason) {
    return NextResponse.json(
      { error: "targetId 와 reason 은 필수" },
      { status: 400 },
    )
  }

  // 피신고자 조회 (plaza_id 포함 — cross-plaza 신고 차단)
  const { data: target } = await (supabase as any)
    .from(table)
    .select("user_id, plaza_id")
    .eq("id", targetId)
    .single()
  if (!target) {
    return NextResponse.json({ error: "대상을 찾을 수 없습니다" }, { status: 404 })
  }
  if (target.user_id === user.id) {
    return NextResponse.json(
      { error: "본인 글은 신고할 수 없습니다" },
      { status: 400 },
    )
  }

  // ── Cross-plaza griefing 방어: 다른 광장 글은 신고 불가
  const plaza = await getCurrentPlaza()
  if (plaza && (target as any).plaza_id && (target as any).plaza_id !== plaza) {
    return NextResponse.json(
      { error: "다른 광장의 글은 신고할 수 없습니다" },
      { status: 403 },
    )
  }
  // Bearer 토큰(모바일) → supabase 가 anonymous → RLS 차단
  let writer: any = supabase
  if (tokenSource === "bearer") {
    const admin = getAdmin()
    if (admin) writer = admin
  }

  const { error: insErr } = await writer.from("post_reports").insert({
    reporter_id: user.id,
    target_type: targetType,
    target_id: targetId,
    target_user_id: target.user_id,
    reason,
    reason_detail: reasonDetail || null,
    ...(plaza ? { plaza_id: plaza } : {}),
  })
  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json(
        { error: "이미 신고하신 글입니다" },
        { status: 409 },
      )
    }
    console.error("[reports] insert error:", insErr)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  // 누적 신고수 재계산 — service role 로 (RLS 우회)
  const admin = getAdmin()
  if (admin) {
    const { count } = await admin
      .from("post_reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", targetType)
      .eq("target_id", targetId)

    const newCount = count ?? 1
    const update: Record<string, unknown> = { report_count: newCount }

    if (newCount >= AUTO_HIDE_REPORT_THRESHOLD) {
      update.status = "hidden"
      update.hidden_reason = `자동 숨김: 신고 ${newCount}건 누적`
    }

    // 일부 테이블은 report_count/hidden_reason 컬럼이 없음 → 실패해도 무시
    // (신고 자체는 post_reports 에 이미 적재됨)
    const { error: upErr } = await admin.from(table).update(update).eq("id", targetId)
    if (upErr && !/column .* does not exist/i.test(upErr.message)) {
      console.warn("[reports] auto-hide update warning:", upErr.message)
    }
  }

  return NextResponse.json({ success: true })
}
