import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdmin } from "@supabase/supabase-js"
import crypto from "node:crypto"
import {
  getKlingResult,
  getComposeResult,
  submitCompose,
  submitSubtitleBurn,
  getSubtitleBurnResult,
} from "@/lib/ai-video/fal-client"
import { refundCreditsIfNeeded } from "@/lib/ai-video/refund"

/**
 * 마스터 시크릿 대신 jobId 로 파생된 HMAC 서명.
 *   - 시그니처는 X-Webhook-Signature 헤더로 전송 (URL 에 안 실음)
 *   - URL/로그/리퍼러에 흔적 안 남음
 *   - 다른 jobId 로 URL 을 위조해도 서명 검증 실패 → 단일 job 으로 블라스트 제한
 *   - 64자 풀 길이 사용 (이전 32자 절단보다 강함)
 */
function deriveWebhookSig(jobId: string, kind: string): string {
  const secret = process.env.AI_VIDEO_WEBHOOK_SECRET || ""
  return crypto
    .createHmac("sha256", secret)
    .update(`${jobId}:${kind}`)
    .digest("hex")
}

function verifyWebhookSig(jobId: string, kind: string, sig: string | null): boolean {
  if (!sig) return false
  const expected = deriveWebhookSig(jobId, kind)
  // timing-safe 비교
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

const KOREAN_FONT_URL =
  process.env.AI_VIDEO_KOREAN_FONT_URL ||
  // 기본: Google Fonts Noto Sans KR Bold (OTF) — 직접 CDN 사용
  "https://fonts.gstatic.com/s/notosanskr/v36/PbykFmXiEBPT4ITbgNA5Cgm20xz64px_1hVWr0wuPNGmlQNMEfD4.ttf"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * fal.ai 웹훅 수신
 *
 *   URL 예:
 *     /api/ai-video/webhook?secret=xxx&jobId=<uuid>&kind=clip&clipIndex=0
 *     /api/ai-video/webhook?secret=xxx&jobId=<uuid>&kind=compose
 *
 *   동작:
 *     · kind=clip    : 개별 Kling 클립 완료 → clips[idx].url 저장,
 *                       모든 클립 완료 시 compose 제출
 *     · kind=compose : 최종 합성 완료 → status=completed, result_url 저장
 */

function getAdmin() {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!serviceKey || !supaUrl) return null
  return createAdmin(supaUrl, serviceKey, { auth: { persistSession: false } })
}

function getPublicBaseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    new URL(req.url).origin
  )
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  // 보안: 서명은 반드시 헤더로만 전송. 쿼리 파라미터는 Vercel 액세스 로그/리퍼러/프록시 로그에
  // 흔적이 남아 재전송(replay) 공격이 가능하므로 fallback 절대 두지 말 것.
  const sig = req.headers.get("x-webhook-signature")
  const jobId = url.searchParams.get("jobId")
  const kind = url.searchParams.get("kind")
  const clipIndex = Number(url.searchParams.get("clipIndex") ?? -1)

  if (!jobId || !kind) {
    return NextResponse.json({ error: "missing params" }, { status: 400 })
  }
  // HMAC 서명 검증 — 마스터 시크릿은 절대 노출 안 됨, 시그니처는 헤더로 전송.
  if (!process.env.AI_VIDEO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook secret unset" }, { status: 500 })
  }
  if (!verifyWebhookSig(jobId, kind, sig)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // fal 웹훅 바디 (status, request_id, payload/error)
  const body = await req.json().catch(() => ({}))
  const falStatus: string = body?.status || "unknown"
  const requestId: string = body?.request_id || ""

  const admin = getAdmin()
  if (!admin) {
    return NextResponse.json({ error: "admin key missing" }, { status: 500 })
  }

  const { data: job, error: fetchErr } = await admin
    .from("ai_video_jobs")
    .select(
      "id, status, stage, clips, tts_url, bgm_url, duration_seconds, subtitle_ass_url, compose_url",
    )
    .eq("id", jobId)
    .single()

  if (fetchErr || !job) {
    console.warn("[webhook] job not found:", jobId)
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  // 실패 케이스
  if (falStatus === "ERROR" || falStatus === "CANCELLED") {
    await admin
      .from("ai_video_jobs")
      .update({
        status: "failed",
        error_message: `fal ${kind} ${falStatus}: ${JSON.stringify(body?.error || body)}`,
      })
      .eq("id", jobId)
    await refundCreditsIfNeeded(admin, jobId)
    return NextResponse.json({ ok: true })
  }

  // 성공 아닐 경우 (QUEUE / IN_PROGRESS 등) → 그냥 200 리턴
  if (falStatus !== "OK" && falStatus !== "COMPLETED") {
    return NextResponse.json({ ok: true, note: "ignored status " + falStatus })
  }

  try {
    if (kind === "clip") {
      // ─── 개별 Kling 클립 완료 ───
      const result = await getKlingResult(requestId)
      if (!result) {
        await admin
          .from("ai_video_jobs")
          .update({ status: "failed", error_message: "Kling 결과 URL 누락" })
          .eq("id", jobId)
        await refundCreditsIfNeeded(admin, jobId)
        return NextResponse.json({ ok: false })
      }

      const clips: any[] = Array.isArray(job.clips) ? [...job.clips] : []
      if (clipIndex >= 0 && clipIndex < clips.length) {
        clips[clipIndex] = {
          ...clips[clipIndex],
          url: result.videoUrl,
          status: "completed",
        }
      }

      const allDone = clips.every((c) => c.status === "completed" && c.url)

      await admin
        .from("ai_video_jobs")
        .update({
          clips,
          stage: allDone ? "compositing" : "generating_clips",
        })
        .eq("id", jobId)

      // 모든 클립 완료 → compose 제출
      if (allDone) {
        const baseUrl = getPublicBaseUrl(req)
        // NOTE: sig is placed in the URL query because fal.ai webhook config only supports URL-based params
        // (no custom headers). The POST handler validates via X-Webhook-Signature header first;
        // this URL sig serves as defense-in-depth only.
        // TODO: migrate to header-based sig when fal.ai supports webhook headers
        const webhookUrl = `${baseUrl}/api/ai-video/webhook?jobId=${jobId}&kind=compose`

        const { requestId: composeReqId } = await submitCompose({
          clips: clips.map((c) => ({ url: c.url, durationSec: c.durationSec })),
          ttsUrl: job.tts_url,
          bgmUrl: job.bgm_url,
          bgmVolume: 0.15,
          webhookUrl,
        })

        await admin
          .from("ai_video_jobs")
          .update({ provider_request_id: composeReqId })
          .eq("id", jobId)
      }

      return NextResponse.json({ ok: true, allDone })
    }

    if (kind === "compose") {
      // ─── 나레이션+BGM 합성 완료 → ASS 자막 burn 단계로 ───
      const result = await getComposeResult(requestId)
      if (!result) {
        await admin
          .from("ai_video_jobs")
          .update({ status: "failed", error_message: "compose 결과 URL 누락" })
          .eq("id", jobId)
        await refundCreditsIfNeeded(admin, jobId)
        return NextResponse.json({ ok: false })
      }

      // 자막 ASS 가 있으면 burn 단계 진입, 없으면 그대로 완료
      if (!job.subtitle_ass_url) {
        await admin
          .from("ai_video_jobs")
          .update({
            status: "completed",
            stage: "done",
            result_url: result.videoUrl,
            compose_url: result.videoUrl,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId)
        return NextResponse.json({ ok: true, note: "no subtitles" })
      }

      const baseUrl = getPublicBaseUrl(req)
      // NOTE: sig in URL — fal.ai limitation (URL-only webhook config). See compose webhook note above.
      // TODO: migrate to header-based sig when fal.ai supports webhook headers
      const burnWebhook = `${baseUrl}/api/ai-video/webhook?jobId=${jobId}&kind=burn`

      try {
        const { requestId: burnReqId } = await submitSubtitleBurn({
          videoUrl: result.videoUrl,
          assUrl: job.subtitle_ass_url,
          fontUrl: KOREAN_FONT_URL,
          webhookUrl: burnWebhook,
        })
        await admin
          .from("ai_video_jobs")
          .update({
            stage: "burning_subtitles",
            compose_url: result.videoUrl,
            provider_request_id: burnReqId,
          })
          .eq("id", jobId)
      } catch (e: any) {
        // burn 실패 시 자막 없이 compose 결과로 폴백
        console.warn("[webhook] subtitle burn submit failed, fallback:", e)
        await admin
          .from("ai_video_jobs")
          .update({
            status: "completed",
            stage: "done",
            result_url: result.videoUrl,
            compose_url: result.videoUrl,
            completed_at: new Date().toISOString(),
            error_message: `자막 burn 실패 (자막 없이 완료): ${e?.message || e}`,
          })
          .eq("id", jobId)
      }

      return NextResponse.json({ ok: true })
    }

    if (kind === "burn") {
      // ─── ASS 자막 burn 완료 = 최종 완성 ───
      const burn = await getSubtitleBurnResult(requestId)
      if (!burn) {
        // 실패 시 자막 없이 compose_url 로 폴백
        await admin
          .from("ai_video_jobs")
          .update({
            status: "completed",
            stage: "done",
            result_url: job.compose_url,
            completed_at: new Date().toISOString(),
            error_message: "자막 burn 결과 누락 — 자막 없이 완료",
          })
          .eq("id", jobId)
        return NextResponse.json({ ok: true, fallback: true })
      }

      await admin
        .from("ai_video_jobs")
        .update({
          status: "completed",
          stage: "done",
          result_url: burn.videoUrl,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "unknown kind" }, { status: 400 })
  } catch (e: any) {
    console.error("[webhook] error:", e)
    // fal.ai ApiError 는 body.detail 에 진짜 이유가 들어있음 → detail 만 추리고
    // 시크릿/토큰 필드는 로그·DB 양쪽에서 전부 제거.
    const SENSITIVE = /^(token|secret|api[-_]?key|authorization|password|cookie)$/i
    const sanitize = (v: any): any => {
      if (v == null || typeof v !== "object") return v
      if (Array.isArray(v)) return v.map(sanitize)
      const out: Record<string, any> = {}
      for (const [k, val] of Object.entries(v)) {
        out[k] = SENSITIVE.test(k) ? "[REDACTED]" : sanitize(val)
      }
      return out
    }
    let detail = ""
    if (e?.body) {
      try {
        detail = typeof e.body === "object"
          ? JSON.stringify(sanitize(e.body))
          : String(e.body).slice(0, 500)
      } catch {
        detail = "[unserializable body]"
      }
    }
    const msg = `webhook error: ${e?.message || e}${
      e?.status ? ` [status=${e.status}]` : ""
    }${detail ? ` detail=${detail}` : ""}`
    await admin
      .from("ai_video_jobs")
      .update({
        status: "failed",
        error_message: msg.slice(0, 2000),
      })
      .eq("id", jobId)
    await refundCreditsIfNeeded(admin, jobId)
    // 응답엔 일반 메시지만 — detail/원본은 DB error_message 와 console 에만
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// GET — 헬스체크
export async function GET() {
  return NextResponse.json({ ok: true, name: "ai-video webhook" })
}
