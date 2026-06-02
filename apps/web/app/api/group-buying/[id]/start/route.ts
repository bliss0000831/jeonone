import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

export const dynamic = 'force-dynamic'

// POST /api/group-buying/[id]/start  —  주최자 주문 시작 → in_progress
//   (pending_payment 상태일 때만 가능)
export async function POST(request: Request,
  { params }: { params: Promise<{ id: string }> },) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const admin = createAdminClient()
  let postQ: any = admin
    .from('group_buying_posts')
    .select('id, user_id, status, plaza_id')
    .eq('id', id)
  if (plaza) postQ = postQ.eq('plaza_id', plaza)
  const { data: post } = await postQ.maybeSingle()
  if (!post) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 })

  if (post.user_id !== user.id) {
    return NextResponse.json({ error: '주최자만 진행할 수 있습니다' }, { status: 403 })
  }
  if (post.status !== 'pending_payment') {
    return NextResponse.json({ error: '입금 대기 상태에서만 가능합니다' }, { status: 400 })
  }

  const { error } = await admin
    .from('group_buying_posts')
    .update({ status: 'in_progress' })
    .eq('id', id)
    .eq('plaza_id', (post as any).plaza_id)
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  // 시스템 메시지로 알림
  await admin.from('group_buying_chat_messages').insert({
    post_id: id,
    user_id: user.id,
    content: '🛒 주최자가 주문을 시작했습니다',
    system_type: 'order_start',
  })

  return NextResponse.json({ ok: true, status: 'in_progress' })
}
