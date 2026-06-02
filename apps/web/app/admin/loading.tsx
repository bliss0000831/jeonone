import { Loader2 } from 'lucide-react'

/**
 * /admin 그룹 공통 로딩 — 어드민 chrome 안에서 본문만 스피너로 표시.
 */
export default function AdminLoading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  )
}
