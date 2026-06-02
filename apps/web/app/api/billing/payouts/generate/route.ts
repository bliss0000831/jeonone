import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth } from '@/lib/services/admin-auth'
import { generateMonthlyBatch } from '@/lib/services/billing'
import { verifyCronAuth } from '@/lib/security/cron-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/payouts/generate — 월말 정산 배치 생성.
 *
 * Body: { periodStart: 'YYYY-MM-DD', periodEnd: 'YYYY-MM-DD' }
 *
 * 호출 가능자:
 *   1. 슈퍼 어드민 또는 광장 owner (checkAdminAuth 로 검증)
 *   2. Vercel Cron (vercel.json 설정 + CRON_SECRET 검증)
 */
export async function POST(request: Request) {
  // Cron 호출 검증 (timing-safe Bearer 비교)
  const isCron = verifyCronAuth(request.headers.get('authorization'))

  if (!isCron) {
    // 사용자 호출이면 중앙 관리자 권한 체크 (checkAdminAuth)
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const auth = await checkAdminAuth(supabase, user.id)
    // 슈퍼관리자(godMode) 또는 어떤 광장이든 owner 역할인 경우만 허용
    const isOwnerOfAny = Object.values(auth.plazaRoles).some(r => r === 'owner' || r === 'super')
    if (!auth.isGodMode && !isOwnerOfAny) {
      return NextResponse.json({ error: 'Forbidden — owner 이상 권한 필요' }, { status: 403 })
    }
  }

  const body = await request.json().catch(() => ({}))
  let periodStart: string = body?.periodStart
  let periodEnd: string = body?.periodEnd

  // 기본값: 지난 달
  if (!periodStart || !periodEnd) {
    const now = new Date()
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    periodStart = firstOfLastMonth.toISOString().slice(0, 10)
    periodEnd = firstOfThisMonth.toISOString().slice(0, 10)
  }

  const result = await generateMonthlyBatch(periodStart, periodEnd)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({
    batch: result.batch,
    payoutCount: result.payouts?.length ?? 0,
  })
}
