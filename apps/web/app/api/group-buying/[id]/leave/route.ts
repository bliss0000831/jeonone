import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { notify, getNickname } from '@/lib/services/notifications'

export const dynamic = 'force-dynamic'

// POST /api/group-buying/[id]/leave  —  참여자 탈퇴 (모집중 + 본인만)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const admin = createAdminClient()

  // 게시글 조회 — cross-plaza national 글 허용
  let postQ: any = admin
    .from('group_buying_posts')
    .select('id, user_id, status, images, plaza_id, visibility')
    .eq('id', id)
  if (plaza) postQ = postQ.or(`plaza_id.eq.${plaza},visibility.eq.national`)
  const { data: post } = await postQ.maybeSingle()
  if (!post) {
    return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 })
  }

  // 주최자는 참여 탈퇴 불가 (cancel 엔드포인트 사용)
  if (post.user_id === user.id) {
    return NextResponse.json({ error: '주최자는 참여 취소할 수 없습니다. 공동구매 취소를 이용해주세요.' }, { status: 400 })
  }

  // 모집중 상태만 탈퇴 가능
  if (post.status !== 'recruiting') {
    return NextResponse.json({ error: '모집 마감 후에는 취소할 수 없습니다' }, { status: 400 })
  }

  // 참여 내역 확인
  const { data: existing } = await admin
    .from('group_buying_participants')
    .select('quantity')
    .eq('post_id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: '참여 내역이 없습니다' }, { status: 400 })
  }

  // 참여자 레코드 삭제
  const { error: delErr } = await admin
    .from('group_buying_participants')
    .delete()
    .eq('post_id', id)
    .eq('user_id', user.id)
  if (delErr) {
    return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
  }

  // current_participants atomic decrement (existing.quantity 만큼 차감)
  const { error: rpcDecErr } = await admin.rpc('change_like_count', {
    p_table: 'group_buying_posts',
    p_id: id,
    p_column: 'current_participants',
    p_delta: -(existing.quantity || 1),
  })
  if (rpcDecErr) {
    // RPC 실패 시 직접 update fallback — 참여자는 이미 삭제됨, 카운트 동기화 필수
    console.warn('[group-buying/leave] decrement RPC failed, fallback:', rpcDecErr.message)
    const { data: currentPost } = await admin
      .from('group_buying_posts')
      .select('current_participants')
      .eq('id', id)
      .maybeSingle()
    if (currentPost) {
      await admin
        .from('group_buying_posts')
        .update({
          current_participants: Math.max(0, (currentPost.current_participants || 0) - (existing.quantity || 1)),
        })
        .eq('id', id)
    }
  }

  // 업데이트 후 참여자 수 조회
  const { data: refreshedPost } = await admin
    .from('group_buying_posts')
    .select('current_participants')
    .eq('id', id)
    .maybeSingle()
  const totalQty = refreshedPost?.current_participants ?? 0

  // 주최자에게 탈퇴 알림 (non-fatal)
  try {
    const nickname = await getNickname(admin, user.id)
    const postThumb = Array.isArray((post as any).images) && (post as any).images.length > 0
      ? String((post as any).images[0])
      : null
    await notify(
      admin,
      {
        user_id: post.user_id,
        type: 'group_buying_cancel',
        title: '공동구매 참여 취소',
        message: `${nickname}님이 참여를 취소했습니다`,
        link: `/group-buying/${id}`,
        thumbnail_url: postThumb,
      },
      user.id,
    )
  } catch (notifyErr) {
    console.error('[group-buying/leave] notify error (non-fatal):', notifyErr)
  }

  return NextResponse.json({ ok: true, current_participants: totalQty })
}
