import { NextResponse } from 'next/server'
import { listActivePlans } from '@/lib/services/billing'

export const dynamic = 'force-dynamic'

/** GET /api/billing/plans — 활성 구독 플랜 목록 (모두 조회 가능). */
export async function GET() {
  const plans = await listActivePlans()
  return NextResponse.json({ plans }, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" },
  })
}
