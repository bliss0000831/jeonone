/**
 * fal.ai 클라이언트 래퍼
 *
 *   · Kling 1.6 image-to-video: 이미지 → 5초 클립
 *   · fal-ai/ffmpeg-api/compose: 여러 소스(비디오/오디오/자막) 합성
 *
 *   Queue API + 웹훅 기반이므로 create 라우트에서는 submit 만 하고 즉시 응답.
 *   결과는 /api/ai-video/webhook 으로 수신.
 */

import { fal } from "@fal-ai/client"

// 서버사이드 인증
if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY })
}

const KLING_MODEL = "fal-ai/kling-video/v1.6/standard/image-to-video"
const FFMPEG_MODEL = "fal-ai/ffmpeg-api/compose"
// Raw ffmpeg 명령 실행 엔드포인트 (ASS 자막 burn-in 용)
const FFMPEG_EXEC_MODEL = "fal-ai/ffmpeg-api"

/**
 * 이미지 → 영상 클립 생성 요청 (queue.submit, 즉시 request_id 반환)
 */
export async function submitKlingClip(args: {
  imageUrl: string
  prompt: string
  duration: 5 | 10
  aspectRatio: "16:9" | "9:16" | "1:1"
  webhookUrl: string
}): Promise<{ requestId: string }> {
  const input: any = {
    image_url: args.imageUrl,
    prompt: args.prompt,
    duration: String(args.duration),
    aspect_ratio: args.aspectRatio,
    negative_prompt: "blur, distort, low quality, text, watermark",
    cfg_scale: 0.5,
  }
  const { request_id } = await fal.queue.submit(KLING_MODEL, {
    input,
    webhookUrl: args.webhookUrl,
  })
  return { requestId: request_id }
}

/**
 * Kling 작업 상태 조회 (폴링 fallback)
 */
export async function getKlingStatus(requestId: string) {
  return fal.queue.status(KLING_MODEL, { requestId, logs: false })
}

export async function getKlingResult(
  requestId: string,
): Promise<{ videoUrl: string } | null> {
  const r = await fal.queue.result(KLING_MODEL, { requestId })
  const data: any = r.data
  const videoUrl = data?.video?.url
  if (!videoUrl) return null
  return { videoUrl }
}

/**
 * FFmpeg compose — 비디오 + TTS + BGM + 자막 합성
 *
 *   fal-ai/ffmpeg-api/compose 스펙:
 *     tracks: [
 *       { id, type: "video"|"audio", keyframes: [{ url, timestamp, duration }] }
 *     ]
 *
 *   자막은 별도 subtitle 트랙 or burn-in (현재는 burn-in 미지원 → 나중에 확장)
 */
export async function submitCompose(args: {
  clips: Array<{ url: string; durationSec: number }>
  ttsUrl?: string | null
  bgmUrl?: string | null
  bgmVolume?: number // 0~1
  webhookUrl: string
}): Promise<{ requestId: string }> {
  const tracks: any[] = []

  // 비디오 트랙 — 여러 클립을 순서대로 이어붙임
  let cursor = 0
  tracks.push({
    id: "video_main",
    type: "video",
    keyframes: args.clips.map((c) => {
      const kf = {
        url: c.url,
        timestamp: cursor,
        duration: c.durationSec,
      }
      cursor += c.durationSec
      return kf
    }),
  })

  // TTS 트랙 — 0초부터 재생
  if (args.ttsUrl) {
    tracks.push({
      id: "narration",
      type: "audio",
      keyframes: [{ url: args.ttsUrl, timestamp: 0, duration: cursor }],
    })
  }

  // BGM 트랙 — 볼륨 낮춰서 재생
  if (args.bgmUrl) {
    tracks.push({
      id: "bgm",
      type: "audio",
      keyframes: [{ url: args.bgmUrl, timestamp: 0, duration: cursor }],
      volume: args.bgmVolume ?? 0.15,
    })
  }

  const { request_id } = await fal.queue.submit(FFMPEG_MODEL, {
    input: { tracks },
    webhookUrl: args.webhookUrl,
  })

  return { requestId: request_id }
}

export async function getComposeResult(
  requestId: string,
): Promise<{ videoUrl: string } | null> {
  const r = await fal.queue.result(FFMPEG_MODEL, { requestId })
  const data: any = r.data
  const videoUrl = data?.video_url || data?.video?.url
  if (!videoUrl) return null
  return { videoUrl }
}

/**
 * ASS 자막 burn-in (raw ffmpeg 명령 실행)
 *
 *   fal-ai/ffmpeg-api 는 `compose` 외에도 raw ffmpeg 엔드포인트를 제공.
 *   여기선 비디오 URL + ASS URL + 한글 폰트 URL 을 받아서
 *     ffmpeg -i <video> -vf "ass=<ass>:fontsdir=<fontdir>" <output>
 *   를 실행시키는 형태.
 *
 *   fal 의 정확한 schema 에 맞게 input 필드명 조정 필요.
 *   여기선 fal-ai/ffmpeg-api 의 generic compose 에 filter_complex 를 넣거나,
 *   지원되는 "filters" 필드를 사용.
 */
export async function submitSubtitleBurn(args: {
  videoUrl: string
  assUrl: string
  fontUrl: string // TTF/OTF 파일 URL (Noto Sans KR)
  webhookUrl: string
}): Promise<{ requestId: string }> {
  // fal-ai/ffmpeg-api 는 tracks + filters 지원.
  // 자막 burn 은 filter 로 처리: video track 에 ass=subs.ass 필터 적용
  const input: any = {
    tracks: [
      {
        id: "video",
        type: "video",
        keyframes: [{ url: args.videoUrl, timestamp: 0, duration: 0 }],
      },
    ],
    // fal ffmpeg-api 가 지원하는 extra_args / filter_complex 는 모델마다 다름.
    // fallback 으로 subtitle 전용 워크플로우 시도.
    subtitle_url: args.assUrl,
    font_url: args.fontUrl,
  }

  const { request_id } = await fal.queue.submit(FFMPEG_MODEL, {
    input,
    webhookUrl: args.webhookUrl,
  })
  return { requestId: request_id }
}

export async function getSubtitleBurnResult(
  requestId: string,
): Promise<{ videoUrl: string } | null> {
  const r = await fal.queue.result(FFMPEG_MODEL, { requestId })
  const data: any = r.data
  const videoUrl = data?.video_url || data?.video?.url
  if (!videoUrl) return null
  return { videoUrl }
}

/**
 * 매물 정보 → Kling 프롬프트 (영어, 짧게)
 */
export function buildKlingPrompt(args: {
  style: "emotional" | "professional" | "upbeat"
  propertyType?: string
}): string {
  const base: Record<string, string> = {
    emotional:
      "cinematic slow camera movement, warm golden hour light, dreamy atmosphere, soft bokeh",
    professional:
      "steady architectural shot, clean light, sharp details, premium real estate showcase",
    upbeat:
      "dynamic pan, bright daylight, vibrant colors, lively modern lifestyle",
  }
  return `${args.propertyType || "modern Korean real estate"}, ${base[args.style] || base.emotional}`
}
