/**
 * Next.js instrumentation — Sentry 초기화 진입점.
 * 자동으로 server / edge runtime 별로 적절한 설정 로드.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs'
