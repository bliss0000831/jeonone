import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/group-buying/[id]/members
 * 여러 종류의 상태 변경을 한 엔드포인트에서 처리
 *
 * body:
 *  - action: 'mark_paid'        (본인: 입금 완료 신고)                 reserved → paid
 *  - action: 'confirm_payment'  (주최자: 입금 확인)                    paid     → confirmed
 *  - action: 'set_tracking'     (주최자: 송장 입력)     confirmed/paid → shipped
 *  - action: 'mark_received'    (본인: 수령 완료)                     shipped/confirmed → received
 *  - action: 'force_cancel'     (주최자: 강제 취소)                    any → cancelled
 *
 *  공통 body: { target_user_id?: uuid }  (주최자 액션일 때 대상 참가자)
 *  set_tracking 추가: { tracking_carrier, tracking_number }
 */
export async function POST(request: Request,
  { params }: { params: Promise<{ id: string }> },) {
  const { id: postId } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const action: string = body.action

  const admin = createAdminClient()
  // 🅲 cross-plaza — national 글은 타광장 참여자도 본인 액션 가능
  let postQ: any = admin
    .from('group_buying_posts')
    .select('id, user_id, status, plaza_id, visibility')
    .eq('id', postId)
  if (plaza) postQ = postQ.or(`plaza_id.eq.${plaza},visibility.eq.national`)
  const { data: post } = await postQ.maybeSingle()
  if (!post) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 })

  const isOwner = post.user_id === user.id

  // 대상 유저: 주최자 액션이면 target_user_id, 본인 액션이면 user.id
  const ownerActions = ['confirm_payment', 'set_tracking', 'force_cancel']
  const targetUserId = ownerActions.includes(action) ? (body.target_user_id as string) : user.id
  if (ownerActions.includes(action) && !isOwner) {
    return NextResponse.json({ error: '주최자만 가능한 작업입니다' }, { status: 403 })
  }
  if (ownerActions.includes(action) && !targetUserId) {
    return NextResponse.json({ error: 'target_user_id 가 필요합니다' }, { status: 400 })
  }

  const { data: participant } = await admin
    .from('group_buying_participants')
    .select('*')
    .eq('post_id', postId)
    .eq('user_id', targetUserId)
    .maybeSingle()
  if (!participant) {
    return NextResponse.json({ error: '참여 정보를 찾을 수 없습니다' }, { status: 404 })
  }

  const now = new Date().toISOString()
  let update: Record<string, any> = {}
  let systemMessage: string | null = null

  switch (action) {
    case 'mark_paid':
      if (participant.user_id !== user.id) {
        return NextResponse.json({ error: '본인만 가능합니다' }, { status: 403 })
      }
      if (participant.payment_status !== 'reserved') {
        return NextResponse.json({ error: '이미 처리되었습니다' }, { status: 400 })
      }
      update = { payment_status: 'paid', paid_at: now }
      break

    case 'confirm_payment':
      if (!['paid', 'reserved'].includes(participant.payment_status)) {
        return NextResponse.json({ error: '확인할 수 있는 상태가 아닙니다' }, { status: 400 })
      }
      update = { payment_status: 'confirmed', confirmed_at: now, paid_at: participant.paid_at ?? now }
      break

    case 'set_tracking': {
      if (participant.receive_method !== 'delivery') {
        return NextResponse.json({ error: '배송 건이 아닙니다' }, { status: 400 })
      }
      if (!['confirmed', 'paid', 'shipped'].includes(participant.payment_status)) {
        return NextResponse.json({ error: '입금 확인 후 송장 등록 가능합니다' }, { status: 400 })
      }
      const { tracking_carrier, tracking_number } = body
      if (!tracking_number) {
        return NextResponse.json({ error: '송장번호를 입력해주세요' }, { status: 400 })
      }
      update = {
        payment_status: 'shipped',
        tracking_carrier: tracking_carrier || null,
        tracking_number,
        shipped_at: now,
      }
      systemMessage = `📦 ${tracking_carrier || '택배'} ${tracking_number} 발송 완료`
      break
    }

    case 'mark_received':
      if (participant.user_id !== user.id) {
        return NextResponse.json({ error: '본인만 가능합니다' }, { status: 403 })
      }
      if (!['confirmed', 'shipped', 'paid'].includes(participant.payment_status)) {
        return NextResponse.json({ error: '수령 가능한 상태가 아닙니다' }, { status: 400 })
      }
      update = { payment_status: 'received', received_at: now }
      break

    case 'force_cancel':
      update = { payment_status: 'cancelled' }
      systemMessage = '참가자 한 명이 취소 처리되었습니다'
      break

    default:
      return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
  }

  const { error } = await admin
    .from('group_buying_participants')
    .update(update)
    .eq('post_id', postId)
    .eq('user_id', targetUserId)
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  // 시스템 메시지
  if (systemMessage) {
    await admin.from('group_buying_chat_messages').insert({
      post_id: postId,
      user_id: user.id,
      content: systemMessage,
      system_type: action,
    })
  }

  // 전원 received 면 post.status = completed
  if (action === 'mark_received') {
    const { data: all } = await admin
      .from('group_buying_participants')
      .select('user_id, payment_status, quantity')
      .eq('post_id', postId)
    const active = (all || []).filter((p: any) => p.payment_status !== 'cancelled' && (p.quantity || 0) > 0)
    const allReceived = active.length > 0 && active.every((p: any) => p.payment_status === 'received')
    if (allReceived && post.status === 'in_progress') {
      await admin.from('group_buying_posts').update({ status: 'completed' }).eq('id', postId).eq('plaza_id', (post as any).plaza_id)
      await admin.from('group_buying_chat_messages').insert({
        post_id: postId,
        user_id: user.id,
        content: '🎉 전원 수령 완료! 공동구매가 종료되었습니다',
        system_type: 'completed',
      })
    }
  }

  return NextResponse.json({ ok: true, action, target_user_id: targetUserId })
}
