import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"
import { banGuardResponse } from "@/lib/services/user-ban-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * AI 생성 영상을 매물 상세페이지에 첨부
 *   POST /api/ai-video/attach  { jobId, propertyId }
 *
 *   조건:
 *     · 로그인된 사용자가 매물의 소유자여야 함
 *     · job 이 본인 것이고 status === "completed" 여야 함
 *     · result_url 이 존재해야 함
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, tokenSource } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }
  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const jobId: string | undefined = body?.jobId
  const propertyId: string | undefined = body?.propertyId
  if (!jobId || !propertyId) {
    return NextResponse.json(
      { error: "missing jobId or propertyId" },
      { status: 400 },
    )
  }

  // 1. job 확인 (본인 것 + 완료 상태)
  const { data: job, error: jobErr } = await supabase
    .from("ai_video_jobs")
    .select("id, user_id, status, result_url")
    .eq("id", jobId)
    .single()
  if (jobErr || !job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 })
  }
  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  if (job.status !== "completed" || !job.result_url) {
    return NextResponse.json(
      { error: "job not completed" },
      { status: 400 },
    )
  }

  // 2. 매물 소유권 + 광장 확인
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("id, user_id, plaza_id")
    .eq("id", propertyId)
    .single()
  if (propErr || !property) {
    return NextResponse.json({ error: "property not found" }, { status: 404 })
  }
  if (property.user_id !== user.id) {
    return NextResponse.json(
      { error: "not your property" },
      { status: 403 },
    )
  }
  const plaza = await getCurrentPlaza()
  if (plaza && property.plaza_id && property.plaza_id !== plaza) {
    return NextResponse.json({ error: "property not found" }, { status: 404 })
  }

  // 3. ai_video_url 업데이트 — Bearer 토큰(모바일) → admin client 우회
  let writer: any = supabase
  if (tokenSource === "bearer") {
    try { writer = createAdminClient() } catch (e) {
      console.error("[ai-video attach] admin client unavailable", e)
    }
  }
  const { error: updErr } = await writer
    .from("properties")
    .update({ ai_video_url: job.result_url })
    .eq("id", propertyId)
  if (updErr) {
    return NextResponse.json(
      { error: "update failed" },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, aiVideoUrl: job.result_url })
}

/**
 * 영상 제거 (매물에서만 떼어냄, job 자체는 유지)
 *   DELETE /api/ai-video/attach?propertyId=xxx
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { user, tokenSource: ts2 } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }
  const banRes2 = await banGuardResponse(user.id)
  if (banRes2) return banRes2
  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const propertyId = new URL(request.url).searchParams.get("propertyId")
  if (!propertyId) {
    return NextResponse.json({ error: "missing propertyId" }, { status: 400 })
  }

  const { data: property, error } = await supabase
    .from("properties")
    .select("id, user_id, plaza_id")
    .eq("id", propertyId)
    .single()
  if (error || !property) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  if (property.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  const plaza = await getCurrentPlaza()
  if (plaza && property.plaza_id && property.plaza_id !== plaza) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  let writer2: any = supabase
  if (ts2 === "bearer") {
    try { writer2 = createAdminClient() } catch (e) {
      console.error("[ai-video detach] admin client unavailable", e)
    }
  }
  const { error: updErr } = await writer2
    .from("properties")
    .update({ ai_video_url: null })
    .eq("id", propertyId)
  if (updErr) {
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
