import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { getCurrentPlaza } from '@/lib/plaza/server'

// GET /api/group-buying-chat/rooms  —  내 공동구매 채팅방 목록
export async function GET(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ rooms: [], totalUnread: 0 })

  const plaza = await getCurrentPlaza()

  let q = supabase
    .from('my_group_buying_chat_rooms')
    .select('post_id, title, product_name, images, status, group_price, max_participants, current_participants, owner_id, user_id, payment_status, quantity, last_read_at, last_message, last_message_at, unread_count, plaza_id, buyer_plaza_id, visibility')
    .eq('user_id', user.id)
    .limit(50)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (plaza) q = q.eq('plaza_id', plaza)

  const { data, error } = await q
  if (error) return NextResponse.json({ rooms: [], error: "처리에 실패했습니다" })

  const rooms = data || []
  const totalUnread = rooms.reduce((s: number, r: any) => s + (r.unread_count || 0), 0)

  return NextResponse.json({ rooms, totalUnread })
}
