/**
 * 카카오 로그인 — 환경 무관 인터페이스.
 *
 * 구현은 환경별 분기:
 *   - web (Capacitor 포함): kakao.web.ts (Supabase OAuth 웹뷰)
 *   - native RN: kakao.native.ts (Phase 2 — @react-native-seoul/kakao-login)
 *
 * Supabase client 는 호출자가 인자로 주입 (DI 패턴) — packages/auth 가
 * @supabase/supabase-js 에 직접 의존하지 않음.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface KakaoLoginOptions {
  /** 로그인 완료 후 돌아올 URL. 미설정 시 환경별 기본값 사용. */
  redirectTo?: string
  /** 회원가입 마커 등 추가 query/state. (예: { signup: '1' }) */
  redirectQuery?: Record<string, string>
}

export interface KakaoLoginResult {
  /** 성공 여부 */
  ok: boolean
  /** 실패 시 사용자 친화 메시지 */
  errorMessage?: string
  /** Native 환경에선 idToken/accessToken 직접 받을 수도 있음 (Phase 2) */
  idToken?: string
  accessToken?: string
}

/**
 * 카카오 로그인 시작.
 *
 * web: Supabase OAuth 흐름 (외부 redirect → /auth/callback 복귀)
 * native: 카카오 SDK native 흐름 (idToken 직접 수신 → Supabase signInWithIdToken)
 *
 * @param supabase Supabase 브라우저 client (web 만 사용, native 는 ignore)
 * @param options redirectTo / redirectQuery
 */
export type KakaoLoginFn = (
  supabase: SupabaseClient,
  options?: KakaoLoginOptions,
) => Promise<KakaoLoginResult>
