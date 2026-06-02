/**
 * 모더레이션 헬퍼 — 업자/스팸 방지 공통 로직
 *
 *   · Rate limit: 하루 N건 제한
 *   · 키워드 필터: DB `moderation_keywords` 에서 관리자 설정 키워드 로드
 *
 *   주의: 모든 함수는 server-side 전용. Supabase client 를 파라미터로 받아
 *   RLS 정책을 따르도록 함.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export const DAILY_POST_LIMIT = 3

export interface KeywordMatch {
  keyword: string
  action: "flag" | "block" | "warn"
  note: string | null
}

/**
 * 지난 24시간 동안 유저가 해당 테이블에 작성한 게시글 수
 */
export async function countUserPostsToday(
  supabase: SupabaseClient,
  userId: string,
  tableName: "secondhand_posts" | "jobs_posts",
): Promise<number> {
  const { data, error } = await supabase.rpc("count_user_posts_today", {
    p_user_id: userId,
    p_table: tableName,
  })
  if (error) {
    console.error("[moderation] count_user_posts_today error:", error)
    return 0
  }
  return typeof data === "number" ? data : 0
}

/**
 * 텍스트 내에서 금지 키워드 검출
 *
 *   scope='all' 키워드는 항상 체크,
 *   scope='secondhand'/'jobs' 키워드는 해당 타입 글에서만 체크
 */
export async function findKeywordMatches(
  supabase: SupabaseClient,
  text: string,
  scope: "secondhand" | "jobs" | "sharing" | "clubs" | "new-store" | "board" | "service-requests",
  plazaId?: string | null,
): Promise<KeywordMatch[]> {
  let query = supabase
    .from("moderation_keywords")
    .select("keyword, action, note, scope")
    .in("scope", ["all", scope])

  if (plazaId) {
    query = query.or(`plaza_id.is.null,plaza_id.eq.${plazaId}`)
  }

  const { data, error } = await query

  if (error || !data) return []

  const lower = text.toLowerCase()
  const matches: KeywordMatch[] = []
  for (const row of data as Array<{
    keyword: string
    action: "flag" | "block" | "warn"
    note: string | null
  }>) {
    if (!row.keyword) continue
    if (lower.includes(row.keyword.toLowerCase())) {
      matches.push({
        keyword: row.keyword,
        action: row.action,
        note: row.note,
      })
    }
  }
  return matches
}

/**
 * 매칭 결과로부터 초기 status/hidden_reason 결정
 *   - block 매칭 있으면: { block: true } → API 에서 400 리턴
 *   - flag 매칭 있으면: status='hidden', hidden_reason=<키워드들>
 *   - warn 만 있으면: 통과하되 로그 남김
 *   - 매칭 없으면: 정상
 */
export function resolveStatusFromMatches(matches: KeywordMatch[]): {
  block: boolean
  status: "active" | "hidden"
  hiddenReason: string | null
  blockReason: string | null
} {
  const blockMatch = matches.find((m) => m.action === "block")
  if (blockMatch) {
    return {
      block: true,
      status: "active",
      hiddenReason: null,
      blockReason: `금지 키워드: ${blockMatch.keyword}`,
    }
  }
  const flags = matches.filter((m) => m.action === "flag")
  if (flags.length > 0) {
    return {
      block: false,
      status: "hidden",
      hiddenReason: `자동 필터: ${flags.map((m) => m.keyword).join(", ")}`,
      blockReason: null,
    }
  }
  return {
    block: false,
    status: "active",
    hiddenReason: null,
    blockReason: null,
  }
}

/**
 * 자동 숨김 임계치 — 누적 신고 수가 이 값 이상이면 자동 hidden 처리
 */
export const AUTO_HIDE_REPORT_THRESHOLD = 3
