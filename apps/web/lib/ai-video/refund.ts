import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * AI 영상 job 실패 시 차감된 크레딧을 환불.
 *
 * 안전 장치:
 *   · `beta_free=true` (베타 기간 무료) 면 차감이 없었으므로 skip
 *   · `credits_used <= 0` 이면 skip
 *   · `credits_refunded=true` 면 이미 환불됨 → skip (중복 환불 방지)
 *
 * 원자성: `update ... where credits_refunded = false returning *` 으로
 * "플래그 선점" 을 먼저 시도하고, 성공한 경우에만 RPC 로 실제 환불.
 * 두 webhook 가 동시에 실패 처리를 하더라도 둘 중 하나만 환불됨.
 *
 * 반환: 환불이 실제로 일어났는지 여부
 */
export async function refundCreditsIfNeeded(
  admin: SupabaseClient,
  jobId: string,
): Promise<boolean> {
  // 1. job 정보 조회
  const { data: job, error } = await admin
    .from("ai_video_jobs")
    .select("id, user_id, credits_used, beta_free, credits_refunded")
    .eq("id", jobId)
    .single()

  if (error || !job) {
    console.warn("[refund] job not found:", jobId, error?.message)
    return false
  }
  if (job.beta_free) return false
  if (!job.credits_used || job.credits_used <= 0) return false
  if (job.credits_refunded) return false

  // 2. 플래그 선점 (원자적) — false → true 로 전환된 행이 1개 있을 때만 환불 진행
  const { data: claimed, error: claimErr } = await admin
    .from("ai_video_jobs")
    .update({ credits_refunded: true })
    .eq("id", jobId)
    .eq("credits_refunded", false)
    .select("id")
    .maybeSingle()

  if (claimErr) {
    console.error("[refund] claim flag failed:", claimErr.message)
    return false
  }
  if (!claimed) {
    // 다른 요청이 먼저 환불 처리 중
    return false
  }

  // 3. 실제 환불
  const { error: grantErr } = await admin.rpc("grant_video_credits", {
    p_user_id: job.user_id,
    p_points: job.credits_used,
  })
  if (grantErr) {
    // 플래그를 되돌려서 재시도 가능하게
    await admin
      .from("ai_video_jobs")
      .update({ credits_refunded: false })
      .eq("id", jobId)
    console.error("[refund] grant RPC failed:", grantErr.message)
    return false
  }

  // refund 완료 — 에러 시에만 로깅 (성공 시 production 노이즈 제거)
  return true
}
