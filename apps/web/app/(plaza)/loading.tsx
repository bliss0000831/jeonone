import { Loader2 } from 'lucide-react'

/**
 * (plaza) 라우트 그룹 공통 로딩 — 페이지 진입 시 스켈레톤/스피너 표시.
 * Next.js 가 lazy import / suspense 경계에서 자동 노출.
 */
export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  )
}
