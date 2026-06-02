/**
 * ElevenLabs TTS 래퍼
 *   · 한국어 나레이션 → mp3 Buffer
 *   · Supabase Storage 에 업로드 → 공개 URL 반환
 */

import { createClient } from "@supabase/supabase-js"

const ELEVENLABS_API = "https://api.elevenlabs.io/v1"

// 한국어 호환 기본 보이스 (다국어 모델)
//   · "Rachel" (21m00Tcm4TlvDq8ikWAM) — 여성, 차분
//   · "Bella"  (EXAVITQu4vr4xnSDxMaL) — 여성, 따뜻
//   · "Adam"   (pNInz6obpgDQGcFmaJgB) — 남성, 중후
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL" // Bella

export async function generateTts(args: {
  text: string
  voiceId?: string
}): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY 가 없습니다")

  const voiceId = args.voiceId || DEFAULT_VOICE_ID

  const res = await fetch(
    `${ELEVENLABS_API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: args.text,
        // multilingual v2 = 한국어 지원
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`ElevenLabs TTS 실패 (${res.status}): ${errText}`)
  }

  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

/**
 * TTS 생성 → Supabase Storage 업로드 → 공개 URL 반환
 *
 *   bucket: "ai-video-assets" (없으면 생성 필요)
 *   path:   tts/{jobId}.mp3
 */
export async function generateAndUploadTts(args: {
  text: string
  jobId: string
  voiceId?: string
}): Promise<{ url: string; sizeBytes: number }> {
  const mp3 = await generateTts({ text: args.text, voiceId: args.voiceId })

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !serviceKey) throw new Error("Supabase service key 누락")

  const admin = createClient(supaUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const path = `tts/${args.jobId}.mp3`
  const { error: upErr } = await admin.storage
    .from("ai-video-assets")
    .upload(path, mp3, {
      contentType: "audio/mpeg",
      upsert: true,
    })

  if (upErr) {
    throw new Error(`TTS Storage 업로드 실패: ${upErr.message}`)
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("ai-video-assets").getPublicUrl(path)

  return { url: publicUrl, sizeBytes: mp3.length }
}
