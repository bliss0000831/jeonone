/**
 * Sentry 클라이언트 설정 — 브라우저에서 발생하는 에러 캡처.
 *
 * 환경변수: NEXT_PUBLIC_SENTRY_DSN (없으면 자동 disable, 로컬/preview 안전)
 *
 * 최적화 (2026-04 audit 후):
 *   - tracesSampleRate production 0.05 (이전 0.1) — 비용/네트워크 추가 절감
 *   - replayIntegration 제거 — bundle ~50KB 절약, 첫 로드 빠르게
 *     (필요해지면 dynamic import 패턴으로 다시 도입 권장)
 *
 * 멀티-광장: 사용자가 어느 광장에 있는지 tag 로 자동 표시.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // 트랜잭션 샘플링 — production 5% (이전 10%) / dev 100%
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

    // 흔한 무의미 에러 무시
    ignoreErrors: [
      // 외부 스크립트 / 확장 프로그램
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      // 인터넷 끊김
      'Failed to fetch',
      'NetworkError',
      'Load failed',
      // AbortController
      'AbortError',
      'The operation was aborted',
      // 카카오 SDK 무관 에러
      /kakao/i,
      // 광고 차단기
      /chrome-extension/i,
      /moz-extension/i,
    ],

    // breadcrumb 노이즈 줄이기 — 콘솔 로그/UI 클릭 모두 캡처하던 거 제한
    beforeBreadcrumb(breadcrumb) {
      // console.log 는 캡처 안 함 (production 에선 어차피 noop 이지만 dev 도)
      if (breadcrumb.category === 'console' && breadcrumb.level === 'log') return null
      return breadcrumb
    },

    beforeSend(event) {
      // 광장 tag 자동 부착
      if (typeof window !== 'undefined') {
        const host = window.location.hostname
        const m = host.match(/^([a-z-]+)\.gwangjang\.(app|kr)$/)
        if (m) {
          event.tags = { ...event.tags, plaza: m[1] }
        } else if (host.endsWith('gwangjang.app') || host.endsWith('gwangjang.kr')) {
          event.tags = { ...event.tags, plaza: 'hub' }
        }
      }
      return event
    },
  })
}
