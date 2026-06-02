import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { listOpenFlags, reviewFlag, type UserFlag } from '@/lib/services/business-detection'
import { checkAdminAuth } from '@/lib/services/admin-auth'
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, adminAuth: auth }
}

/** GET — open 플래그 목록 (관리자). user_flags 테이블에 plaza_id 가 없으므로 god-mode 만 조회 가능. */
export async function GET(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error
  const { user, adminAuth } = result

  if (!adminAuth.isGodMode) {
    return NextResponse.json(
      { error: '사용자 플래그 관리는 최고 관리자만 가능합니다' },
      { status: 403 },
    )
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const flags = await listOpenFlags(100)
  return NextResponse.json({ flags })
}

/**
 * PATCH — 플래그 검토 처리 (god-mode 만 허용).
 * Body: { flagId, decision: 'reviewed_clear'|'reviewed_warning'|'reviewed_suspended', notes? }
 */
export async function PATCH(request: Request) {
  const result = await requireAdmin()
  if ('error' in result) return result.error
  const { user, adminAuth } = result

  if (!adminAuth.isGodMode) {
    return NextResponse.json(
      { error: '사용자 플래그 관리는 최고 관리자만 가능합니다' },
      { status: 403 },
    )
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const flagId = body?.flagId
  const decision = body?.decision as UserFlag['status'] | undefined
  if (!flagId || !decision) {
    return NextResponse.json({ error: 'flagId/decision required' }, { status: 400 })
  }

  const result2 = await reviewFlag(flagId, user.id, decision, body?.notes)
  if (!result2.ok) return NextResponse.json({ error: result2.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
