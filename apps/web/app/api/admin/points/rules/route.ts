/**
 * 관리자 — 포인트 적립 규칙 CRUD.
 *
 * GET: 전체 규칙 조회
 * PATCH: 단일 규칙 수정 (amount / daily_cap / cooldown / enabled / threshold 등)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth } from '@/lib/services/admin-auth'
import { enforceRateLimit } from "@/lib/services/ratelimit"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { data } = await supabase
    .from('point_rules')
    .select('id, display_name, amount, daily_cap, weekly_cap, cooldown_seconds, quality_threshold, evaluation_period_hours, required_account_age_days, required_phone_verified, required_email_verified, enabled, description')
    .order('amount', { ascending: false })
  return NextResponse.json({ rules: data ?? [] })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // point_rules 는 글로벌 테이블 (plaza_id 없음) — 수정은 최고 관리자만 허용
  if (!auth.isGodMode) {
    return NextResponse.json(
      { error: '포인트 규칙 수정은 최고 관리자만 가능합니다' },
      { status: 403 },
    )
  }

  const limited = await enforceRateLimit(request, "admin-notify", user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const id: string | undefined = body?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const ALLOWED_FIELDS = [
    'amount',
    'daily_cap',
    'weekly_cap',
    'cooldown_seconds',
    'evaluation_period_hours',
    'required_account_age_days',
    'required_phone_verified',
    'required_email_verified',
    'enabled',
    'description',
    'quality_threshold',
  ]
  const update: Record<string, any> = {}
  for (const k of ALLOWED_FIELDS) {
    if (body[k] !== undefined) update[k] = body[k]
  }
  update.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('point_rules')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
