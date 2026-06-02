/**
 * GET /api/bump/status?type=property&id=XXX
 *
 * 모달에서 표시할 현재 상태:
 *  - 무료 잔여, 포인트/현금 비용, cooldown, 계정 연령 OK 여부
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { getBumpStatus, type BumpTargetType } from '@/lib/services/bump'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plaza = await getCurrentPlaza()
  if (!plaza) return NextResponse.json({ error: 'plaza_required' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') as BumpTargetType
  const id = searchParams.get('id')
  if (!type || !id) {
    return NextResponse.json({ error: 'type/id required' }, { status: 400 })
  }
  const VALID_TYPES: BumpTargetType[] = [
    'property', 'secondhand', 'interior', 'moving', 'cleaning', 'repair',
    'group_buying', 'local_food', 'jobs', 'new_store',
  ]
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  }

  const result = await getBumpStatus(user.id, plaza, type, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 })
  }
  return NextResponse.json(result.status)
}
