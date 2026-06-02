# `@gwangjang/auth`

광장 **인증 추상화** — 환경별 분기 (web / RN native).

## ⚠️ M9 범위 (현재)

이 PR 에선 **카카오 로그인만** 추상화. 옵션 1 (최소).

| 영역 | 처리 |
|---|---|
| 카카오 로그인 (`signInWithOAuth({provider:'kakao'})`) | ✅ M9 추상화 |
| 이메일 로그인 (`signInWithPassword`) | ❌ 광장 카카오 위주 — 우선순위 낮음 |
| 로그아웃 (`signOut`) | ❌ Phase 2 일괄 처리 |
| 현재 사용자 (`getUser`) | ❌ Phase 2 |
| WebView ↔ RN 세션 동기화 | ❌ Phase 2 (RN 앱 만들 때) |

## 구조

```
packages/auth/src/
├── kakao.ts          ← 인터페이스 (KakaoLoginOptions, KakaoLoginResult)
├── kakao.web.ts      ← Supabase OAuth 외부 redirect (현재 동작)
├── kakao.native.ts   ← Phase 2 placeholder (throw 안내 메시지)
└── index.ts          ← 환경별 export (현재는 .web 만)
```

## 사용

```ts
import { loginWithKakao } from "@gwangjang/auth"
import { createClient } from "@/lib/supabase/client"

// 일반 로그인
const supabase = createClient()
const result = await loginWithKakao(supabase)
if (!result.ok) setError(result.errorMessage)

// 회원가입 페이지에서 (signup=1 마커)
const result = await loginWithKakao(supabase, {
  redirectQuery: { signup: "1" },
})

// 또는 redirectTo 직접 지정
const result = await loginWithKakao(supabase, {
  redirectTo: "https://www.gwangjang.app/auth/callback?from=property",
})
```

## DI 패턴 — 왜 supabase 를 인자로?

`@gwangjang/auth` 는 `@supabase/supabase-js` 를 **peer + optional** 로만 의존.
직접 client 를 만들지 않음. 이유:

1. **순환 의존 방지** — apps/web 의 `lib/supabase/client.ts` 가 SSR 쿠키 등
   환경별 처리 필요 → 호출자가 자기 환경에 맞는 client 를 주입.
2. **RN 호환** — Phase 2 RN 도 자기 AsyncStorage 기반 client 를 만들어 주입.
3. **테스트 용이** — mock client 로 단위 테스트 가능.

## RN 시점 (Phase 2)

`kakao.native.ts` 가 placeholder. 채워야 할 것:

```ts
// 1. 의존성 추가 (apps/mobile/package.json)
"@react-native-seoul/kakao-login": "^x.x.x"

// 2. kakao.native.ts 구현
import { login as kakaoSDKLogin } from "@react-native-seoul/kakao-login"

export async function loginWithKakao(supabase, options) {
  const tokens = await kakaoSDKLogin()
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "kakao",
    token: tokens.idToken,
  })
  return error
    ? { ok: false, errorMessage: "카카오 native 로그인 실패" }
    : { ok: true, idToken: tokens.idToken, accessToken: tokens.accessToken }
}

// 3. index.ts 환경 분기 추가 — Metro 가 .native.ts 자동 우선 픽업
//    (또는 명시적 platform 분기)
```

추가 사항:
- Kakao Developers 콘솔: Android/iOS 플랫폼 등록 + 키 해시
- Supabase Auth: ID Token 검증 활성화
- (선택) WebView 세션 동기화 API (Set-Cookie via API route)
