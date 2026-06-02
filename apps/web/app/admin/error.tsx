'use client'

/**
 * /admin 그룹 Error Boundary — 어드민 페이지 렌더 실패 시 안내.
 */
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCcw, ArrowLeft } from 'lucide-react'
import { logErrorWithContext } from '@/lib/logger'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logErrorWithContext('[admin-error-boundary]', error, {
      digest: error.digest,
      path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    })
  }, [error])

  return (
    <div className="min-h-[40vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">
            어드민 페이지 오류
          </h1>
          <p className="text-sm text-muted-foreground">
            데이터 조회 중 문제가 발생했습니다. 새로고침 또는 다시 시도해주세요.
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
              window.history.back()
            }}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            뒤로
          </Button>
        </div>
      </div>
    </div>
  )
}
