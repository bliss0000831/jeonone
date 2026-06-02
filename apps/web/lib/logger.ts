/**
 * 환경별 로거 — production 에선 verbose 로그 노출 방지 + Sentry 자동 연동.
 *
 * - devLog / devWarn: NODE_ENV !== 'production' 에서만 출력
 * - logError: 항상 출력 + Sentry 가용 시 자동 captureException
 * - logErrorWithContext: 추가 context (route, user_id 등) 포함해서 Sentry 전송
 *
 * 보안: 무작정 console.log(user) 같은 코드는 토큰/이메일 등이 서버 로그에
 * 흘러들어가 모니터링 서비스로 새는 위험이 있다. devLog 로 감싸면
 * production 에선 자동 무음.
 *
 * Sentry 동적 import — sentry 미설치/no-op 환경에서도 안전.
 */

const isDev = process.env.NODE_ENV !== 'production'

export function devLog(...args: any[]): void {
  if (isDev) console.log(...args)
}

export function devWarn(...args: any[]): void {
  if (isDev) console.warn(...args)
}

/**
 * 에러는 production 에서도 로깅.
 * 첫 인자가 Error 인스턴스면 Sentry captureException 으로 전송.
 * (DSN 없으면 자동 no-op)
 */
export function logError(...args: any[]): void {
  console.error(...args)

  // Sentry 자동 캡처 — 첫 Error 인스턴스만
  const errArg = args.find((a) => a instanceof Error)
  if (errArg) {
    void captureToSentry(errArg, { extra: { args: args.filter((a) => !(a instanceof Error)) } })
  }
}

/**
 * 명시적 컨텍스트와 함께 Sentry 전송.
 *   logErrorWithContext('order create failed', err, { route: '/api/orders', userId })
 */
export function logErrorWithContext(
  message: string,
  error: unknown,
  context?: Record<string, any>,
): void {
  console.error(message, error, context)
  const err = error instanceof Error ? error : new Error(String(error))
  void captureToSentry(err, { tags: { source: message }, extra: context })
}

async function captureToSentry(
  err: Error,
  options?: { tags?: Record<string, string>; extra?: Record<string, any> },
): Promise<void> {
  try {
    // 동적 import — Sentry 미설치 시 fail-soft
    const Sentry = await import('@sentry/nextjs').catch(() => null)
    if (!Sentry) return
    Sentry.withScope((scope: any) => {
      if (options?.tags) {
        for (const [k, v] of Object.entries(options.tags)) scope.setTag(k, v)
      }
      if (options?.extra) {
        for (const [k, v] of Object.entries(options.extra)) scope.setExtra(k, v)
      }
      Sentry.captureException(err)
    })
  } catch {
    // Sentry 자체 실패는 무시 (로깅은 console.error 로 이미 됨)
  }
}
