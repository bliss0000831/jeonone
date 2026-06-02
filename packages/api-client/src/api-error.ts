/**
 * API 에러 응답 헬퍼.
 *
 * 클라이언트엔 일반화된 사용자 친화 메시지를, 서버 로그엔 raw 에러 풀스택을 남긴다.
 * Supabase / Postgres raw 에러를 그대로 노출하면 테이블·컬럼·제약 이름이 새어
 * 스키마 추정 단서가 되므로 절대 클라이언트로 넘기지 말 것.
 */

import { NextResponse } from "next/server"

/**
 * 일반 에러 응답.
 * @param tag 로그 식별 태그 (예: "/api/admin/users")
 * @param err 원본 에러 객체 (Supabase PostgrestError, Error, 또는 unknown)
 * @param status HTTP 상태 코드 (기본 500)
 * @param userMessage 클라이언트에 노출할 메시지 (기본: "처리에 실패했습니다")
 */
export function apiError(
  tag: string,
  err: unknown,
  status = 500,
  userMessage = "처리에 실패했습니다",
): NextResponse {
  // 서버 로그엔 raw — Vercel logs / Sentry 에서 디버깅 가능
  console.error(`[${tag}]`, err)
  return NextResponse.json({ error: userMessage }, { status })
}

/** 인증 누락. */
export function apiAuthRequired(): NextResponse {
  return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
}

/** 권한 부족. */
export function apiForbidden(message = "권한이 없습니다"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 })
}

/** 잘못된 요청. */
export function apiBadRequest(message = "요청이 올바르지 않습니다"): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** 리소스 없음. */
export function apiNotFound(message = "찾을 수 없습니다"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}
