'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { FooterSettings } from './site-footer'
import type { BusinessInfo } from '@/lib/plaza/business-info'

export function SiteFooterClient({
  settings,
  business,
}: {
  settings: FooterSettings
  business?: BusinessInfo
}) {
  const pathname = usePathname() || ''
  // 어드민/슈퍼어드민/인증 등 자체 chrome 보유 영역에선 숨김
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/super-admin') ||
    pathname.startsWith('/plaza-admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth')
  ) {
    return null
  }

  const copyright =
    settings.copyright ||
    `© ${new Date().getFullYear()} 전원일기. All rights reserved.`
  const links = Array.isArray(settings.links)
    ? settings.links.filter((l) => l.label && l.href)
    : []
  const sns = settings.sns || {}
  const showSns = settings.show_sns !== false

  // 사업자 정보 한 줄 (빈 필드는 자동 생략). 핵심 3개(상호/대표자/사업자번호) 가
  // 채워진 경우에만 노출.
  const biz = business
  const businessParts: Array<{ k: string; v: string }> = []
  if (biz?.business_name?.trim()) businessParts.push({ k: '상호', v: biz.business_name.trim() })
  if (biz?.ceo_name?.trim()) businessParts.push({ k: '대표자', v: biz.ceo_name.trim() })
  if (biz?.business_number?.trim()) businessParts.push({ k: '사업자등록번호', v: biz.business_number.trim() })
  if (biz?.mailorder_number?.trim()) businessParts.push({ k: '통신판매업', v: biz.mailorder_number.trim() })
  if (biz?.address?.trim()) businessParts.push({ k: '주소', v: biz.address.trim() })
  if (biz?.phone?.trim()) businessParts.push({ k: '연락처', v: biz.phone.trim() })
  if (biz?.email?.trim()) businessParts.push({ k: '이메일', v: biz.email.trim() })
  const showBusinessLine = businessParts.length >= 3

  return (
    <footer className="mt-12 border-t border-border bg-muted/40 pb-20 md:pb-0">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
        {links.length > 0 && (
          <nav className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
            {links.map((l, i) => (
              <Link
                key={i}
                href={l.href}
                className="hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        {/* 법적 페이지 링크 — 항상 노출 (관리자 미설정 시에도 보장) */}
        <nav className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <Link href="/terms" className="hover:text-foreground transition-colors">이용약관</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors font-medium">개인정보처리방침</Link>
          <Link href="/help/prohibited-items" className="hover:text-foreground transition-colors">금지품목</Link>
        </nav>

        {/* 통신판매중개자 면책 고지 — 모든 페이지 푸터 상시 노출 (전상법 제20조의2) */}
        <div className="mb-4 rounded-md border border-border/60 bg-background/60 p-3 text-xs leading-relaxed">
          <p className="mb-1 font-medium text-foreground">통신판매중개자 안내</p>
          <p>
            본 서비스는 「전자상거래 등에서의 소비자보호에 관한 법률」 제20조에 따른 통신판매중개자로서,
            거래의 당사자가 아닙니다. 게시된 매물·상품·서비스 정보의 정확성·적법성 및 거래 이행에 대한 책임은
            등록자(공인중개사, 사업자, 게시자)에게 있으며, 본 플랫폼은 이를 보증하지 않습니다.
          </p>
        </div>

        {/* 사업자 정보 라인 — 관리자가 입력한 경우에만 표시 */}
        {showBusinessLine && (
          <div className="mb-4 text-xs space-y-0.5">
            <p className="flex flex-wrap gap-x-3 gap-y-0.5">
              {businessParts.map((p, i) => (
                <span key={i}>
                  <span className="text-muted-foreground/70">{p.k}:</span>{' '}
                  <span>{p.v}</span>
                  {i < businessParts.length - 1 && <span className="text-muted-foreground/40 ml-3">|</span>}
                </span>
              ))}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p>{copyright}</p>
          {showSns && (sns.instagram || sns.youtube || sns.blog) && (
            <div className="flex gap-3">
              {sns.instagram && (
                <a
                  href={sns.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  Instagram
                </a>
              )}
              {sns.youtube && (
                <a
                  href={sns.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  YouTube
                </a>
              )}
              {sns.blog && (
                <a
                  href={sns.blog}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  Blog
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  )
}
