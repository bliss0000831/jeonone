import Link from 'next/link'
import { Home, Search } from 'lucide-react'

/**
 * 404 페이지 — 존재하지 않는 라우트 / 잘못된 매물 ID 등 진입 시 표시.
 * Next.js 가 기본 흰 화면 대신 브랜드 일관 디자인으로 노출.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-center">
      <div className="text-7xl font-black text-primary/20 mb-2">404</div>
      <h1 className="text-2xl font-bold text-foreground mb-2">페이지를 찾을 수 없습니다</h1>
      <p className="text-sm text-muted-foreground max-w-sm mb-8">
        요청하신 페이지가 삭제됐거나 주소가 잘못되었습니다.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Home className="w-4 h-4" />
          홈으로
        </Link>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium text-foreground"
        >
          <Search className="w-4 h-4" />
          검색
        </Link>
      </div>
    </div>
  )
}
