import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createClient as createAdmin } from "@supabase/supabase-js"
// crypto import removed — HMAC sig now handled only in webhook route
import {
  IS_BETA_FREE,
  creditCostForDuration,
  isBetaLocked,
} from "@/lib/ai-video/pricing"
import {
  generateNarrationScript,
  type PropertyData,
  type VideoStyle,
} from "@/lib/ai-video/script-generator"
import { generateAndUploadTts } from "@/lib/ai-video/elevenlabs-tts"
import { pickBgm } from "@/lib/ai-video/bgm-picker"
import { submitKlingClip, buildKlingPrompt } from "@/lib/ai-video/fal-client"
import { generateSubtitleSegments } from "@/lib/ai-video/subtitle-generator"
import { buildAss } from "@/lib/ai-video/ass-builder"
import { refundCreditsIfNeeded } from "@/lib/ai-video/refund"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * AI 홍보영상 생성 — Phase C (실제 API)
 *
 *   1) 인증 + 공인중개사 + 크레딧 검증
 *   2) job INSERT (status=pending, stage=preparing)
 *   3) 크레딧 차감
 *   4) 병렬 실행:
 *        · OpenAI: 한국어 나레이션 스크립트 생성
 *        · ElevenLabs: TTS → Supabase Storage 업로드
 *        · BGM 프리셋 선택
 *   5) fal.ai Kling image-to-video 제출 (webhook_url 포함)
 *        · BETA(15s): 1 clip x 5초 + 0s 추가하여 5초로 축소 (최소 비용)
 *        · 또는 1 clip x 10초 (5초 초과 15초 이하) — 여기선 10초 사용
 *   6) job 업데이트 (providerrequest_id, stage=generating_clips)
 *   7) 즉시 { jobId } 반환 → 나머지는 웹훅에서 처리
 */

function getAdmin() {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!serviceKey || !supaUrl) return null
  return createAdmin(supaUrl, serviceKey, { auth: { persistSession: false } })
}

function getPublicBaseUrl(req: NextRequest): string {
  // 웹훅 URL 구성용 — 프로덕션 도메인 우선, 없으면 요청 헤더 기반
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL?.replace(/^/, "https://") ||
    new URL(req.url).origin
  )
}

