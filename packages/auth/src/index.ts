/**
 * @gwangjang/auth — 광장 인증 추상화.
 *
 * 현재 (M9) 범위: 카카오 로그인 환경별 분기만.
 *   - web (Capacitor 포함): Supabase OAuth 외부 redirect
 *   - native (RN, Phase 2): Kakao SDK native + signInWithIdToken
 *
 * 추가 예정 (Phase 2):
 *   - signOut, getCurrentUser, signInWithPassword 등 통합 추상화
 *   - WebView ↔ RN 세션 동기화 API
 *
 * 사용:
 *   import { loginWithKakao } from "@gwangjang/auth/kakao"
 *   import { createClient } from "@/lib/supabase/client"
 *
 *   const supabase = createClient()
 *   const result = await loginWithKakao(supabase, { redirectQuery: { signup: "1" } })
 *   if (!result.ok) setError(result.errorMessage)
 */

export type { KakaoLoginOptions, KakaoLoginResult, KakaoLoginFn } from "./kakao"

// 환경 분기:
//   - 웹 / Capacitor: kakao.web.ts (현재 M9 의 유일 동작 구현)
//   - RN: 메트로 번들러가 platform.native.ts 자동 우선 픽업 (Phase 2)
//
// 명시적으로 web 구현을 export — RN 시점엔 kakao.native.ts 가
// 동일 함수명을 export 하므로 호출자 코드 변경 불필요.
export { loginWithKakao } from "./kakao.web"
