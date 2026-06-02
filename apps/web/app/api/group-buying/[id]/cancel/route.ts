import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

// POST /api/group-buying/[id]/cancel  —  주최자 취소 → cancelled
export async function POST(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const admin = createAdminClient()
  // 🅲 cross-plaza national 글 허용 (참여자 취소는 다른 광장 사용자도 가능)
  let postQ: any = admin
    .from('group_buying_posts')
    .select('id, user_id, status, plaza_id, visibility')
    .eq('id', id)
  if (plaza) postQ = postQ.or(`plaza_id.eq.${plaza},visibility.eq.national`)
  const { data: post } = await postQ.maybeSingle()
  if (!post) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 })

  // 통합 권한 — legacy + plaza_admins + cross-plaza 차단
  const { checkAdminAuth, canAccessPlaza } = await import('@/lib/services/admin-auth')
  const auth = await checkAdminAuth(supabase, user.id)
  const postPlaza = (post as any).plaza_id ?? null
  const isAdmin =
    auth.isLegacySuper ||
    (auth.isLegacyAdmin && canAccessPlaza(auth, postPlaza)) ||
    canAccessPlaza(auth, postPlaza)
  if (post.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: '주최자만 취소할 수 있습니다' }, { status: 403 })
  }
  if (post.status === 'completed' || post.status === 'cancelled') {
    return NextResponse.json({ error: '이미 종료된 공동구매입니다' }, { status: 400 })
  }

  // plaza_id 조건: null 이면 생략 (national 글 등)
  let cancelQ = admin
    .from('group_buying_posts')
    .update({ status: 'cancelled' })
    .eq('id', id)
  if ((post as any).plaza_id) {
    cancelQ = cancelQ.eq('plaza_id', (post as any).plaza_id)
  }
  const { error } = await cancelQ
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  // pending/confirmed/paid 주문도 cancelled 처리 + 환불 대기 전환
  // paid 주문은 refund_requested 로 전환하여 관리자가 실제 환불 처리
  await admin
    .from('group_buying_orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('post_id', id)
    .in('status', ['pending', 'confirmed'])
    .then(({ error: ordErr }) => {
      if (ordErr) console.warn('[group-buying/cancel] order cancel (non-fatal):', ordErr.message)
    })

  // paid 주문 → refund_requested 전환 (PG 환불은 관리자 처리)
  await admin
    .from('group_buying_orders')
    .update({
      status: 'refund_requested',
      cancelled_at: new Date().toISOString(),
      buyer_memo: '공동구매 주최자 취소로 인한 자동 환불 요청',
    })
    .eq('post_id', id)
    .in('status', ['paid'])
    .then(({ error: refundErr }) => {
      if (refundErr) console.warn('[group-buying/cancel] paid order refund request (non-fatal):', refundErr.message)
    })

  // 시스템 메시지 + 참여자 알림 병렬
  const { data: participants } = await admin
    .from('group_buying_participants')
    .select('user_id')
    .eq('post_id', id)

  await admin.from('group_buying_chat_messages').insert({
    post_id: id,
    user_id: user.id,
    content: '⚠️ 주최자가 공동구매를 취소했습니다',
    system_type: 'cancel',
  })

  // 참여자들에게 취소 알림 (비동기, non-fatal)
  if (participants && participants.length > 0) {
    try {
      const { notify } = await import('@/lib/services/notifications')
      const postThumb = (post as any).images?.[0] ? String((post as any).images[0]) : null
      await Promise.all(
        participants
          .filter((p: any) => p.user_id !== user.id)
          .map((p: any) =>
            notify(admin, {
              user_id: p.user_id,
              type: 'group_buying_cancel',
              title: '공동구매 취소',
              message: '참여 중이던 공동구매가 주최자에 의해 취소되었습니다',
              link: `/group-buying/${id}`,
              thumbnail_url: postThumb,
            }, user.id)
          )
      )
    } catch (notifyErr) {
      console.error('[group-buying/cancel] notify error (non-fatal):', notifyErr)
    }
  }

  return NextResponse.json({ ok: true, status: 'cancelled' })
}
