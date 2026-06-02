'use client'

/**
 * Next.js App Router 의 페이지 단위 Error Boundary.
 * 페이지 렌더 중 에러 발생 시 깨진 UI 대신 사용자 친화 메시지 표시.
 *
 * - reset() 버튼: 컴포넌트 트리 재마운트
 * - Sentry 가 활성이면 자동 캡처 (next/sentry instrumentation 으로 처리)
 */
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCcw, Home } from 'lucide-react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[error-boundary]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            문제가 발생했습니다
          </h1>
          <p className="text-sm text-muted-foreground">
            잠시 후 다시 시도해주세요. 문제가 계속되면 운영자에게 문의해주세요.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono mt-2">
              ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={reset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            다시 시도
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = '/'
            }}
            className="gap-2"
          >
            <Home className="w-4 h-4" />
            홈으로
          </Button>
        </div>
      </div>
    </div>
  )
}
