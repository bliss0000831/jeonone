import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { deleteR2Urls } from '@/lib/integrations/r2-cleanup'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { checkAdminAuth, logAdminAction } from '@/lib/services/admin-auth'

export const runtime = 'nodejs'

/**
 * 클라이언트에서 supabase.from(...).delete() 를 직접 쓰는 경로용 R2 정리 엔드포인트.
 *   - 로그인한 사용자만 호출 가능
 *   - 일반 사용자: 자기가 업로드한 파일(= key 가 `<folder>/<userId>/...`) 만 삭제 허용
 *   - admin override: legacy super 만 (admin/plaza_admin 은 자기 글만)
 *   - 1회 요청 최대 100개 URL cap
 *   - rate limit 60/분
 *   - super override 삭제는 admin_actions 에 audit log
 *
 * body: { urls: string[] }
 */
const MAX_URLS_PER_REQUEST = 100

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    // Rate limit — admin 탈취 시 cross-plaza 폭발 방어
    const limited = await enforceRateLimit(request, 'r2-cleanup', user.id)
    if (limited) return limited

    const body = await request.json().catch(() => null) as { urls?: unknown } | null
    const raw = Array.isArray(body?.urls) ? body!.urls : []
    let urls = raw.filter((x): x is string => typeof x === 'string')

    // 1회 요청 cap — 과도한 batch 차단
    if (urls.length > MAX_URLS_PER_REQUEST) {
      urls = urls.slice(0, MAX_URLS_PER_REQUEST)
    }

    // 권한 체크 — legacy super 만 override 허용. admin/plaza_admin 은 자기 글만.
    const auth = await checkAdminAuth(supabase, user.id)
    const isSuperOverride = auth.isLegacySuper

    // 보안:
    //  1) 경로 정규화 — `..`, NULL byte, URL-encoded path traversal 차단
    //  2) 구조 강제 — `<folder>/<userId>/...` 규약. parts[1] === user.id
    //  3) super 도 path traversal 은 여전히 차단
    const isSafePath = (u: string): { ok: boolean; pathname: string } => {
      try {
        const parsed = new URL(u)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, pathname: '' }
        const decoded = decodeURIComponent(parsed.pathname)
        // path traversal / NULL byte 차단
        if (/(\.\.|%2e%2e|\x00)/i.test(decoded)) return { ok: false, pathname: '' }
        return { ok: true, pathname: decoded }
      } catch {
        return { ok: false, pathname: '' }
      }
    }
    const ownsPath = (u: string): boolean => {
      const s = isSafePath(u)
      if (!s.ok) return false
      const parts = s.pathname.split('/').filter(Boolean)
      if (parts.length < 3) return false
      return parts[1] === user.id
    }
    // legacy super 만 본인이 안 만든 파일도 삭제 가능 (path traversal 은 여전히 차단)
    const allowed = isSuperOverride
      ? urls.filter((u) => isSafePath(u).ok)
      : urls.filter(ownsPath)

    await deleteR2Urls(allowed)

    // Audit log — super override 로 본인 외 파일 삭제 시 분쟁 추적용
    if (isSuperOverride) {
      const ownedCount = urls.filter(ownsPath).length
      const overrideUrls = allowed.filter((u) => !ownsPath(u))
      if (overrideUrls.length > 0) {
        // fire-and-forget (logAdminAction 자체가 silent failure)
        void logAdminAction({
          adminId: user.id,
          action: 'delete',
          targetTable: 'r2_objects',
          targetId: `batch:${overrideUrls.length}`,
          reason: `r2-cleanup super override — ${overrideUrls.length} files (own=${ownedCount})`,
          beforeData: { urls: overrideUrls.slice(0, 50) },
        })
      }
    }

    return NextResponse.json({ ok: true, deleted: allowed.length })
  } catch (err: any) {
    console.error('[r2-cleanup] error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
