/**
 * 관리자 — 회원에게 수동 포인트 지급/회수.
 *
 * POST { userId, plazaId, amount, reason, type }
 *   type: 'manual_adjust' | 'penalty' | 'event'
 *
 * 광장 격리 해제 — user_points PK 는 (user_id) 단독.
 * plazaId 는 관리자 권한 체크 + 소속 확인용으로만 사용.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth, canAccessPlaza, getAdminWriteClient } from '@/lib/services/admin-auth'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const targetUserId: string | undefined = body?.userId
  const plazaId: string | undefined = body?.plazaId
  const amount = Number(body?.amount ?? 0)
  const reason: string = body?.reason ?? '관리자 수동 조정'
  const type: 'manual_adjust' | 'penalty' | 'event' = body?.type ?? 'manual_adjust'

  if (!targetUserId || !plazaId) {
    return NextResponse.json({ error: 'userId, plazaId required' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: '0이 아닌 금액 필요' }, { status: 400 })
  }

  if (!canAccessPlaza(auth, plazaId)) {
    return NextResponse.json({ error: '해당 광장에 대한 권한이 없습니다' }, { status: 403 })
  }

  // service role 클라이언트
  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: 'Service role key 미설정' }, { status: 500 })
  }

  // 회원 소속 확인 (service role로 — RLS 우회)
  const { data: targetMembership } = await admin
    .from('plaza_profiles')
    .select('user_id')
    .eq('plaza_id', plazaId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (!targetMembership) {
    return NextResponse.json({ error: '해당 광장의 회원이 아닙니다' }, { status: 400 })
  }

  // ── 1) 잔액 업데이트 (광장 격리 해제 — user_id 기준) ──
  let { data: row } = await admin
    .from('user_points')
    .select('available, lifetime_earned, lifetime_reverted')
    .eq('user_id', targetUserId)
    .maybeSingle()

  let newAvailable: number

  if (!row) {
    // row 없음 — INSERT
    if (amount < 0) {
      return NextResponse.json({ error: '잔액이 없는 회원은 차감할 수 없습니다' }, { status: 400 })
    }
    newAvailable = amount
    const { error: insErr } = await admin
      .from('user_points')
      .insert({
        user_id: targetUserId,
        plaza_id: null,
        available: amount,
        pending: 0,
        lifetime_earned: amount,
        lifetime_spent: 0,
        lifetime_reverted: 0,
      })
    if (insErr) {
      return NextResponse.json({ error: `잔액 생성 실패: ${insErr.message}` }, { status: 500 })
    }
  } else {
    // row 있음 — UPDATE
    if (amount < 0 && (row.available + amount) < 0) {
      return NextResponse.json(
        { error: `회수액(${Math.abs(amount)})이 잔액(${row.available})을 초과합니다` },
        { status: 400 },
      )
    }
    newAvailable = row.available + amount
    const updatePayload: Record<string, any> = { available: newAvailable }
    if (amount > 0) updatePayload.lifetime_earned = (row.lifetime_earned ?? 0) + amount
    else updatePayload.lifetime_reverted = (row.lifetime_reverted ?? 0) + Math.abs(amount)

    const { error: updErr } = await admin
      .from('user_points')
      .update(updatePayload)
      .eq('user_id', targetUserId)
    if (updErr) {
      return NextResponse.json({ error: `잔액 업데이트 실패: ${updErr.message}` }, { status: 500 })
    }
  }

  // ── 2) 거래 기록 (광장 격리 해제 — plaza_id NULL) ──
  const txAmount = Math.abs(amount)
  const txType = amount > 0 ? type : 'penalty'
  const txPayload: Record<string, any> = {
    user_id: targetUserId,
    plaza_id: null,
    type: txType,
    amount: txAmount,
    source: txType,
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    metadata: {
      reason,
      admin_id: user.id,
      direction: amount > 0 ? 'credit' : 'debit',
      delta: amount,
    },
  }

  // created_by 컬럼 시도
  const { error: txErr } = await admin.from('point_transactions').insert({ ...txPayload, created_by: user.id })
  if (txErr) {
    console.error('[points/manual] tx insert (with created_by):', txErr.message)
    // created_by 없을 수 있음 — 재시도
    const { error: txErr2 } = await admin.from('point_transactions').insert(txPayload)
    if (txErr2) console.error('[points/manual] tx insert (without created_by):', txErr2.message)
  }

  return NextResponse.json({ ok: true, newBalance: newAvailable })
}
