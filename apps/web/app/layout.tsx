import type { Metadata } from 'next'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { VisitorTracker } from '@/components/visitor-tracker'
import { SessionWatcher } from '@/components/session-watcher'
import { PopupLayer } from '@/components/popup-layer'
import { CookieConsent } from '@/components/cookie-consent'
import { PWARegister } from '@/components/pwa-register'
import { PWAInstallBanner } from '@/components/pwa-install-banner'
import { NativeBootstrap } from '@/components/native-bootstrap'
import { AnnouncementBar } from '@/components/announcement-bar'
import { ThemeStyleInjector } from '@/components/theme-style-injector'
import { SiteBrandingProvider } from '@/components/site-branding-provider'
import { SiteFooter } from '@/components/site-footer'
import { Toaster } from '@/components/ui/sonner'
import { SiteLabelsProvider } from '@/components/site-labels-client'
import { SWRProvider } from '@/components/swr-provider'
import { ConfirmProvider } from '@/components/confirm-provider'
import { getAllLabels, getAllLabelImages } from '@/lib/site-labels'
import { plazaCityName } from '@/lib/plaza/city-name'
// generateMetadata 는 unstable_cache 우회 (favicon 이 isolate별로 stale 되는 버그 회피).
// home/page 는 ISR(revalidate=60)로 어차피 1분 단위 캐시되니 추가 부담 없음.
import { fetchSiteSettings } from '@/lib/services/site-settings'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { createClient } from '@/lib/supabase/server'
import './globals.css'

// Pretendard — 한국어 디자이너 디팩토 폰트 (당근/토스/무신사/야놀자 다수 사용).
// Noto Sans KR 대비 한글/영어 균형 + weight 변화 자연스러움.
// CDN 으로 로드 (variable font 단일 파일, fallback 자연스러움).

