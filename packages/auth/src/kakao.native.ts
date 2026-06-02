// TODO: 모바일은 현재 apps/mobile/lib/auth-context.tsx 에서 자체 인증을 구현 중.
// Phase 2 통합 시 이 stub 을 완성하여 mobile 도 @gwangjang/auth 를 직접 사용하도록 전환해야 함.

/**
 * 카카오 로그인 — RN native 구현 (placeholder, Phase 2 에서 구현).
 *
 * Phase 2 시점에 추가:
 *   - 패키지 의존성: @react-native-seoul/kakao-login
 *   - Kakao Developers 콘솔에 Android/iOS 플랫폼 등록 (앱 키, 키 해시)
 *   - SDK 초기화 (init with NEXT_PUBLIC_KAKAO_APP_ID 또는 별도 RN 키)
 *
 * 흐름 (Phase 2):
 *   1. NativeKakao.login() → idToken + accessToken 수신
 *   2. supabase.auth.signInWithIdToken({ provider: 'kakao', token: idToken })
 *      → Supabase 가 토큰 검증 + 세션 발급
 *   3. (선택) 같은 세션을 WebView 측 광장 페이지에 전달 (Set-Cookie API)
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { KakaoLoginOptions, KakaoLoginResult } from "./kakao"

export async function loginWithKakao(
  _supabase: SupabaseClient,
  _options: KakaoLoginOptions = {},
): Promise<KakaoLoginResult> {
  return {
    ok: false,
    errorMessage:
      "카카오 native 로그인은 Phase 2 에서 구현 예정입니다 (@react-native-seoul/kakao-login 통합 필요).",
  }
}
