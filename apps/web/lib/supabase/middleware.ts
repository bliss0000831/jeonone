import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { plazaFromHost, KNOWN_PLAZAS } from '@/lib/plaza/config'
import { hasPermission, urlToPermissionPath } from '@/lib/services/admin-permissions'

// ── maintenance 설정 모듈 캐시 (30s) ──
//   미들웨어가 모든 요청에서 도는 만큼 site_settings RTT 를 누적 비용으로 안 받게 함.
//   admin 이 변경 후 30초 안엔 stale 가능 — 그 정도는 trade-off.
// ── x-plaza 화이트리스트 (config.ts 의 KNOWN_PLAZAS 로부터 생성) ──
const KNOWN_PLAZAS_SET = new Set<string>(KNOWN_PLAZAS)

const MAINT_TTL_MS = 30_000
let maintCache: { enabled: boolean; allowAdmin: boolean; ts: number } | null = null
function getMaintenanceCache(): { enabled: boolean; allowAdmin: boolean } | null {
  if (!maintCache) return null
  if (Date.now() - maintCache.ts > MAINT_TTL_MS) return null
  return { enabled: maintCache.enabled, allowAdmin: maintCache.allowAdmin }
}
function setMaintenanceCache(v: { enabled: boolean; allowAdmin: boolean }) {
  maintCache = { ...v, ts: Date.now() }
}

