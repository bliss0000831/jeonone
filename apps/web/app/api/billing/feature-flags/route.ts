import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth } from '@/lib/services/admin-auth'
import {
  fetchAllFeatureFlags,
  setFeatureFlag,
  type FeatureFlagKey,
} from '@/lib/services/billing'

export const dynamic = 'force-dynamic'

/** GET /api/billing/feature-flags — 모든 플래그 조회 (UI 분기용). */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })

  const flags = await fetchAllFeatureFlags()
  return NextResponse.json({ flags })
}

/**
 * PATCH /api/billing/feature-flags — 플래그 토글 (관리자 전용).
 * Body: { key: string, enabled: boolean }
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 관리자 권한 체크
  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const key = body?.key as FeatureFlagKey | undefined
  const enabled = Boolean(body?.enabled)
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const result = await setFeatureFlag(key, enabled)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
