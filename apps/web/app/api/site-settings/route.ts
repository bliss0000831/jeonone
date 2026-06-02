import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import {
  DEFAULT_SETTINGS,
  revalidateSiteSettings,
  SITE_SETTINGS_TAG,
} from '@/lib/services/site-settings'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_COOKIE, verifySuperAdminToken } from '@/lib/services/super-admin'

// GET 은 ISR 로 5 분(300 s) 캐시. 설정 변경 시 POST 핸들러가
// revalidateTag / revalidatePath 로 즉시 무효화하므로 stale 이슈 없음.
// POST 는 mutation 이라 Next.js 가 자동으로 캐시를 안 쓴다.
export const revalidate = 300

/**
 * 공개용 사이트 설정 조회 — 헤더·푸터·메타데이터 전반에서 사용.
 * 캐시 없이 매번 DB 를 친다 (settings row 몇 개라 비용 무시 가능).
 */
export async function GET(request: Request) {
  const settings = { ...DEFAULT_SETTINGS }
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('site_settings').select('key, value')
    data?.forEach((row: { key: string; value: any }) => {
      try {
        const parsed =
          typeof row.value === 'string' ? JSON.parse(row.value) : row.value
        if (row.key === 'homepage_banner' && parsed && typeof parsed === 'object') {
          settings.homepage_banner_title =
            parsed.title || DEFAULT_SETTINGS.homepage_banner_title
          settings.homepage_banner_subtitle =
            parsed.subtitle || DEFAULT_SETTINGS.homepage_banner_subtitle
        } else {
          ;(settings as any)[row.key] = parsed
        }
      } catch {
        ;(settings as any)[row.key] = row.value
      }
    })
  } catch (e) {
    console.warn('[site-settings] GET direct query failed, using defaults:', e)
  }

  return new NextResponse(
    JSON.stringify({
      site_name: settings.site_name,
      site_description: settings.site_description,
      site_logo: settings.site_logo,
      homepage_banner_title: settings.homepage_banner_title,
      homepage_banner_subtitle: settings.homepage_banner_subtitle,
      maintenance_mode: settings.maintenance_mode,
      contact_email: settings.admin_email,
      hub_background: (settings as any).hub_background ?? null,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  )
}

/**
 * 관리자 전용 — 사이트 설정 upsert 후 서버 캐시까지 일괄 무효화.
 * body: { entries: Array<{ key: string; value: unknown }> }
 *
 * 기존에는 클라이언트에서 Supabase 로 직접 upsert 했는데, 그 경로로는
 * `unstable_cache` / route segment 캐시를 갱신할 수 없어 저장 후에도
 * 구버전이 계속 내려갔다. 이제 이 라우트가 단일 진입점.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)

  // gwangjang.app/admin 의 super admin 쿠키 인증 (Supabase 인증과 별개)
  const cookieToken = request.cookies.get(SUPER_ADMIN_COOKIE)?.value
  const isSuperAdminCookie = await verifySuperAdminToken(cookieToken)

  if (!user && !isSuperAdminCookie) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  // 권한 체크: super admin 쿠키 / legacy profiles.role / plaza_admins
  let isLegacySuper = false
  let isSuperPlazaAdmin = false
  let isAnyPlazaAdmin = false
  if (user) {
    const [{ data: profile }, { data: pa }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('plaza_admins').select('role, plaza_id').eq('user_id', user.id),
    ])
    isLegacySuper = profile?.role === 'superadmin'
    isSuperPlazaAdmin = (pa || []).some((r: any) => r.role === 'super')
    isAnyPlazaAdmin = (pa || []).length > 0
  }
  // super admin 쿠키 = god mode (모든 키 쓰기 가능)
  // isLegacyAdmin (profile.role='admin') 은 god mode 에서 제외 — superadmin 만 허용
  const isGodMode = isSuperAdminCookie || isLegacySuper || isSuperPlazaAdmin
  if (!isGodMode && !isAnyPlazaAdmin) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 })
  }

  let body: any = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 입니다' }, { status: 400 })
  }

  const entries: Array<{ key: string; value: unknown }> = Array.isArray(body?.entries)
    ? body.entries
    : []
  if (entries.length === 0) {
    return NextResponse.json({ error: 'entries 가 비어있습니다' }, { status: 400 })
  }

  // 보안: site_settings 는 글로벌 테이블 — 어떤 키도 모든 광장에 영향.
  // 단순화 정책: 한 군데서 god mode 만 쓰기 허용. 일반 plaza_admin 은 절대 못 씀.
  // (각 광장 단위 설정은 site_settings 가 아니라 plaza_settings 같은 별도 테이블 사용)
  const ALLOWED_KEYS = new Set([
    'site_name',
    'site_logo',
    'site_description',
    'admin_email',
    'theme_basic_info',
    'theme_colors',
    'homepage_banner',
    'announcement_bar',
    'maintenance_settings',
    'hub_logo',
    'hub_site_name',
    'hub_theme_colors',
    'hub_background',
  ])

  if (!isGodMode) {
    return NextResponse.json(
      { error: '플랫폼 설정은 슈퍼관리자만 변경할 수 있습니다' },
      { status: 403 },
    )
  }

  const rows = entries
    .filter((e) => e && typeof e.key === 'string' && ALLOWED_KEYS.has(e.key))
    .map((e) => ({
      key: e.key,
      value: JSON.stringify(e.value),
      updated_at: new Date().toISOString(),
    }))

  if (rows.length === 0) {
    return NextResponse.json(
      { error: '허용되지 않은 key 입니다' },
      { status: 400 },
    )
  }

  // 쓰기 전략:
  // 1. 우선 service_role (createAdminClient) 로 시도 — RLS 완전 우회
  // 2. Preview/Dev 에서 SUPABASE_SERVICE_ROLE_KEY 가 없으면 user-context 폴백
  //    (admin 체크 통과했으니 RLS 정책상 쓰기 허용)
  // ⚠️ Production 에선 fail-closed — 키 누락 = 500 (전역 설정에 user-context 사용 X)
  let writeClient: any
  let writeMode = 'admin'
  try {
    writeClient = createAdminClient()
  } catch (e) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[site-settings] SUPABASE_SERVICE_ROLE_KEY 누락 — production 에선 user-context 폴백 차단',
        (e as Error)?.message,
      )
      return NextResponse.json(
        { error: '서버 설정 오류 — 운영자에게 문의해주세요' },
        { status: 500 },
      )
    }
    console.warn(
      '[site-settings] admin client 생성 실패, user-context 로 폴백 (dev/preview only):',
      (e as Error)?.message,
    )
    writeClient = supabase
    writeMode = 'user'
  }

  const { data: upserted, error } = await writeClient
    .from('site_settings')
    .upsert(rows, { onConflict: 'key' })
    .select('key, value, updated_at')
  if (error) {
    console.error('[site-settings] upsert error:', error)
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }

  const writtenKeys: string[] = (upserted || []).map((r: any) => r.key)
  // upsert OK 디버그 로그 제거됨 (production 노이즈)

  // RLS 가 silent-drop 해서 0 rows affected 로 끝났는지 체크.
  // .select() 는 writeClient 권한으로 read-back 하므로, RLS SELECT 는 true 라 문제 없음.
  if (writtenKeys.length !== rows.length) {
    console.error(
      '[site-settings] row count mismatch!',
      'requested:',
      rows.length,
      'written:',
      writtenKeys.length,
    )
    return NextResponse.json(
      {
        error:
          '일부 설정이 저장되지 않았습니다 (RLS 차단 의심). 서버 로그를 확인하세요.',
        requested: rows.map((r) => r.key),
        written: writtenKeys,
        writeMode,
      },
      { status: 500 },
    )
  }

  // Read-back verify — 방금 쓴 값이 실제로 DB 에 들어갔는지 확인
  const { data: verified } = await writeClient
    .from('site_settings')
    .select('key, value')
    .in('key', writtenKeys)
  const verifyMap: Record<string, any> = {}
  ;(verified || []).forEach((r: any) => {
    try {
      verifyMap[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
    } catch {
      verifyMap[r.key] = r.value
    }
  })
  // verify after upsert 디버그 로그 제거됨

  // 캐시 일괄 무효화 — unstable_cache 태그 + 경로 기반 캐시 + 레이아웃
  // (layout.tsx 에서 메타데이터 용도로도 getSiteSettings 사용중)
  try {
    revalidateSiteSettings()
    // Next 16: revalidateTag 두 번째 인자 'max' 필요
    ;(revalidateTag as any)(SITE_SETTINGS_TAG, 'max')
    revalidatePath('/', 'layout')
  } catch (e) {
    console.warn('[site-settings] revalidate failed:', e)
  }

  return NextResponse.json({
    ok: true,
    updated: writtenKeys,
    writeMode,
    verify: verifyMap,
  })
}
