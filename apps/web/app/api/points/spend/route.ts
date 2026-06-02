/**
 * POST /api/points/spend — 포인트 사용.
 *
 * 호출 위치 (예시):
 *   - 공동구매 결제 시 사용 포인트 차감
 *   - 로컬푸드 결제
 *   - 부스트 결제
 *
 * 보안: 본인 user_id 만 차감 가능. 한도 / 잔액 검증.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { spend } from '@/lib/services/billing/points'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

const ALLOWED_CATEGORIES = new Set([
  'group_buying',
  'local_food',
  'boost',
  'ai_video',
  'event',
  'giftcard',
])

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 도배/race 방어 — 같은 사용자 분당 30회로 제한
  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const category: string | undefined = body?.category
  const amount = Number(body?.amount ?? 0)
  const paymentTotal = body?.paymentTotal != null ? Number(body.paymentTotal) : undefined
  const sourceId: string | undefined = body?.sourceId

  if (!category || !ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 })
  }
  // amount: 양의 정수 & 상한 (NaN/Infinity/음수/소수/오버플로 차단)
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) {
    return NextResponse.json({ error: 'invalid amount' }, { status: 400 })
  }
  if (paymentTotal !== undefined && (!Number.isFinite(paymentTotal) || paymentTotal <= 0 || paymentTotal > 1_000_000_000)) {
    return NextResponse.json({ error: 'invalid paymentTotal' }, { status: 400 })
  }
  if (sourceId !== undefined && (typeof sourceId !== 'string' || sourceId.length > 200)) {
    return NextResponse.json({ error: 'invalid sourceId' }, { status: 400 })
  }

  const result = await spend({
    userId: user.id,
    category,
    amount,
    paymentTotal,
    sourceId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? result.error ?? '사용 실패' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