// 모바일 viewport — 누락 시 일부 브라우저(삼성 인터넷·구형 WebView)가
// 980px 데스크톱 fallback 으로 렌더 → 글자/레이아웃 깨짐.
// width=device-width 로 모든 폰에서 동일한 모바일 레이아웃 강제.
export const viewport: import('next').Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  // iOS 노치 / Dynamic Island / 홈 인디케이터 영역까지 화면 확장.
  // CSS 측에서 env(safe-area-inset-top/bottom/left/right) 로 패딩 처리.
  // Capacitor / iOS Safari standalone 모드에서 필수.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchSiteSettings()

  // 멀티-광장: 광장 서브도메인이면 plazas.name, 허브면 "전국 광장"
  const plaza = await getCurrentPlaza()
  let plazaName: string | null = null
  if (plaza) {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('plazas')
        .select('name')
        .eq('id', plaza)
        .single()
      plazaName = data?.name ?? null
    } catch {
      // 무시 — 폴백으로 site_settings 또는 기본값 사용
    }
  }

  const siteName = plazaName || (plaza ? '전원일기' : '전국 전원일기')
  const title = plaza
    ? `${siteName} - 농기구 직거래·로컬푸드·이웃`
    : `${siteName} - 전국의 농촌을 잇는 플랫폼`
  const description = plaza ? settings.site_description : '지역별 농기구 직거래·대여·경매와 로컬푸드·이웃 커뮤니티를 한 곳에서. 우리 지역 전원일기를 선택해 들어가세요.'
  // favicon 은 브라우저가 며칠씩 캐시 → URL 자체에 hash 를 붙여 강제 갱신.
  // R2 URL 이 바뀌면 hash 도 바뀌므로 자동으로 새 favicon 으로 교체됨.
  const rawLogo = settings.site_logo || '/logo.png?v=3'
  const logoHash = Buffer.from(rawLogo).toString('base64url').slice(0, 8)
  const logo = rawLogo.includes('?') ? `${rawLogo}&_v=${logoHash}` : `${rawLogo}?_v=${logoHash}`
  // robots — production 만 인덱싱 허용. preview / dev / maintenance 는 차단.
  const isProd = process.env.VERCEL_ENV === 'production' && process.env.MAINTENANCE_MODE !== 'true'
  return {
    title,
    description,
    generator: 'v0.app',
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://jeonwondiary.vercel.app'),
    robots: isProd
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      images: [logo],
      type: 'website',
      siteName: title,
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [logo],
    },
    icons: {
      icon: [{ url: logo, sizes: 'any' }],
      apple: logo,
      shortcut: logo,
    },
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      title: '광장',
      statusBarStyle: 'default',
    },
    other: {
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'default',
      'apple-mobile-web-app-title': '광장',
      'application-name': '광장',
      'msapplication-TileColor': '#0066CC',
      'theme-color': '#0066CC',
    },
    // 한국 검색엔진 verification (site_settings 의 seo_meta_tags 키에서 읽음)
    verification: {
      google: (settings as any).seo_meta_tags?.google || undefined,
      other: {
        'naver-site-verification': (settings as any).seo_meta_tags?.naver || '',
      },
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // 슈퍼관리자가 편집 가능한 라벨 (햄버거 메뉴, 섹션 카드 등) 을 한번에 가져와 클라이언트에 흘려보냄
  const [labels, labelImages] = await Promise.all([getAllLabels(), getAllLabelImages()])
  // 라벨 토큰 치환용 변수 — 광장 도시명
  const plaza = await getCurrentPlaza()
  let plazaCity = ""
  if (plaza) {
    try {
      const supabase = await createClient()
      const { data } = await supabase.from('plazas').select('name').eq('id', plaza).single()
      plazaCity = plazaCityName(data?.name || "")
    } catch {}
  }
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Pretendard 폰트 preload — 가장 우선순위. 첫 paint 부터 Pretendard 적용 */}
        <link
          rel="preload"
          href="/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* DNS prefetch + preconnect — 첫 요청 RTT 절감 (Supabase, R2, Kakao, Naver) */}
        <link rel="preconnect" href="https://pub-8bbddd005e4240fabcfd00960d392ecc.r2.dev" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://pub-8bbddd005e4240fabcfd00960d392ecc.r2.dev" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <>
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          </>
        )}
        <link rel="dns-prefetch" href="https://t1.kakaocdn.net" />
        <link rel="dns-prefetch" href="https://oapi.map.naver.com" />
        {/* Naver Maps 타일·정적지도 API — 첫 RTT 절감 */}
        <link rel="dns-prefetch" href="https://map.pstatic.net" />
        <link rel="preconnect" href="https://map.pstatic.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://maps.apigw.ntruss.com" />
        <link rel="preconnect" href="https://maps.apigw.ntruss.com" crossOrigin="anonymous" />
        {/* 관리자 설정 테마색 주입 — globals.css 기본값보다 먼저 깔리지만 cascade 로 덮음 */}
        <ThemeStyleInjector />
        <Script
          src="https://developers.kakao.com/sdk/js/kakao.js"
          strategy="lazyOnload"
        />
      </head>
      <body className={`font-sans antialiased`}>
        {/* a11y: 키보드 사용자가 헤더/네비 건너뛰고 본문으로 바로 갈 수 있게 */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg"
        >
          메인 콘텐츠로 바로가기
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <VisitorTracker />
          <SessionWatcher />
          <PWARegister />
          <NativeBootstrap />
          <AnnouncementBar />
          <PopupLayer />
          <SWRProvider>
            <SiteBrandingProvider>
              <SiteLabelsProvider initial={labels} images={labelImages} vars={{ plaza_city: plazaCity }}>
                <ConfirmProvider>
                  {children}
                </ConfirmProvider>
              </SiteLabelsProvider>
            </SiteBrandingProvider>
          </SWRProvider>
          {/* 푸터 — 어드민/슈퍼어드민 레이아웃은 자체 chrome 사용하므로 plaza/허브에만 노출됨 */}
          <SiteFooter />
          <CookieConsent />
          <PWAInstallBanner />
          <Toaster position="top-center" richColors closeButton />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
