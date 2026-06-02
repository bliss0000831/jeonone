import { withSentryConfig } from '@sentry/nextjs'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // gzip/brotli 압축 — Node.js 서버 모드에서 HTML/JS/CSS 응답 압축 (Vercel Edge 에선 자동으로 처리되지만, 명시로 서버 모드 fallback 보장)
  compress: true,
  // 모노레포 워크스페이스 패키지를 Next 가 직접 컴파일 (사전 빌드 step 불필요).
  // M4~M9 에서 추출되는 모든 packages/* 가 여기 등록.
  transpilePackages: [
    "@gwangjang/platform",
    "@gwangjang/features",
    "@gwangjang/types",
    "@gwangjang/api-client",
    "@gwangjang/auth",
  ],
  typescript: {
    // 타입 에러는 빌드 차단 — 런타임에 인증/권한 우회 같은 사고를 사전에 잡음
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      { protocol: 'https', hostname: 'pub-8bbddd005e4240fabcfd00960d392ecc.r2.dev' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.pixabay.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'k.kakaocdn.net' },
      { protocol: 'https', hostname: 'img1.kakaocdn.net' },
      { protocol: 'https', hostname: 'phinf.pstatic.net' },
      { protocol: 'https', hostname: 'ssl.pstatic.net' },
    ],
    localPatterns: [
      { pathname: '/api/**' },
      // public 폴더 로컬 이미지(배너/로고/아이콘 등) 허용 — Next 16 은 미지정 시 차단
      { pathname: '/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    // 홈/매물 카드 폭이 max ~600-800px 이라 1920 변형은 거의 안 쓰임 → 제거 (변환 CPU 절약)
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [64, 96, 128, 256, 384],
    // 외부 CDN 이미지는 7일 캐시 — 자주 바뀌지 않는 프로필/썸네일 재변환 비용 절감
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@radix-ui/react-icons',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      'sonner',
      'swr',
    ],
  },
  // 보안 헤더 — clickjacking / TLS-stripping / MIME sniff / XSS / referrer leak / 권한
  async headers() {
    // CSP — 외부 SDK (카카오, 네이버, 토스, sentry) 까지 포함
    // unsafe-inline 은 Tailwind CSS-in-JS 와 next.js inline script 때문에 필요. nonce 도입 전까진 유지.
    const csp = [
      "default-src 'self'",
      // unsafe-inline / unsafe-eval — Next.js inline bootstrap + Tailwind 런타임 + Sentry 때문에 유지. nonce 도입 전까지 제거 불가.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.kakaocdn.net https://*.kakaocdn.net https://developers.kakao.com https://*.kakao.com https://*.daumcdn.net https://oapi.map.naver.com https://*.map.naver.com https://*.pstatic.net https://js.tosspayments.com https://*.tosspayments.com https://*.toss.im https://browser.sentry-cdn.com https://*.sentry.io https://*.youtube.com https://www.youtube-nocookie.com https://*.ytimg.com https://*.instagram.com https://*.cdninstagram.com https://*.vercel-analytics.com https://*.vercel-insights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://*.r2.dev https://*.r2.cloudflarestorage.com https://oapi.map.naver.com https://*.map.naver.com https://*.pstatic.net https://*.naver.com https://kapi.kakao.com https://dapi.kakao.com https://map.kakao.com https://*.kakao.com https://*.kakaocdn.net https://*.daumcdn.net https://*.tosspayments.com https://*.toss.im https://*.sentry.io https://*.youtube.com https://www.youtube-nocookie.com https://*.ytimg.com https://*.instagram.com https://*.cdninstagram.com https://*.vercel-analytics.com https://*.vercel-insights.com https://api.openrouteservice.org https://nominatim.openstreetmap.org https://*.googleapis.com",
      "frame-src 'self' https://*.tosspayments.com https://*.toss.im https://accounts.kakao.com https://*.kakao.com https://*.youtube.com https://www.youtube-nocookie.com https://*.instagram.com",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; ')
    return [
      // 자체 호스팅 폰트 — 내용이 바뀌면 파일명을 교체하므로 1년 immutable 캐시 적용
      {
        source: '/:file(.*\\.(?:woff2?|ttf|otf|eot))',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // public 폴더 정적 이미지/아이콘 — 파일명 버전 관리 전제로 1년 캐시
      {
        source: '/:file(.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico))',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // manifest.json / browserconfig.xml 등 PWA 메타파일 — 1일 캐시
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          // HSTS — 첫 방문 후 브라우저가 항상 HTTPS 강제. 2년 + 서브도메인 + preload
          // 주의: 이 헤더 적용 후엔 HTTP 로 돌아갈 수 없음. 도메인 확정 후 활성화 권장
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // CSP enforce — 위 화이트리스트에 포함되지 않은 외부 리소스는 차단됨.
          // 카카오/네이버/토스/YouTube/Vercel/Supabase/R2/Sentry 모두 명시. 누락 발견 시 위 csp 배열에 추가.
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

// Sentry 옵션 — DSN 없으면 자동 no-op
const sentryOptions = {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  disableLogger: true,
  // 빌드 시 Sentry CLI 가 source map 업로드 — TOKEN 없으면 skip
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring', // ad-blocker 우회
  // release 태깅 — Vercel 빌드 SHA 기반. 어느 커밋에서 발생한 에러인지 추적.
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE,
  },
}

export default withBundleAnalyzer(
  process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
    ? withSentryConfig(nextConfig, sentryOptions)
    : nextConfig,
)
