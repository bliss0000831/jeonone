/**
 * 유튜브 URL 유틸리티
 *
 * - watch?v=, youtu.be/, shorts/, embed/ 형태 전부 지원
 * - 저장용 canonical URL 생성 (https://www.youtube.com/watch?v={id})
 * - iframe 임베드용 URL 빌더
 */

export type YouTubeKind = "video" | "shorts"

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * 유튜브 URL 파싱. 유효하지 않으면 null.
 * 지원 호스트: youtube.com, www.youtube.com, m.youtube.com, youtu.be, music.youtube.com
 */
export function parseYouTubeUrl(raw: string | null | undefined): {
  id: string
  kind: YouTubeKind
  canonical: string // https://www.youtube.com/watch?v={id}
} | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "").replace(/^music\./, "")
  let id: string | null = null
  let kind: YouTubeKind = "video"

  if (host === "youtu.be") {
    // https://youtu.be/{id}
    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length >= 1) id = parts[0]
  } else if (host === "youtube.com") {
    // /watch?v=..., /shorts/..., /embed/..., /live/...
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v")
    } else {
      const parts = url.pathname.split("/").filter(Boolean)
      if (parts.length >= 2 && ["shorts", "embed", "live", "v"].includes(parts[0])) {
        id = parts[1]
        if (parts[0] === "shorts") kind = "shorts"
      }
    }
  } else {
    return null
  }

  if (!id || !YT_ID_RE.test(id)) return null

  return {
    id,
    kind,
    canonical: `https://www.youtube.com/watch?v=${id}`,
  }
}

export function isValidYouTubeUrl(raw: string | null | undefined): boolean {
  return parseYouTubeUrl(raw) !== null
}

/**
 * 저장용 정규화 URL. 유효하지 않으면 null.
 */
export function normalizeYouTubeUrl(raw: string | null | undefined): string | null {
  return parseYouTubeUrl(raw)?.canonical ?? null
}

/**
 * iframe src용 임베드 URL.
 * - 개인정보 향상 모드(youtube-nocookie) 사용
 */
export function toYouTubeEmbedUrl(raw: string): string | null {
  const parsed = parseYouTubeUrl(raw)
  if (!parsed) return null
  return `https://www.youtube-nocookie.com/embed/${parsed.id}?rel=0&modestbranding=1`
}
