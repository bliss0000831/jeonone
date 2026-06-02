import type { CapacitorConfig } from "@capacitor/cli"

/**
 * 광장 — Capacitor 설정.
 *
 * 동작 모드:
 *  - 기본 (assembleDebug / Release): WebView 가 항상 https://www.gwangjang.app 가리킴 (live web).
 *    웹 변경이 앱에 즉시 반영. NODE_ENV 분기 X (의도치 않은 dev URL 방지).
 *  - 로컬 라이브 리로드: `pnpm cap:run:android --livereload --external` 또는
 *    CAP_SERVER_URL env 로 URL override. capacitor.config.dev.ts 별도 파일 안 만듦.
 *
 * appId 는 한 번 정한 후 변경 시 스토어 등재가 새 앱으로 인식되니 신중.
 */

// 환경변수로 일시 override 가능 (livereload 등). 기본은 production live URL 고정.
const SERVER_URL = process.env.CAP_SERVER_URL || "https://www.gwangjang.app"
const SERVER_CLEARTEXT = process.env.CAP_SERVER_CLEARTEXT === "true"

const config: CapacitorConfig = {
  appId: "app.gwangjang",
  appName: "광장",
  webDir: "out",  // Next.js export 용 (현재는 사용 안 함, server.url 가 우선)
  server: {
    url: SERVER_URL,
    cleartext: SERVER_CLEARTEXT,  // 기본 false. dev override 시에만 true.
    // androidScheme/iosScheme 로 native scheme 지정 가능 (deep link 받을 때)
    androidScheme: "https",
    iosScheme: "https",
    // 광장 + 외부 SDK / API 도메인 화이트리스트.
    //
    // 원칙:
    //  - 와일드카드(*.example.com) 우선 — 서비스가 서브도메인 추가해도 자동 커버.
    //  - 개별 도메인은 와일드카드로 못 잡는 특수 케이스만.
    //  - 누락 시 WebView 가 navigation 차단 (로그인 redirect / SDK 스크립트 로드 등).
    //  - fetch / XHR / image src 는 별도 (CORS 정책 따름).
    allowNavigation: [
      // ── 광장 자체 ─────────────────────────────────────────
      "*.gwangjang.app",
      "gwangjang.app",

      // ── Supabase ──────────────────────────────────────────
      "*.supabase.co",            // API / Auth / Storage / Realtime
      "*.supabase.in",            // 일부 region

      // ── Cloudflare R2 (이미지 / 동영상) ────────────────────
      "*.r2.dev",                 // pub-* 포함 자동 커버
      "*.r2.cloudflarestorage.com",
      "*.cloudflare.com",         // Workers / Stream 등 향후 사용 대비

      // ── 카카오 (로그인 / 지도 / 우편번호 / SDK) ─────────────
      "*.kakao.com",              // kauth, kapi, dapi, developers, map, accounts ...
      "*.kakaocdn.net",           // t1, k, img1, dn 등 CDN

      // ── 네이버 (로그인 / 지도 / API) ────────────────────────
      "*.naver.com",              // oapi.map, openapi, map ...
      "*.ntruss.com",             // 네이버 클라우드 (지도 API gateway)
      "*.pstatic.net",            // 네이버 이미지 / 정적 CDN

      // ── 결제 (PortOne / Toss / 향후 카카오페이) ──────────────
      "*.portone.io",
      "*.tosspayments.com",
      "*.toss.im",

      // ── Apple (Sign in with Apple — iOS 4.8 의무) ──────────
      "appleid.apple.com",
      "*.apple.com",              // iCloud / 인증 콜백 등

      // ── Google (폰트 / 로그인 / 이미지 / Firebase) ──────────
      "*.googleapis.com",         // fonts.googleapis, firebaseinstallations.googleapis 등
      "*.gstatic.com",            // fonts.gstatic, www.gstatic
      "*.googleusercontent.com",  // lh3.googleusercontent (프로필 이미지) 등
      "accounts.google.com",      // Google 로그인 OAuth
      "*.firebaseio.com",         // Firebase Realtime DB (사용 시)
      "*.firebaseapp.com",        // Firebase hosting / auth
      "fcm.googleapis.com",       // FCM 메시지 send (서버 측이지만 만일)

      // ── Sentry ────────────────────────────────────────────
      "*.sentry.io",
      "browser.sentry-cdn.com",   // sentry CDN (와일드카드 미커버)

      // ── 외부 공공 API (Tour / 데이터 / 날씨) ────────────────
      "*.data.go.kr",             // apis.data.go.kr, www.data.go.kr
      "api.open-meteo.com",
      "korean.visitkorea.or.kr",

      // ── CDN / 외부 이미지 (선택 — 카드 / 매물 외부 링크) ──────
      "cdn.jsdelivr.net",
      "images.unsplash.com",
      "cdn.pixabay.com",
    ],
  },
  plugins: {
    SplashScreen: {
      // launchAutoHide=false → JS 측 SplashScreen.hide() 호출 시점까지 유지.
      // native-bootstrap.tsx 가 WebView 마운트 즉시 hide → 자연스러운 fade-out.
      // launchShowDuration 은 안전망 (JS 호출 못 하는 경우 자동 사라짐).
      // 짧을수록 사용자 체감 속도 좋음 — 2초로 줄임.
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      // 로딩 중 사용자에게 "동작 중" 신호 — 흰 화면 의심 줄임
      showSpinner: true,
      androidSpinnerStyle: "small",
      iosSpinnerStyle: "small",
      spinnerColor: "#0EA5E9",  // 광장 브랜드 primary
      splashFullScreen: true,
      splashImmersive: true,
      launchFadeOutDuration: 300,
    },
    StatusBar: {
      style: "default",  // 광장 테마는 light bg → dark text
      backgroundColor: "#ffffff",
    },
    Keyboard: {
      // resize / style 은 KeyboardResize enum 으로 설정해야 함 (native plugin PR 에서 처리)
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      // FCM/APNs 토큰 받아서 서버 등록 — 앱 내부에서 처리
      presentationOptions: ["badge", "sound", "alert"],
    },
    Camera: {
      // 권한 요청 메시지 (iOS Info.plist 와 같이 동작)
    },
    Geolocation: {
      // 권한 요청 메시지
    },
  },
  android: {
    // dev 시에만 cleartext / debugging 활성. 기본 production 안전.
    allowMixedContent: SERVER_CLEARTEXT,
    captureInput: true,
    webContentsDebuggingEnabled: SERVER_CLEARTEXT,
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
    backgroundColor: "#ffffff",
    // 사용자가 앱 로드 중 흰 화면 보지 않게
    limitsNavigationsToAppBoundDomains: false,
  },
}

export default config
