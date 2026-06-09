/**
 * 광장 PWA Service Worker (vanilla, framework 독립)
 *
 * 전략:
 *  - app shell (정적 자원) cache-first
 *  - API 호출 network-first (rate limit / 인증 의존이라 stale 위험)
 *  - 이미지 stale-while-revalidate (R2 / Supabase)
 *  - offline fallback 페이지 (/offline)
 *
 * 주의: SW 변경 시 SW_VERSION 올리면 옛 캐시 자동 정리.
 */

const SW_VERSION = 'v1.2.0'
const CACHE_PREFIX = 'gwangjang-'
const STATIC_CACHE = `${CACHE_PREFIX}static-${SW_VERSION}`
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${SW_VERSION}`
const IMAGE_CACHE = `${CACHE_PREFIX}image-${SW_VERSION}`
// 폰트는 별도 캐시 (1년 이상 보존, 버전 bump 시에도 유지하고 싶지만
// 일단 버전에 묶어 단순화 — Pretendard 자체호스트는 거의 안 바뀜)
const FONT_CACHE = `${CACHE_PREFIX}font-${SW_VERSION}`
// Next 빌드 정적 자원 (immutable hash URL — _next/static/*)
const NEXT_STATIC_CACHE = `${CACHE_PREFIX}next-static-${SW_VERSION}`

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/offline',
  '/icon-192.png',
  '/icon-512.png',
]

// 설치
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      // 일부 실패해도 install 진행 (offline 페이지가 아직 없을 수 있음)
      await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)))
      await self.skipWaiting()
    })(),
  )
})

// 활성화 — 옛 버전 캐시 정리 + Navigation Preload 활성화
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Navigation Preload: SW 부팅(콜드 스타트 ~50ms)과 네트워크 요청을 병렬화.
      // 첫 페이지 진입 시 SW 가 깰 동안 멈춰있던 네트워크가 즉시 시작 → 100~200ms 절감.
      // HTML 분기 (networkFirstHtml) 가 event.preloadResponse 로 미리 받음.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable()
        } catch (e) {
          // Safari 등 일부 브라우저 미지원 — 무시
        }
      }
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && !k.endsWith(SW_VERSION))
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

// fetch — 자원 종류별 분기
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 0) ⚠️ RSC / Next 라우터 데이터 요청은 절대 캐시하지 않음 (network only).
  //    App Router 의 soft navigation 은 `?_rsc=` 쿼리 + `RSC: 1` 헤더로 RSC payload 를
  //    가져온다. 이걸 cache-first 로 서빙하면 옛 배포의 payload(옛 buildId)가 나가고,
  //    HTML(network-first, 최신 buildId)과 불일치 → Next.js 가 deployment-skew 로 판단해
  //    하드 리로드 → 무한 새로고침 루프가 된다. 따라서 항상 네트워크에서 받는다.
  const accept = request.headers.get('accept') || ''
  if (
    url.searchParams.has('_rsc') ||
    request.headers.get('rsc') === '1' ||
    request.headers.get('next-router-prefetch') === '1' ||
    accept.includes('text/x-component')
  ) {
    event.respondWith(fetch(request))
    return
  }

  // 1) Supabase / API 호출은 항상 network (인증 / 광장 의존)
  //    실패 시에만 캐시 fallback
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.endsWith('supabase.co') ||
    url.hostname.endsWith('supabase.in')
  ) {
    event.respondWith(networkFirst(request))
    return
  }

  // 2) 이미지 (R2 / Supabase / Next 이미지)
  if (
    url.pathname.startsWith('/_next/image') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|avif|svg|gif)$/i) ||
    url.hostname.endsWith('r2.dev') ||
    url.hostname.endsWith('r2.cloudflarestorage.com')
  ) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE))
    return
  }

  // 3) 폰트 — Pretendard 등 woff2/woff/ttf. 거의 안 바뀜 → cache-first 1년.
  //    별도 FONT_CACHE 로 격리. 버전 bump 시에도 살아남게 추후 분리 가능.
  if (
    url.pathname.match(/\.(woff2|woff|ttf|otf)$/i) ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'fonts.googleapis.com'
  ) {
    event.respondWith(cacheFirstWith(request, FONT_CACHE))
    return
  }

  // 4) Next 빌드 immutable 정적 자원 (_next/static/chunks, _next/static/css 등).
  //    URL 자체에 hash 가 박혀 있어 변경 시 URL 도 바뀜 → cache-first 안전.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstWith(request, NEXT_STATIC_CACHE))
    return
  }

  // 5) HTML 페이지 — network-first + offline fallback (Navigation Preload 활용)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstHtml(event))
    return
  }

  // 6) 기타 정적 자원 — cache-first
  event.respondWith(cacheFirst(request))
})

async function networkFirst(request) {
  try {
    const res = await fetch(request)
    if (res.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, res.clone())
    }
    return res
  } catch (err) {
    const cached = await caches.match(request)
    if (cached) return cached
    throw err
  }
}

async function networkFirstHtml(event) {
  const request = event.request
  try {
    // Navigation Preload 가 활성화되어있으면 preloadResponse 우선 사용.
    // SW 부팅 동안 병렬로 받아둔 응답이라 latency 50~200ms 절감.
    const preload = await event.preloadResponse
    if (preload) return preload
    const res = await fetch(request)
    return res
  } catch (err) {
    const cached = await caches.match(request)
    if (cached) return cached
    return caches.match('/offline')
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) {
    const cache = await caches.open(STATIC_CACHE)
    cache.put(request, res.clone())
  }
  return res
}

// cacheFirst 의 일반화 버전 — 캐시 이름 지정 (폰트/Next static 분리용)
async function cacheFirstWith(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(request, res.clone())
    return res
  } catch (err) {
    if (cached) return cached
    throw err
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone())
    return res
  }).catch(() => cached)
  return cached || fetchPromise
}

// 메시지 — 클라이언트가 SW 강제 갱신 요청
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
