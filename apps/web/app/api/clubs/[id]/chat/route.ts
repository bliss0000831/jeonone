import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'

export const dynamic = 'force-dynamic'

// 광장 격리: 다른 광장의 모임이면 404 처럼 취급
async function assertClubInPlaza(clubId: string): Promise<NextResponse | null> {
  const plaza = await getCurrentPlaza()
  if (!plaza) return null
  const admin = createAdminClient()
  const { data } = await admin.from('clubs').select('plaza_id').eq('id', clubId).maybeSingle()
  if (!data || (data.plaza_id && data.plaza_id !== plaza)) {
    return NextResponse.json({ error: '모임을 찾을 수 없습니다' }, { status: 404 })
  }
  return null
}

// GET /api/clubs/[id]/chat  —  메시지 목록 + 멤버 프로필
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clubId } = await params
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request as any)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const plazaErr = await assertClubInPlaza(clubId)
  if (plazaErr) return plazaErr

  // 멤버 여부 확인 (RLS 도 검사하지만 명확한 에러 메시지 용)
  const { data: membership } = await supabase
    .from('club_members').select('user_id, last_read_at')
    .eq('club_id', clubId).eq('user_id', user.id).maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: '이 모임의 채팅방에 접근할 수 없습니다' }, { status: 403 })
  }

  const [clubRes, messagesRes, membersRes] = await Promise.all([
    supabase.from('clubs').select('id, title, sport_type, images, status, max_members, current_members, user_id').eq('id', clubId).single(),
    supabase.from('club_chat_messages').select('id, club_id, user_id, content, image_url, system_type, created_at').eq('club_id', clubId).limit(200).order('created_at', { ascending: true }),
    supabase.from('club_members').select('user_id, joined_at').eq('club_id', clubId),
  ])

  if (clubRes.error) {
    return NextResponse.json({ error: '모임을 찾을 수 없습니다' }, { status: 404 })
  }

  // 멤버 프로필 bulk 조회
  const memberIds = (membersRes.data || []).map((m) => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles').select('id, nickname, avatar_url').in('id', memberIds)

  const profileMap: Record<string, any> = {}
  ;(profiles || []).forEach((p) => { profileMap[p.id] = p })

  return NextResponse.json({
    club: clubRes.data,
    messages: messagesRes.data || [],
    members: (membersRes.data || []).map((m) => ({
      user_id: m.user_id,
      joined_at: m.joined_at,
      profile: profileMap[m.user_id] || null,
    })),
    myLastReadAt: membership.last_read_at,
    ownerId: clubRes.data.user_id,
  })
}

// POST /api/clubs/[id]/chat  —  메시지 전송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clubId } = await params
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request as any)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 채팅 도배 방어 — comment 리밋 (분당 10건)
  const limited = await enforceRateLimit(request, 'comment', user.id)
  if (limited) return limited

  const plazaErr = await assertClubInPlaza(clubId)
  if (plazaErr) return plazaErr

  const body = await request.json().catch(() => ({}))
  const content: string | null = body?.content?.trim() || null
  const image_url: string | null = body?.image_url || null
  if (!content && !image_url) {
    return NextResponse.json({ error: '내용이 비었습니다' }, { status: 400 })
  }
  // 길이 제한 — 폭탄/스팸 방어
  if (content && content.length > 5000) {
    return NextResponse.json({ error: '메시지가 너무 깁니다 (최대 5000자)' }, { status: 400 })
  }
  if (image_url && (typeof image_url !== 'string' || image_url.length > 1000)) {
    return NextResponse.json({ error: 'image_url 형식 오류' }, { status: 400 })
  }

  // 멤버 확인
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('club_members').select('user_id').eq('club_id', clubId).eq('user_id', user.id).maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: '채팅방 멤버가 아닙니다' }, { status: 403 })
  }

  const { data: inserted, error } = await admin
    .from('club_chat_messages')
    .insert({ club_id: clubId, user_id: user.id, content, image_url })
    .select().single()

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  // 보낸 사람은 자동 읽음 처리
  await admin.from('club_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('club_id', clubId).eq('user_id', user.id)

  return NextResponse.json({ ok: true, message: inserted })
}
