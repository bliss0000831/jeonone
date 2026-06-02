/**
 * BGM 선택기 — 스타일별 랜덤 선곡
 *
 *   소스: Mixkit (https://mixkit.co/free-stock-music/) — 무료 상업사용 허용
 *         assets.mixkit.co/music/preview/ 는 CDN 직링크
 *
 *   주의: Mixkit 약관 상 상업 영상 제작에 사용 가능.
 *         저작권 표기는 의무 아님.
 *
 *   ⚠️ URL 이 404 나면 bgm-picker 가 null 반환하여 BGM 없이 진행됨.
 *       장기 안정성 위해 Supabase Storage 로 이관 권장.
 */

import type { VideoStyle } from "./script-generator"

interface BgmTrack {
  url: string
  title: string
  credit: string
}

const BGM_PRESETS: Record<VideoStyle, BgmTrack[]> = {
  emotional: [
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3",
      title: "Serene View",
      credit: "Mixkit",
    },
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3",
      title: "Soft Piano",
      credit: "Mixkit",
    },
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-valley-sunset-127.mp3",
      title: "Valley Sunset",
      credit: "Mixkit",
    },
  ],
  professional: [
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-hip-hop-02-738.mp3",
      title: "Modern Business",
      credit: "Mixkit",
    },
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-deep-meditation-109.mp3",
      title: "Clean Corporate",
      credit: "Mixkit",
    },
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3",
      title: "Dreaming Big",
      credit: "Mixkit",
    },
  ],
  upbeat: [
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-summer-fun-13.mp3",
      title: "Summer Fun",
      credit: "Mixkit",
    },
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-raising-me-higher-34.mp3",
      title: "Raising Me Higher",
      credit: "Mixkit",
    },
    {
      url: "https://assets.mixkit.co/music/preview/mixkit-driving-ambition-32.mp3",
      title: "Driving Ambition",
      credit: "Mixkit",
    },
  ],
}

/**
 * ⚠️ 임시 비활성화:
 *   Mixkit `assets.mixkit.co/music/preview/*.mp3` 는 CloudFront 에서
 *   hotlink 차단 (브라우저 외 요청에 403 반환). fal.ai 워커가 BGM 을
 *   다운로드하지 못해 compose 가 422 로 실패함.
 *
 *   해결책: 무료 상업사용 가능한 BGM 파일을 Supabase Storage
 *   (`ai-video-assets/bgm/`) 로 업로드한 뒤 URL 을 BGM_PRESETS 에
 *   채워 넣고 아래 DISABLE_BGM 플래그를 false 로 돌리면 복구됨.
 */
const DISABLE_BGM = true

export function pickBgm(style: VideoStyle): BgmTrack | null {
  if (DISABLE_BGM) return null
  const pool = BGM_PRESETS[style] || []
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

