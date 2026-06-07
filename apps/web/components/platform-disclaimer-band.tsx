/**
 * 통신판매중개자 면책 띠 — 서비스 메인 페이지 하단 (footer 위) 노출.
 *
 * 푸터 디스클레이머와 중복으로 보일 수 있지만, 모바일 BottomNav 영역과
 * 푸터 사이의 좁은 영역에서 사용자가 스크롤 끝에 도달했을 때 한 번 더 안내.
 * 모바일 앱의 PlatformDisclaimerBand 와 시각적 페어리티 유지.
 *
 * 누르면 약관 페이지로 이동.
 */
import Link from 'next/link'
import { Info } from 'lucide-react'

export function PlatformDisclaimerBand({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/terms"
      className={`mx-3 my-4 flex items-start gap-2 rounded-lg border border-border bg-muted/60 p-4 text-sm text-stone-600 hover:bg-muted transition-colors md:mx-0 ${className}`}
    >
      <Info className="w-5 h-5 mt-0.5 shrink-0" />
      <span className="leading-relaxed">
        본 플랫폼은 통신판매중개자로서 거래 당사자가 아닙니다.{' '}
        <span className="text-primary font-bold">자세히 →</span>
        <span className="block mt-1 text-stone-600">
          게시 상품·매물·서비스의 정확성·적법성 및 거래 이행의 책임은 등록자에게 있습니다.
        </span>
      </span>
    </Link>
  )
}
