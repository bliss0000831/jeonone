/**
 * 카카오 로그인 — web 구현 (Supabase OAuth 외부 redirect).
 *
 * 흐름:
 *   1. signInWithOAuth({ provider: 'kakao' }) → kauth.kakao.com 이동
 *   2. 사용자 인증 → Supabase 가 token 교환 후 callback 으로 redirect
 *   3. apps/web/app/(auth)/auth/callback/route.ts 가 세션 처리
 *
 * Capacitor 앱도 (live URL 모드라) 이 web 구현 사용.
 * Phase 2 RN 부터 kakao.native.ts 분기.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { KakaoLoginOptions, KakaoLoginResult } from "./kakao"

export async function loginWithKakao(
  supabase: SupabaseClient,
  options: KakaoLoginOptions = {},
): Promise<KakaoLoginResult> {
  // redirectTo 우선순위:
  //   1. 호출자 명시
  //   2. 호출자 redirectQuery 와 조합 (현재 origin 기준 /auth/callback 에 query 부착)
  //   3. window.location.origin 기반 기본
  const redirectTo = options.redirectTo ?? buildDefaultRedirect(options.redirectQuery)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo },
  })

  if (error) {
    return { ok: false, errorMessage: "카카오 로그인에 실패했습니다" }
  }
  // 성공 시 즉시 외부 redirect 발생 → 이 라인 아래는 보통 도달 안 함.
  // 호출자는 ok=true 로 받고 후속 UI 처리 (loading 유지 등) 가능.
  return { ok: true }
}

function buildDefaultRedirect(query?: Record<string, string>): string | undefined {
  if (typeof window === "undefined") return undefined
  const base = `${window.location.origin}/auth/callback`
  if (!query || Object.keys(query).length === 0) return base
  const qs = new URLSearchParams(query).toString()
  return `${base}?${qs}`
}
