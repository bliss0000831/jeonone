'use client'

/**
 * (plaza) 라우트 그룹 전용 Error Boundary.
 * 광장 안 어떤 페이지든 렌더 에러 발생 시 헤더/푸터는 유지하고 본문만 교체.
 * (root error.tsx 는 전체 화면 교체 — UX 관점에서 광장 chrome 보존이 더 자연스러움)
 */
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCcw, Home } from 'lucide-react'
import { logErrorWithContext } from '@/lib/logger'

export default function PlazaError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logErrorWithContext('[plaza-error-boundary]', error, {
      digest: error.digest,
      path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    })
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">
            페이지를 불러오지 못했습니다
          </h1>
          <p className="text-sm text-muted-foreground">
            일시적인 문제일 수 있어요. 다시 시도해주세요.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono">
              ID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={reset} size="sm" className="gap-2">
            <RotateCcw className="w-4 h-4" />
            다시 시도
          </Button>
          <Button
            variant="outline"
            size="sm"
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
