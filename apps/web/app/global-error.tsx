'use client'

/**
 * Root layout 자체가 깨졌을 때의 최후의 보루.
 * <html><body> 부터 직접 그려야 함.
 */
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f9fafb',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            padding: '32px 24px',
            textAlign: 'center',
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
            margin: 16,
          }}
        >
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>심각한 오류가 발생했습니다</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
            페이지를 새로고침해 주세요. 문제가 계속되면 운영자에게 알려주세요.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 20px',
              background: '#0066CC',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  )
}
