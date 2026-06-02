import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'

export const dynamic = 'force-dynamic'

async function assertPostInPlaza(postId: string): Promise<NextResponse | null> {
  const plaza = await getCurrentPlaza()
  if (!plaza) return null
  const admin = createAdminClient()
  // 🅲 cross-plaza national 글은 허용 (다른 광장 참여자가 채팅 가능)
  const { data } = await admin
    .from('group_buying_posts')
    .select('plaza_id, visibility')
    .eq('id', postId)
    .maybeSingle()
  if (!data) {
    return NextResponse.json({ error: '공동구매를 찾을 수 없습니다' }, { status: 404 })
  }
  if (data.plaza_id && data.plaza_id !== plaza && data.visibility !== 'national') {
    return NextResponse.json({ error: '공동구매를 찾을 수 없습니다' }, { status: 404 })
  }
  return null
}

// GET /api/group-buying/[id]/chat  —  게시글 + 메시지 + 참가자
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await params
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request as any)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const plazaErr = await assertPostInPlaza(postId)
  if (plazaErr) return plazaErr

  const [postRes, msgRes, partRes] = await Promise.all([
    supabase.from('group_buying_posts')
      .select('id, title, product_name, images, group_price, original_price, status, max_participants, current_participants, user_id, account_info, delivery_mode, delivery_fee, delivery_fee_mode, pickup_location, pickup_time')
      .eq('id', postId).single(),
    supabase.from('group_buying_chat_messages')
      .select('id, post_id, user_id, content, image_url, system_type, created_at')
      .eq('post_id', postId)
      .limit(200)
      .order('created_at', { ascending: true }),
    supabase.from('group_buying_participants')
      .select('user_id, joined_at, last_read_at, order_id')
      .eq('post_id', postId)
      .limit(500),
  ])

  if (postRes.error || !postRes.data) {
    return NextResponse.json({ error: '공동구매를 찾을 수 없습니다' }, { status: 404 })
  }

  // 참가자인지 혹은 주최자인지 확인
  const isOwner = postRes.data.user_id === user.id
  const isMember = (partRes.data || []).some((p: any) => p.user_id === user.id)
  if (!isOwner && !isMember) {
    return NextResponse.json({ error: '참여자만 볼 수 있습니다' }, { status: 403 })
  }

  // 참가자 프로필 매핑
  const userIds = Array.from(new Set([
    postRes.data.user_id,
    ...(partRes.data || []).map((p: any) => p.user_id),
    ...(msgRes.data || []).map((m: any) => m.user_id),
  ]))
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url')
    .in('id', userIds)
  const profileMap: Record<string, any> = {}
  profiles?.forEach((p: any) => { profileMap[p.id] = p })

  const participants = (partRes.data || []).map((p: any) => ({
    ...p,
    profile: profileMap[p.user_id] || null,
  }))
  const messages = (msgRes.data || []).map((m: any) => ({
    ...m,
    profile: profileMap[m.user_id] || null,
  }))

  const myParticipant = participants.find((p: any) => p.user_id === user.id) || null

  return NextResponse.json({
    post: postRes.data,
    messages,
    participants,
    myParticipant,
    isOwner,
    ownerProfile: profileMap[postRes.data.user_id] || null,
  })
}

// POST /api/group-buying/[id]/chat  —  메시지 전송
//   body: { content?, image_url? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await params
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request as any)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 채팅 도배 방어
  const limited = await enforceRateLimit(request, 'comment', user.id)
  if (limited) return limited

  const plazaErr = await assertPostInPlaza(postId)
  if (plazaErr) return plazaErr

  const body = await request.json().catch(() => ({}))
  const { content, image_url } = body
  if (!content && !image_url) {
    return NextResponse.json({ error: '메시지 또는 이미지가 필요합니다' }, { status: 400 })
  }
  if (content && content.length > 5000) {
    return NextResponse.json({ error: '메시지가 너무 깁니다' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 참가자 or 주최자 체크 — visibility/plaza 도 함께 확인 (cross-plaza national 글 자동 참여 처리용)
  const [{ data: post }, { data: participant }] = await Promise.all([
    admin.from('group_buying_posts').select('id, user_id, plaza_id, visibility, status, current_participants, max_participants').eq('id', postId).single(),
    admin.from('group_buying_participants').select('user_id, last_read_at')
      .eq('post_id', postId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!post) return NextResponse.json({ error: '공동구매를 찾을 수 없습니다' }, { status: 404 })

  const isOwner = post.user_id === user.id
  if (!isOwner && !participant) {
    // 참여자가 아니면 채팅 차단 — 디버깅 위해 상세 사유 노출
    console.warn('[gb/chat POST] non-participant blocked', {
      postId, userId: user.id, postPlaza: post.plaza_id, visibility: post.visibility, status: post.status,
    })
    return NextResponse.json({
      error: '먼저 공동구매에 참여해주세요 (참여하기 버튼을 눌러주세요)',
      needsJoin: true,
      details: { postPlaza: post.plaza_id, visibility: post.visibility, status: post.status },
    }, { status: 403 })
  }

  const { data: msg, error } = await admin
    .from('group_buying_chat_messages')
    .insert({ post_id: postId, user_id: user.id, content: content || null, image_url: image_url || null })
    .select()
    .single()
  if (error) {
    console.error('[gb/chat POST] insert failed', { error, postId, userId: user.id })
    return NextResponse.json({
      error: "메시지 전송에 실패했습니다",
    }, { status: 500 })
  }

  // 발신자 last_read_at 갱신 (participants 에 있을 때만)
  if (participant) {
    await admin
      .from('group_buying_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('post_id', postId).eq('user_id', user.id)
  }

  return NextResponse.json({ ok: true, message: msg })
}