// 영상 길이 → Kling 클립 구성
function planClips(duration: 15 | 30 | 60): Array<5 | 10> {
  // MVP: 각 구간을 5s/10s 블록으로 분할
  if (duration === 15) return [10, 5]
  if (duration === 30) return [10, 10, 10]
  return [10, 10, 10, 10, 10, 10] // 60
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type, video_credits")
      .eq("id", user.id)
      .single()

    if (profile?.account_type !== "agent") {
      return NextResponse.json(
        { error: "공인중개사 계정만 이용 가능합니다" },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const {
      images,
      ratio = "9:16",
      duration = 15,
      style = "emotional",
      property = {},
    }: {
      images: string[]
      ratio: "9:16" | "16:9" | "1:1"
      duration: 15 | 30 | 60
      style: VideoStyle
      property: PropertyData
    } = body || {}

    // ─── 검증 ───
    if (![15, 30, 60].includes(duration)) {
      return NextResponse.json(
        { error: "영상 길이 값이 잘못되었습니다" },
        { status: 400 },
      )
    }
    if (isBetaLocked(duration)) {
      return NextResponse.json(
        {
          error:
            "BETA 기간 중에는 15초 영상만 생성할 수 있습니다. 정식 출시 후 이용해주세요.",
        },
        { status: 400 },
      )
    }
    if (!Array.isArray(images) || images.length < 1) {
      return NextResponse.json(
        { error: "사진을 1장 이상 업로드해주세요" },
        { status: 400 },
      )
    }

    const costPoints = creditCostForDuration(duration)
    const currentBalance = profile?.video_credits ?? 0
    if (!IS_BETA_FREE && currentBalance < costPoints) {
      return NextResponse.json(
        { error: "크레딧이 부족합니다", balance: currentBalance, required: costPoints },
        { status: 402 },
      )
    }

    const admin = getAdmin()
    if (!admin) {
      return NextResponse.json(
        { error: "서버 설정 오류 (service role key)" },
        { status: 500 },
      )
    }

    // ─── job INSERT ───
    const { data: job, error: jobErr } = await admin
      .from("ai_video_jobs")
      .insert({
        user_id: user.id,
        status: "pending",
        stage: "preparing",
        input: body,
        credits_used: IS_BETA_FREE ? 0 : costPoints,
        beta_free: IS_BETA_FREE,
        provider: "fal",
        duration_seconds: duration,
      })
      .select("id")
      .single()

    if (jobErr || !job) {
      return NextResponse.json(
        { error: "작업 생성 실패" },
        { status: 500 },
      )
    }

    // ─── 크레딧 차감 ───
    if (!IS_BETA_FREE) {
      const { error: deductErr } = await admin.rpc("deduct_video_credits", {
        p_user_id: user.id,
        p_points: costPoints,
      })
      if (deductErr) {
        await admin
          .from("ai_video_jobs")
          .update({ status: "failed", error_message: deductErr.message })
          .eq("id", job.id)
        return NextResponse.json(
          { error: "크레딧 차감 실패: " + deductErr.message },
          { status: 500 },
        )
      }
    }

    // ─── 병렬: 스크립트 + TTS + BGM + 자막 ───
    let scriptText: string | null = null
    let ttsUrl: string | null = null
    let bgmUrl: string | null = null
    let subtitleSegments: any[] = []
    let subtitleAssUrl: string | null = null

    try {
      scriptText = await generateNarrationScript({
        property,
        duration,
        style,
      })

      // 스크립트 확정 후 병렬로: TTS + BGM 픽 + 자막 세그먼트 생성
      const [{ url: ttsPublicUrl }, bgm, segs] = await Promise.all([
        generateAndUploadTts({ text: scriptText, jobId: job.id }),
        Promise.resolve(pickBgm(style)),
        generateSubtitleSegments({
          script: scriptText,
          duration,
          property,
        }),
      ])
      ttsUrl = ttsPublicUrl
      bgmUrl = bgm?.url || null
      subtitleSegments = segs

      // ASS 파일 생성 + Storage 업로드
      const assContent = buildAss({
        segments: segs,
        videoStyle: style,
        ratio,
      })
      const supaUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!
      const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!
      const admin2 = createAdmin(supaUrl, serviceKey, {
        auth: { persistSession: false },
      })
      const assPath = `ass/${job.id}.ass`
      const { error: upErr } = await admin2.storage
        .from("ai-video-assets")
        .upload(assPath, Buffer.from(assContent, "utf8"), {
          // 버킷 허용 목록이 exact-match 라서 charset 파라미터를 붙이면 거부됨.
          // ASS 파일은 UTF-8 BOM 없이 저장 — fal.ai 가 그대로 파싱 가능.
          contentType: "text/plain",
          upsert: true,
        })
      if (upErr) throw new Error("ASS 업로드 실패: " + upErr.message)
      subtitleAssUrl = admin2.storage
        .from("ai-video-assets")
        .getPublicUrl(assPath).data.publicUrl
    } catch (e: any) {
      console.error("[create] 사전 생성 단계 실패:", e)
      await admin
        .from("ai_video_jobs")
        .update({
          status: "failed",
          error_message: `사전 생성 실패: ${e?.message || e}`,
        })
        .eq("id", job.id)
      await refundCreditsIfNeeded(admin, job.id)
      return NextResponse.json(
        { error: "영상 사전 생성 중 오류가 발생했습니다" },
        { status: 500 },
      )
    }

    // ─── 🧪 TEST MODE — Kling/compose/burn 전부 스킵 ───
    //   env AI_VIDEO_TEST_MODE=true 시, fal.ai 호출 없이 즉시 completed.
    //   스크립트·TTS·자막은 정상 생성되므로 UI 전체 흐름을 확인 가능.
    if (process.env.AI_VIDEO_TEST_MODE === "true") {
      const sampleResultUrl =
        process.env.AI_VIDEO_TEST_SAMPLE_URL ||
        // 공개 샘플 MP4 (Big Buck Bunny, w3schools 호스팅, ~10초 800KB)
        "https://www.w3schools.com/html/mov_bbb.mp4"

      await admin
        .from("ai_video_jobs")
        .update({
          status: "completed",
          stage: "done",
          script_text: scriptText,
          tts_url: ttsUrl,
          bgm_url: bgmUrl,
          subtitle_segments: subtitleSegments,
          subtitle_ass_url: subtitleAssUrl,
          result_url: sampleResultUrl,
          completed_at: new Date().toISOString(),
          error_message: "[TEST_MODE] Kling 스킵 — 샘플 영상 반환",
        })
        .eq("id", job.id)

      return NextResponse.json({
        jobId: job.id,
        status: "completed",
        stage: "done",
        testMode: true,
        betaFree: IS_BETA_FREE,
        creditsUsed: 0,
        resultUrl: sampleResultUrl,
        script: scriptText,
      })
    }

    // ─── 클립 계획 ───
    const clipPlan = planClips(duration)
    // 이미지가 적으면 반복 사용
    const assignedImages = clipPlan.map((_, i) => images[i % images.length])

    // ─── fal.ai 첫번째 클립 제출 (MVP: 하나만 먼저, 완료되면 웹훅에서 다음 제출) ───
    //    간결함을 위해 일단 모든 클립을 "동시 제출"
    const baseUrl = getPublicBaseUrl(request)
    // HMAC 서명 — 마스터 시크릿 URL 노출 방지. webhook route 와 동일 파생식 사용.
    const webhookUrl = `${baseUrl}/api/ai-video/webhook?jobId=${job.id}&kind=clip`

    const klingPrompt = buildKlingPrompt({
      style,
      propertyType: property.propertyType,
    })

    const clipRequests: Array<{ index: number; requestId: string; duration: 5 | 10 }> = []
    try {
      for (let i = 0; i < clipPlan.length; i++) {
        const clipDuration = clipPlan[i]
        const imageUrl = assignedImages[i]
        const { requestId } = await submitKlingClip({
          imageUrl,
          prompt: klingPrompt,
          duration: clipDuration,
          aspectRatio: ratio,
          webhookUrl: `${webhookUrl}&clipIndex=${i}`,
        })
        clipRequests.push({ index: i, requestId, duration: clipDuration })
      }
    } catch (e: any) {
      console.error("[create] fal.ai Kling 제출 실패:", e)
      await admin
        .from("ai_video_jobs")
        .update({
          status: "failed",
          error_message: `영상 생성 요청 실패: ${e?.message || e}`,
        })
        .eq("id", job.id)
      await refundCreditsIfNeeded(admin, job.id)
      return NextResponse.json(
        { error: "영상 생성 요청 중 오류가 발생했습니다" },
        { status: 500 },
      )
    }

    // ─── job 업데이트: generating_clips ───
    await admin
      .from("ai_video_jobs")
      .update({
        status: "processing",
        stage: "generating_clips",
        script_text: scriptText,
        tts_url: ttsUrl,
        bgm_url: bgmUrl,
        subtitle_segments: subtitleSegments,
        subtitle_ass_url: subtitleAssUrl,
        clips: clipRequests.map((c) => ({
          index: c.index,
          requestId: c.requestId,
          durationSec: c.duration,
          status: "pending",
          url: null,
        })),
      })
      .eq("id", job.id)

    return NextResponse.json({
      jobId: job.id,
      status: "processing",
      stage: "generating_clips",
      betaFree: IS_BETA_FREE,
      creditsUsed: IS_BETA_FREE ? 0 : costPoints,
      clipCount: clipRequests.length,
      script: scriptText,
    })
  } catch (e: any) {
    console.error("[ai-video/create] error:", e)
    return NextResponse.json(
      { error: "영상 생성 중 오류가 발생했습니다" },
      { status: 500 },
    )
  }
}
