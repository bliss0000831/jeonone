import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"

// GET /api/club-chat/rooms  —  내가 속한 모임 채팅방 목록 + unread count
export async function GET(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { data, error } = await supabase
    .from('my_club_chat_rooms')
    .select('club_id, title, images, sport_type, status, max_members, current_members, user_id, joined_at, last_read_at, last_message, last_message_at, unread_count')
    .eq('user_id', user.id)
    .limit(50)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  return NextResponse.json({
    rooms: data || [],
    totalUnread: (data || []).reduce((sum, r) => sum + (r.unread_count || 0), 0),
  })
}
