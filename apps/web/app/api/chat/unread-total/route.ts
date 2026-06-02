import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'

// GET /api/chat/unread-total  —  전체 채팅 안읽음 개수 (1:1 + 모임)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ total: 0 })

  // 세 쿼리 병렬 실행 (기존 순차 → 셋 중 최대값 시간으로 단축)
  const [direct, club, gb] = await Promise.all([
    // 1:1 채팅 안읽음
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .neq('sender_id', user.id),
    // 모임 채팅 안읽음 (view)
    supabase
      .from('my_club_chat_rooms')
      .select('unread_count')
      .eq('user_id', user.id),
    // 공동구매 채팅 안읽음 (view)
    supabase
      .from('my_group_buying_chat_rooms')
      .select('unread_count')
      .eq('user_id', user.id),
  ])

  const clubUnread = (club.data || []).reduce((s, r: any) => s + (r.unread_count || 0), 0)
  const gbUnread = (gb.data || []).reduce((s, r: any) => s + (r.unread_count || 0), 0)
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