export async function updateSession(request: NextRequest) {
  // ─── 멀티-광장: host → plaza_id 추출, 모든 다운스트림이 헤더로 읽음 ──────
  const host = request.headers.get('host')
  let plazaId = plazaFromHost(host)

  // ─── 개발 / Vercel preview: ?plaza=xxx 쿼리 또는 dev-plaza 쿠키로 광장 진입 ───
  // 서브도메인 방식이 안 통하는 환경:
  //   - localhost (dev)
  //   - *.vercel.app (preview URL — "chuncheon.vercel.app" 은 광장 X)
  // 두 환경 모두 ?plaza= 쿼리로 광장 진입 가능하게.
  let setDevPlazaCookie: string | null = null
  let clearDevPlazaCookie = false
  const isSubdomainUnsupported =
    process.env.NODE_ENV === 'development' ||
    (host?.endsWith('.vercel.app') ?? false)
  if (isSubdomainUnsupported && !plazaId) {
    const qParam = request.nextUrl.searchParams.get('plaza')
    if (qParam !== null) {
      // ?plaza= (빈값) 이면 클리어, ?plaza=hub 도 클리어, 그 외 값이면 그 광장으로
      if (qParam === '' || qParam === 'hub') {
        clearDevPlazaCookie = true
      } else {
        plazaId = qParam as unknown as typeof plazaId
        setDevPlazaCookie = qParam
      }
    } else {
      const c = request.cookies.get('dev-plaza')?.value
      if (c) plazaId = c as unknown as typeof plazaId
    }
  }

  // 헤더로 박아두면 server component / route handler 에서 headers().get('x-plaza') 로 읽기 가능
  const reqHeaders = new Headers(request.headers)
  // host 기반 plaza 가 우선. host 가 hub (plaza 미해석) 인데 클라이언트가 명시적으로
  // x-plaza 헤더를 보낸 경우 (예: native 앱이 www.gwangjang.app 으로 cross-origin 호출)
  // 그 값을 신뢰. 화이트리스트로 검증.
  //
  // ⚠️ SECURITY NOTE: x-plaza 헤더는 클라이언트가 자유롭게 설정할 수 있으므로
  // 이 값만으로 권한을 부여해서는 안 됨. 현재는 KNOWN_PLAZAS 화이트리스트로 값을 제한하며,
  // 실질적인 인증/인가는 각 API 라우트의 세션 검증 + plaza_admins 체크에서 수행.
  // 향후 native 앱에 dedicated API gateway 를 도입하면 이 경로 제거 검토.
  if (!plazaId) {
    const clientPlaza = request.headers.get('x-plaza')
    if (clientPlaza && KNOWN_PLAZAS_SET.has(clientPlaza)) {
      plazaId = clientPlaza as unknown as typeof plazaId
    }
  }
  reqHeaders.set('x-plaza', plazaId ?? '')

  // ─── 허브 도메인의 /admin → /super-admin rewrite ────────────────────────
  // 광장 서브도메인이 아닌 곳 (gwangjang.app) 에서 /admin 진입 시
  // 슈퍼 관리자 페이지로 보냄. URL 은 /admin 그대로 유지 (rewrite, redirect X).
  if (!plazaId) {
    const pathname = request.nextUrl.pathname
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const url = request.nextUrl.clone()
      url.pathname = '/super-admin' + pathname.slice('/admin'.length)
      return NextResponse.rewrite(url, { request: { headers: reqHeaders } })
    }
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: reqHeaders },
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    // if the user is not logged in and the app path, in this case, /protected, is accessed, redirect to the login page
    request.nextUrl.pathname.startsWith('/protected') &&
    !user
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // ─── /super-admin/* 인증 강제 (허브 도메인) ─────────────────────────────
  // super-admin layout 에서 자체 토큰 검증을 하지만, 미들웨어에서도 일괄 차단해
  // 신규 라우트 추가 시 보호 누락을 방지. 비로그인 → 로그인 페이지, 로그인했지만
  // superadmin/super 역할 아님 → 홈으로 리다이렉트.
  if (request.nextUrl.pathname.startsWith('/super-admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
    // role 조회 — 실패 시 fail-closed (안전)
    let isSuperAdmin = false
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role === 'superadmin') {
        isSuperAdmin = true
      }
      if (!isSuperAdmin) {
        const { data: superPa } = await supabase
          .from('plaza_admins')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super')
          .maybeSingle()
        if (superPa) {
          isSuperAdmin = true
        }
      }
    } catch (e) {
      console.warn('[middleware] /super-admin auth role check failed (fail-closed):', e)
      isSuperAdmin = false
    }
    if (!isSuperAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  // ─── /admin/* + /api/admin/* 인증 강제 (광장 서브도메인) ────────────────
  // 위쪽 rewrite 블록에서 허브 도메인의 /admin 은 이미 /super-admin 으로 보내짐.
  // 여기까지 도달한 /admin/* 은 광장 도메인. 반드시 로그인 + admin/superadmin 역할 + 해당 광장 권한.
  // 각 페이지/라우트가 자체 검증하지만, 미들웨어에서 일괄 차단해 신규 라우트 누락 방지.
  // /api/admin/* 도 동일 — plaza_admin 이 다른 광장 admin 라우트 호출하는 cross-plaza 누설 차단.
  if (
    plazaId &&
    (request.nextUrl.pathname.startsWith('/admin') ||
      request.nextUrl.pathname.startsWith('/api/admin'))
  ) {
    const isApiPath = request.nextUrl.pathname.startsWith('/api/')
    if (!user) {
      if (isApiPath) {
        return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
      }
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
    // role 조회 — 실패 시 fail-closed (안전)
    let allowed = false
    let effectiveRole = ''
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) {
        allowed = true
        effectiveRole = profile.role === 'superadmin' ? 'super' : 'owner'
      }
      // plaza_admins 테이블도 확인 — 광장 단위 위임 관리자 + 역할 기반 접근 제어
      if (!allowed) {
        const { data: pa } = await supabase
          .from('plaza_admins')
          .select('role')
          .eq('user_id', user.id)
          .eq('plaza_id', plazaId)
          .maybeSingle()
        if (pa) {
          allowed = true
          effectiveRole = pa.role
        }
      }
      // super 역할은 모든 광장 접근 가능
      if (!allowed) {
        const { data: superPa } = await supabase
          .from('plaza_admins')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super')
          .maybeSingle()
        if (superPa) {
          allowed = true
          effectiveRole = 'super'
        }
      }
    } catch (e) {
      console.warn('[middleware] /admin auth role check failed (fail-closed):', e)
      allowed = false
    }
    if (!allowed) {
      if (isApiPath) {
        return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
      }
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    // 역할별 페이지 접근 제어 — 대시보드(/admin)는 모든 역할 허용
    if (effectiveRole && request.nextUrl.pathname !== '/admin') {
      const permPath = urlToPermissionPath(request.nextUrl.pathname)
      if (!hasPermission(effectiveRole, permPath)) {
        if (isApiPath) {
          return NextResponse.json({ error: '해당 메뉴에 접근 권한이 없습니다' }, { status: 403 })
        }
        // 권한 없는 페이지 접근 시 대시보드로 리다이렉트
        const url = request.nextUrl.clone()
        url.pathname = '/admin'
        return NextResponse.redirect(url)
      }
    }
  }

  // 공사중 모드 체크
  const pathname = request.nextUrl.pathname
  const isAdminPath = pathname.startsWith('/admin')
  const isAuthPath = pathname.startsWith('/auth')
  const isApiPath = pathname.startsWith('/api')
  const isMaintenancePage = pathname === '/maintenance'

  if (!isAdminPath && !isAuthPath && !isApiPath && !isMaintenancePage) {
    // 설정 조회는 fail-open (설정 못 읽으면 maintenance 는 꺼진 것으로 취급).
    // ── 모듈 캐시 30초 — 모든 요청마다 RTT 2회 도는 비용 제거.
    let enabled = false
    let allowAdmin = true
    try {
      const cached = getMaintenanceCache()
      if (cached) {
        enabled = cached.enabled
        allowAdmin = cached.allowAdmin
      } else {
        const { data: rows } = await supabase
          .from('site_settings')
          .select('key, value')
          .in('key', ['maintenance_mode', 'maintenance_settings'])

        if (rows) {
          for (const row of rows) {
            const parsed =
              typeof row.value === 'string' ? JSON.parse(row.value) : row.value
            if (row.key === 'maintenance_mode') enabled = Boolean(parsed)
            if (row.key === 'maintenance_settings' && parsed && typeof parsed === 'object') {
              if (typeof parsed.enabled === 'boolean') enabled = parsed.enabled
              if (typeof parsed.allow_admin === 'boolean') allowAdmin = parsed.allow_admin
            }
          }
        }
        setMaintenanceCache({ enabled, allowAdmin })
      }
    } catch (e) {
      console.warn('[middleware] maintenance settings read failed (fail-open):', e)
    }

    if (enabled) {
      // 유저의 관리자 여부 체크는 fail-CLOSED —
      // role 조회 실패 시엔 안전하게 '관리자 아님' 으로 간주 (maintenance 강제).
      // 그래야 장애 상황에서 일반 유저 경로로 서비스가 열리지 않음.
      let isAdmin = false
      if (user && allowAdmin) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
          if (error) throw error
          if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) {
            isAdmin = true
          }
        } catch (e) {
          console.warn('[middleware] admin role check failed during maintenance (fail-closed):', e)
          isAdmin = false
        }
      }
      if (!isAdmin) {
        const url = request.nextUrl.clone()
        url.pathname = '/maintenance'
        return NextResponse.rewrite(url)
      }
    }
  }

  // ─── 개발 전용 dev-plaza 쿠키 set/clear ──────────────────────────────
  if (setDevPlazaCookie) {
    supabaseResponse.cookies.set('dev-plaza', setDevPlazaCookie, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: true,
    })
  } else if (clearDevPlazaCookie) {
    supabaseResponse.cookies.delete('dev-plaza')
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
