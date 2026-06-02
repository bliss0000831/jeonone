import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { checkAdminAuth } from '@/lib/services/admin-auth'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

export const dynamic = 'force-dynamic'

// POST /api/clubs/[id]/close  —  모임장이 모집 강제 마감
export async function POST(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const { id: clubId } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const admin = createAdminClient()

  let clubQ: any = admin
    .from('clubs').select('id, user_id, status, plaza_id').eq('id', clubId)
  if (plaza) clubQ = clubQ.eq('plaza_id', plaza)
  const { data: club } = await clubQ.maybeSingle()
  if (!club) return NextResponse.json({ error: '모임을 찾을 수 없습니다' }, { status: 404 })

  if (club.user_id !== user.id) {
    // 관리자도 허용
    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) {
      return NextResponse.json({ error: '모임장만 마감할 수 있습니다' }, { status: 403 })
    }
  }

  if (club.status === 'closed' || club.status === 'full') {
    return NextResponse.json({ error: '이미 마감된 모임입니다' }, { status: 400 })
  }

  const { error } = await admin
    .from('clubs').update({ status: 'closed' }).eq('id', clubId).eq('plaza_id', (club as any).plaza_id)
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  return NextResponse.json({ ok: true, chatOpened: true, status: 'closed' })
}
