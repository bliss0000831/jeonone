import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notify, getNickname } from '@/lib/services/notifications'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

export const dynamic = 'force-dynamic'

// POST /api/clubs/[id]/join  —  모임 참여
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clubId } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, req)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(req as any, 'mutate', user.id)
  if (limited) return limited

  // 클럽 조회 (광장 검증)
  let clubQ: any = supabase
    .from('clubs')
    .select('id, user_id, max_members, current_members, status, images, plaza_id')
    .eq('id', clubId)
  if (plaza) clubQ = clubQ.eq('plaza_id', plaza)
  const { data: club, error: clubErr } = await clubQ.maybeSingle()
  if (clubErr || !club) return NextResponse.json({ error: '모임을 찾을 수 없습니다' }, { status: 404 })

  const clubThumb = Array.isArray((club as any).images) && (club as any).images.length > 0
    ? String((club as any).images[0])
    : null

  if (club.status === 'closed') {
    return NextResponse.json({ error: '이미 마감된 모임입니다' }, { status: 400 })
  }

  // 원자적 join — TOCTOU 차단 (advisory lock + FOR UPDATE)
  const admin = createAdminClient()
  const { data: rpcRes, error: rpcErr } = await admin.rpc('club_join_atomic', {
    p_club_id: clubId,
    p_user_id: user.id,
  })
  if (rpcErr) {
    console.error('[clubs/join] rpc error:', rpcErr)
    return NextResponse.json({ error: '처리에 실패했습니다' }, { status: 500 })
  }
  const result = rpcRes as { ok: boolean; error?: string }
  if (!result?.ok) {
    const msg = result?.error || '참여에 실패했습니다'
    const status = msg.includes('이미') ? 400 : 400
    return NextResponse.json({
      error: msg,
      alreadyMember: msg.includes('이미'),
    }, { status })
  }

  // 갱신된 상태 재조회 (RPC 결과 외 부가 정보)
  const { data: refreshed } = await admin
    .from('clubs')
    .select('current_members, status')
    .eq('id', clubId)
    .maybeSingle()
  const newCount = refreshed?.current_members ?? club.current_members + 1
  const nextStatus = refreshed?.status ?? club.status
  const nowFull = nextStatus === 'full'

  // 모임장 알림
  try {
    const nickname = await getNickname(admin, user.id)
    await notify(
      admin,
      {
        user_id: club.user_id,
        type: 'club_join',
        title: '모임 새 참여자',
        message: `${nickname}님이 모임에 참여했습니다`,
        link: `/clubs/${clubId}`,
        thumbnail_url: clubThumb,
      },
      user.id,
    )
    if (nowFull) {
      await notify(
        admin,
        {
          user_id: club.user_id,
          type: 'club_full',
          title: '모임 정원 마감',
          message: '정원이 모두 채워져 채팅방이 열렸습니다',
          link: `/clubs/${clubId}`,
          thumbnail_url: clubThumb,
        },
        user.id,
      )
    }
  } catch (notifyErr) {
    console.error('[clubs/join] notify error (non-fatal):', notifyErr)
  }

  return NextResponse.json({
    ok: true,
    joined: true,
    chatOpened: nowFull,   // 정원 마감으로 채팅 오픈
    current_members: newCount,
    status: nextStatus,
  })
}

// DELETE /api/clubs/[id]/join  —  모임 나가기 (마감 전에만)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clubId } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, req)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const banRes2 = await banGuardResponse(user.id)
  if (banRes2) return banRes2

  const limited = await enforceRateLimit(req as any, 'mutate', user.id)
  if (limited) return limited

  const admin = createAdminClient()

  let clubDQ: any = admin
    .from('clubs')
    .select('id, user_id, status, current_members, images, plaza_id')
    .eq('id', clubId)
  if (plaza) clubDQ = clubDQ.eq('plaza_id', plaza)
  const { data: club } = await clubDQ.maybeSingle()
  if (!club) return NextResponse.json({ error: '모임을 찾을 수 없습니다' }, { status: 404 })

  // 모임장은 나갈 수 없음 (모임 삭제로 처리)
  if (club.user_id === user.id) {
    return NextResponse.json({ error: '모임장은 나갈 수 없습니다. 모임을 삭제하시려면 삭제 메뉴를 사용하세요' }, { status: 400 })
  }

  // 본인 멤버십 존재 확인
  const { data: membership } = await admin
    .from('club_members').select('user_id').eq('club_id', clubId).eq('user_id', user.id).maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: '참여 중이 아닙니다' }, { status: 400 })
  }

  const { error } = await admin
    .from('club_members').delete()
    .eq('club_id', clubId).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  // 인원 감소 — atomic decrement (GREATEST로 0 이하 방지)
  await admin.rpc('change_like_count', {
    p_table: 'clubs',
    p_id: clubId,
    p_column: 'current_members',
    p_delta: -1,
  })
  const { data: refreshedClub } = await admin
    .from('clubs')
    .select('current_members')
    .eq('id', clubId)
    .maybeSingle()
  const newCount = refreshedClub?.current_members ?? Math.max((club.current_members ?? 1) - 1, 1)

  // 모임장 알림
  try {
    const nickname = await getNickname(admin, user.id)
    await notify(
      admin,
      {
        user_id: club.user_id,
        type: 'club_leave',
        title: '모임 참여 취소',
        message: `${nickname}님이 모임에서 나갔습니다`,
        link: `/clubs/${clubId}`,
        thumbnail_url:
          Array.isArray((club as any).images) && (club as any).images.length > 0
            ? String((club as any).images[0])
            : null,
      },
      user.id,
    )
  } catch (notifyErr) {
    console.error('[clubs/join DELETE] notify error:', notifyErr)
  }

  return NextResponse.json({ ok: true, current_members: newCount })
}
