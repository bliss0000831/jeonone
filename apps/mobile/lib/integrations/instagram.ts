/**
 * 인스타그램 포스트 URL 유틸리티 (모바일)
 *
 * apps/web/lib/integrations/instagram.ts 에서 포팅.
 * - 유효한 Instagram post/reel/tv URL 검증
 * - 쿼리스트링·소스 파라미터 제거해 canonical 형태로 정규화
 */

export type InstagramMediaKind = "p" | "reel" | "tv"

/**
 * instagram.com/p/{code}, /reel/{code}, /tv/{code} 형태 URL만 허용.
 * 호스트가 www.instagram.com / instagram.com / m.instagram.com 인지 확인.
 * 유효하지 않으면 null 반환.
 */
export function parseInstagramUrl(raw: string | null | undefined): {
  kind: InstagramMediaKind
  code: string
  canonical: string // e.g. https://www.instagram.com/p/Abc123/
} | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "")
  if (host !== "instagram.com") return null

  // /p/{code}/ 또는 /reel/{code}/ 또는 /tv/{code}/
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts.length < 2) return null
  const [segment, code] = parts
  if (!["p", "reel", "tv"].includes(segment)) return null
  // 코드 안전 검증(영숫자/하이픈/언더스코어만)
  if (!/^[A-Za-z0-9_-]{5,20}$/.test(code)) return null

  const canonical = `https://www.instagram.com/${segment}/${code}/`
  return {
    kind: segment as InstagramMediaKind,
    code,
    canonical,
  }
}

export function isValidInstagramPostUrl(raw: string | null | undefined): boolean {
  return parseInstagramUrl(raw) !== null
}

/**
 * 저장용 정규화 URL (canonical). 유효하지 않으면 null.
 */
export function normalizeInstagramUrl(raw: string | null | undefined): string | null {
  return parseInstagramUrl(raw)?.canonical ?? null
}
