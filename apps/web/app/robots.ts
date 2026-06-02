/**
 * robots.txt 동적 생성.
 *
 * 멀티-광장: 모든 plaza subdomain 에서 같은 정책. /admin /super-admin /api
 * 는 크롤링 차단.
 */
import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://gwangjang.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/super-admin',
          '/super-admin/*',
          '/api',
          '/api/*',
          '/auth',
          '/auth/*',
          '/mypage',
          '/mypage/*',
        ],
      },
      // 한국 검색엔진
      {
        userAgent: 'Yeti', // Naver
        allow: '/',
        disallow: ['/admin', '/admin/*', '/super-admin', '/super-admin/*', '/api', '/api/*'],
      },
      {
        userAgent: 'Daum', // Daum/Kakao
        allow: '/',
        disallow: ['/admin', '/admin/*', '/super-admin', '/super-admin/*', '/api', '/api/*'],
      },
      // AI 봇 차단 (선택)
      {
        userAgent: 'GPTBot',
        disallow: '/',
      },
      {
        userAgent: 'CCBot',
        disallow: '/',
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
