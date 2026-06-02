import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { checkAdminAuth } from '@/lib/services/admin-auth'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

export const dynamic = 'force-dynamic'

// POST /api/clubs/[id]/reopen  —  모임장/관리자가 마감된 모임을 재모집 상태로 복귀
export async function POST(request: Request,
  { params }: { params: Promise<{ id: string }> },) {
  const { id: clubId } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const admin = createAdminClient()

  let clubQ: any = admin
    .from('clubs').select('id, user_id, status, max_members, current_members, plaza_id').eq('id', clubId)
  if (plaza) clubQ = clubQ.eq('plaza_id', plaza)
  const { data: club } = await clubQ.maybeSingle()
  if (!club) return NextResponse.json({ error: '모임을 찾을 수 없습니다' }, { status: 404 })

  if (club.user_id !== user.id) {
    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) {
      return NextResponse.json({ error: '모임장만 재모집할 수 있습니다' }, { status: 403 })
    }
  }

  if (club.status === 'recruiting') {
    return NextResponse.json({ error: '이미 모집 중인 모임입니다' }, { status: 400 })
  }

  // 정원이 꽉 찬 상태라면 재모집 불가 (멤버가 나가야 함)
  if (club.max_members && club.current_members >= club.max_members) {
    return NextResponse.json({
      error: '정원이 꽉 찼습니다. 자리가 생겨야 재모집할 수 있습니다.',
    }, { status: 400 })
  }

  const { error } = await admin
    .from('clubs').update({ status: 'recruiting' }).eq('id', clubId).eq('plaza_id', (club as any).plaza_id)
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  return NextResponse.json({ ok: true, status: 'recruiting' })
}
