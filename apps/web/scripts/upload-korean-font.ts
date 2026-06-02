/**
 * 한글 자막용 Noto Sans KR Bold 를 다운받아 Supabase Storage 에 업로드
 *
 *   사용법:
 *     pnpm tsx scripts/upload-korean-font.ts
 *
 *   결과:
 *     ai-video-assets/fonts/NotoSansKR-Bold.ttf 에 저장
 *     공개 URL 을 환경변수 AI_VIDEO_KOREAN_FONT_URL 에 넣으면 우선 사용됨.
 *
 *   폰트 라이선스: SIL Open Font License — 상업 사용 가능
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(process.cwd(), ".env.local") })

// Google Fonts GitHub 에 호스팅된 Noto Sans KR Bold (TTF)
const FONT_SOURCE =
  "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Bold.otf"
const STORAGE_PATH = "fonts/NotoSansKR-Bold.otf"

async function main() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("❌ Supabase env 누락")
    process.exit(1)
  }

  const admin = createClient(url, key, { auth: { persistSession: false } })

  console.log("⬇️  폰트 다운로드 중...")
  const res = await fetch(FONT_SOURCE)
  if (!res.ok) {
    console.error(`❌ 폰트 다운로드 실패: ${res.status} ${res.statusText}`)
    process.exit(1)
  }
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  console.log(`✓ 다운로드 완료 (${(buf.length / 1024 / 1024).toFixed(2)} MB)`)

  console.log("⬆️  Supabase Storage 업로드 중...")
  const { error } = await admin.storage
    .from("ai-video-assets")
    .upload(STORAGE_PATH, buf, {
      contentType: "font/otf",
      upsert: true,
    })
  if (error) {
    console.error("❌ 업로드 실패:", error.message)
    process.exit(1)
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("ai-video-assets").getPublicUrl(STORAGE_PATH)

  console.log("\n✅ 업로드 완료!\n")
  console.log("공개 URL:", publicUrl)
  console.log("\n.env.local 에 아래 추가:")
  console.log(`AI_VIDEO_KOREAN_FONT_URL=${publicUrl}\n`)
}

main().catch((e) => {
  console.error("💥 스크립트 실패:", e)
  process.exit(1)
})
