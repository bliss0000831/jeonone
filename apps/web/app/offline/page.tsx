/**
 * Offline fallback — Service Worker 가 네트워크 실패 시 표시.
 *
 * 정적 페이지 (DB 의존 X) 라 캐시에서 안전하게 노출 가능.
 */
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "오프라인",
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-muted-foreground"
          >
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" x2="12.01" y1="20" y2="20" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">인터넷 연결 끊김</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          네트워크 연결을 확인해주세요.
          <br />
          연결이 복구되면 자동으로 다시 접속됩니다.
        </p>
        <div className="pt-4">
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            홈으로 새로고침
          </Link>
        </div>
      </div>
    </div>
  )
}
