import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { getCurrentPlaza } from '@/lib/plaza/server'

// GET /api/chat/unread-total  —  전체 채팅 안읽음 개수 (1:1 + 모임 + 공동구매)
//
// 광장 격리 — 앱 useUnreadTotal 과 동일 기준: "현재 광장"의 안읽음만 집계한다.
//   · messages(1:1) / my_club_chat_rooms(모임): plaza_id = 현재 광장
//   · my_group_buying_chat_rooms(공구): cross-plaza 라 소유자/구매자 측 광장으로 필터
// (이전엔 plaza 필터가 없어 전 광장 합산 → 앱 뱃지와 숫자가 달랐음)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ total: 0 })

  // 1:1 채팅 안읽음 — 현재 광장만
  let directQ: any = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .neq('sender_id', user.id)
  if (plaza) directQ = directQ.eq('plaza_id', plaza)

  // 모임 채팅 안읽음(view) — 현재 광장만
  let clubQ: any = supabase
    .from('my_club_chat_rooms')
    .select('unread_count, club_id')
    .eq('user_id', user.id)
  if (plaza) clubQ = clubQ.eq('plaza_id', plaza)

  const [direct, club, gb] = await Promise.all([
    directQ,
    clubQ,
    // 공동구매 채팅 안읽음(view) — cross-plaza 라 측별 광장으로 JS 필터
    supabase
      .from('my_group_buying_chat_rooms')
      .select('unread_count, post_id, plaza_id, buyer_plaza_id, owner_id, user_id')
      .eq('user_id', user.id),
  ])

  // 모임: club_id 중복 제거(앱과 동일)
  const clubMap = new Map<string, number>()
  for (const r of (club.data || []) as any[]) {
    if (!clubMap.has(r.club_id)) clubMap.set(r.club_id, r.unread_count || 0)
  }
  const clubUnread = [...clubMap.values()].reduce((a, b) => a + b, 0)

  // 공구: post_id 중복 제거 + 광장 격리(앱과 동일 — 소유자는 plaza_id, 구매자는 buyer_plaza_id)
  const gbMap = new Map<string, number>()
  for (const r of (gb.data || []) as any[]) {
    if (gbMap.has(r.post_id)) continue
    if (plaza) {
      const isOwner = r.owner_id === user.id
      const matchPlaza = isOwner
        ? r.plaza_id === plaza
        : (r.buyer_plaza_id ?? r.plaza_id) === plaza
      if (!matchPlaza) continue
    }
    gbMap.set(r.post_id, r.unread_count || 0)
  }
  const gbUnread = [...gbMap.values()].reduce((a, b) => a + b, 0)

  const directUnread = direct.count || 0

  return NextResponse.json(
    {
      total: directUnread + clubUnread + gbUnread,
      direct: directUnread,
      club: clubUnread,
      group_buying: gbUnread,
    },
    { headers: { 'Cache-Control': 'private, max-age=20' } },
  )
}
