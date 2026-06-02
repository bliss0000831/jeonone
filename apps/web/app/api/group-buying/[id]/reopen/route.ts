import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

export const dynamic = 'force-dynamic'

// POST /api/group-buying/[id]/reopen  —  주최자/관리자가 pending_payment 또는 cancelled 상태를 recruiting 으로 복귀
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
    .select('id, user_id, status, max_participants, current_participants, plaza_id')
    .eq('id', id)
  if (plaza) postQ = postQ.eq('plaza_id', plaza)
  const { data: post } = await postQ.maybeSingle()
  if (!post) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 })

  // 주최자 or 관리자 — 통합 권한
  const { checkAdminAuth, canAccessPlaza } = await import('@/lib/services/admin-auth')
  const auth = await checkAdminAuth(supabase, user.id)
  const postPlaza = (post as any).plaza_id ?? null
  const isAdmin =
    auth.isLegacySuper ||
    (auth.isLegacyAdmin && canAccessPlaza(auth, postPlaza)) ||
    canAccessPlaza(auth, postPlaza)
  if (post.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: '주최자만 재모집할 수 있습니다' }, { status: 403 })
  }

  // pending_payment / cancelled 상태에서만 재모집 허용 (in_progress/completed 은 불가)
  if (post.status !== 'pending_payment' && post.status !== 'cancelled') {
    return NextResponse.json({
      error: '입금 대기 또는 취소된 공동구매만 재모집할 수 있습니다',
    }, { status: 400 })
  }

  // 정원 꽉 찬 경우 재모집 의미 없음 — 참여자가 먼저 나가야 함
  if (post.max_participants && post.current_participants >= post.max_participants) {
    return NextResponse.json({
      error: '정원이 꽉 찼습니다. 자리가 생겨야 재모집할 수 있습니다.',
    }, { status: 400 })
  }

  const wasCancelled = post.status === 'cancelled'

  const { error } = await admin
    .from('group_buying_posts')
    .update({ status: 'recruiting' })
    .eq('id', id)
    .eq('plaza_id', (post as any).plaza_id)
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  // 취소 → 재모집 시 시스템 메시지 기록
  if (wasCancelled) {
    await admin.from('group_buying_chat_messages').insert({
      post_id: id,
      user_id: user.id,
      content: '🔄 주최자가 공동구매 모집을 다시 시작했습니다',
      system_type: 'reopen',
    })
  }

  return NextResponse.json({ ok: true, status: 'recruiting' })
}
