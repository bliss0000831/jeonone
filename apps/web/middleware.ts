import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Maintenance mode — env MAINTENANCE_MODE + DB site_settings 이중 체크.
 *
 * 우선순위:
 *  1. MAINTENANCE_MODE env = 'true'  → 즉시 점검 모드 (배포 단위 제어)
 *  2. MAINTENANCE_MODE env = 'false' → 강제 off (env 우선)
 *  3. env 미설정 → DB site_settings.maintenance_mode 확인 (관리자 UI 제어)
 *
 * 예외: /maintenance, /api/health, _next 정적 자원, 슈퍼관리자 우회 쿠키.
 *   - admin/maintenance API 는 점검 중에도 접근 가능 (관리자가 해제할 수 있게)
 */

// DB 점검 상태 in-memory 캐시 (edge isolate 내 유효)
// Stale-while-revalidate: 캐시가 있으면 즉시 반환 + 백그라운드 갱신
// → P1 해결: 사용자 요청에 외부 HTTP 왕복 레이턴시 추가 없음
let _maintenanceCache: { enabled: boolean; ts: number } | null = null
const CACHE_TTL = 30_000
let _refreshing = false

async function fetchMaintenanceFromDB(): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return false
    const res = await fetch(
      `${url}/rest/v1/site_settings?key=eq.maintenance_mode&select=value`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      },
    )
    if (!res.ok) return _maintenanceCache?.enabled ?? false
    const data = await res.json()
    const raw = data?.[0]?.value
    const enabled = raw === true || raw === 'true'
    _maintenanceCache = { enabled, ts: Date.now() }
    return enabled
  } catch {
    return _maintenanceCache?.enabled ?? false
  } finally {
    _refreshing = false
  }
}

async function checkMaintenanceFromDB(): Promise<boolean> {
  const now = Date.now()
  // 캐시 없음 → 첫 요청만 blocking fetch (cold start)
  if (!_maintenanceCache) {
    return fetchMaintenanceFromDB()
  }
  // 캐시 유효 → 즉시 반환
  if (now - _maintenanceCache.ts < CACHE_TTL) {
    return _maintenanceCache.enabled
  }
  // 캐시 만료 → stale 값 즉시 반환 + 백그라운드 갱신
  if (!_refreshing) {
    _refreshing = true
    // void: 백그라운드에서 갱신, 현재 요청은 기다리지 않음
    void fetchMaintenanceFromDB()
  }
  return _maintenanceCache.enabled
}

async function isMaintenanceActive(): Promise<boolean> {
  // env 명시 설정이 있으면 우선
  if (process.env.MAINTENANCE_MODE === 'true') return true
  if (process.env.MAINTENANCE_MODE === 'false') return false
  // env 미설정 → DB 체크
  return checkMaintenanceFromDB()
}

export async function middleware(request: NextRequest) {
  if (await isMaintenanceActive()) {
    const path = request.nextUrl.pathname
    const allow =
      path === '/maintenance' ||
      path.startsWith('/api/health') ||
      path === '/api/admin/maintenance' ||
      path.startsWith('/_next/') ||
      path.startsWith('/monitoring')
    const bypassToken = process.env.MAINTENANCE_BYPASS_TOKEN
    const cookieToken = request.cookies.get('maintenance-bypass')?.value
    const bypass = bypassToken && cookieToken && cookieToken === bypassToken

    if (!allow && !bypass) {
      // HTML 요청은 안내 페이지로 리다이렉트, API 는 JSON 503
      if (path.startsWith('/api/')) {
        return NextResponse.json(
          { error: '점검 중입니다. 잠시 후 다시 시도해주세요.' },
          { status: 503, headers: { 'Retry-After': '300' } },
        )
      }
      const url = request.nextUrl.clone()
      url.pathname = '/maintenance'
      url.search = ''
      return NextResponse.rewrite(url, { status: 503 })
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT the following (세션 갱신 불필요 / 정적):
     *
     * 정적 자원:
     *   _next/static, _next/image, favicon.ico, 이미지/폰트 확장자
     *
     * 모니터링:
     *   /monitoring — Sentry/헬스체크 등 외부 프로브
     *
     * 공개 읽기 전용 API (비로그인 캐시 가능, 세션 불필요):
     *   api/categories, api/regions, api/page-heroes, api/board/stats,
     *   api/news, api/weather, api/gas-stations, api/toilets,
     *   api/site-settings, api/site-labels
     *
     * ⚠️ 새 공개 API 추가 시 여기에도 등록해야 불필요한 세션 체크 방지.
     */
    '/((?!_next/static|_next/image|favicon.ico|monitoring|api/categories|api/regions|api/page-heroes|api/board/stats|api/news|api/weather|api/gas-stations|api/toilets|api/site-settings|api/site-labels|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
