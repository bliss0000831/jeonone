/**
 * Sentry 서버 설정 — Next.js API 라우트 / 서버 컴포넌트에서 발생하는 에러 캡처.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    ignoreErrors: [
      // Supabase Auth 유효 만료 (정상 흐름)
      /JWT expired/,
      /Auth session missing/,
    ],
  })
}
