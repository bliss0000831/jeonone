import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'

export const dynamic = 'force-dynamic'

// POST /api/clubs/[id]/chat/read  —  읽음 시점 업데이트
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clubId } = await params
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request as any)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const plaza = await getCurrentPlaza()
  if (plaza) {
    const admin = createAdminClient()
    const { data: club } = await admin.from('clubs').select('plaza_id').eq('id', clubId).maybeSingle()
    if (!club || (club.plaza_id && club.plaza_id !== plaza)) {
      return NextResponse.json({ error: '모임을 찾을 수 없습니다' }, { status: 404 })
    }
  }

  // Bearer 인증 시 supabase 클라에 세션이 없어 RLS 차단 — admin 으로 우회
  const writer = createAdminClient()
  const { error } = await writer
    .from('club_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('club_id', clubId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
