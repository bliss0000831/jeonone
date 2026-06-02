import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth, logAdminAction } from '@/lib/services/admin-auth'
import { enforceRateLimit } from "@/lib/services/ratelimit"

/**
 * 관리자 캐시 초기화 API.
 *
 * 지원 항목:
 *  - page: revalidatePath('/', 'layout') → 모든 페이지 ISR 캐시 갱신
 *  - sitemap: revalidatePath('/sitemap.xml') → 사이트맵 갱신
 *
 * god-mode 전용 — 한 광장 admin 이 다른 광장 캐시를 wipe 하지 못하도록.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const limited = await enforceRateLimit(request, "admin-notify", user.id)
    if (limited) return limited

    if (!auth.isGodMode) {
      return NextResponse.json(
        { error: '슈퍼관리자만 캐시를 초기화할 수 있습니다.' },
        { status: 403 },
      )
    }

    const { items } = (await request.json()) as { items: string[] }
    const cleared: string[] = []
    const errors: string[] = []

    if (items?.includes('page')) {
      try {
        revalidatePath('/', 'layout')
        cleared.push('page')
      } catch (e) {
        console.error('page cache clear failed', e)
        errors.push('page')
      }
    }

    if (items?.includes('sitemap')) {
      try {
        revalidatePath('/sitemap.xml')
        cleared.push('sitemap')
      } catch (e) {
        console.error('sitemap cache clear failed', e)
        errors.push('sitemap')
      }
    }

    // 감사 로그 (비동기, non-fatal)
    void logAdminAction({
      adminId: user.id,
      action: 'cache_clear',
      targetTable: 'system',
      targetId: 'cache',
      beforeData: { items, cleared, errors },
    })

    if (errors.length > 0 && cleared.length === 0) {
      return NextResponse.json(
        { error: '캐시 갱신에 실패했습니다.', errors },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, cleared, ...(errors.length > 0 ? { errors } : {}) })
  } catch (error: any) {
    console.error('[cache-clear] error', error)
    return NextResponse.json(
      { error: '캐시 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
