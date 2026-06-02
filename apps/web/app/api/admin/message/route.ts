import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth, canAccessPlaza, getAdminWriteClient } from '@/lib/services/admin-auth'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { getCurrentPlaza } from '@/lib/plaza/server'

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/message
 *
 * 관리자 쪽지 보내기 — 단일 또는 일괄 발송.
 * - recipientId: 단일 수신자 (개별 쪽지)
 * - userIds: 수신자 배열 (일괄 쪽지)
 * 둘 중 하나만 보내면 됨.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const limited = await enforceRateLimit(request, 'admin-notify', user.id)
  if (limited) return limited

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 })
  }

  const body = await request.json()
  const message = body.message
  const subject = body.subject || ''

  // recipientId(단일) 또는 userIds(배열) 지원
  let recipientIds: string[] = []
  if (body.userIds && Array.isArray(body.userIds)) {
    recipientIds = body.userIds
  } else if (body.recipientId) {
    recipientIds = [body.recipientId]
  }

  if (recipientIds.length === 0 || !message || typeof message !== 'string') {
    return NextResponse.json({ error: "수신자와 메시지가 필요합니다" }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "메시지가 너무 깁니다 (최대 2000자)" }, { status: 400 })
  }
  if (recipientIds.length > 500) {
    return NextResponse.json({ error: "한 번에 최대 500명까지 발송 가능합니다" }, { status: 400 })
  }

  // 광장 격리
  const plaza = await getCurrentPlaza()
  if (!auth.isLegacySuper) {
    if (!canAccessPlaza(auth, plaza)) {
      return NextResponse.json({ error: "이 광장의 권한이 없습니다" }, { status: 403 })
    }
  }

  const admin = await getAdminWriteClient()
  if (!admin) {
    return NextResponse.json({ error: "Service role key 미설정" }, { status: 500 })
  }

  // 광장 회원 필터링 — 해당 광장에 속한 회원만 발송
  if (plaza) {
    const { data: plazaMembers } = await admin
      .from('plaza_profiles')
      .select('user_id')
      .eq('plaza_id', plaza)
      .in('user_id', recipientIds)
    const validIds = new Set((plazaMembers || []).map((p: any) => p.user_id))
    recipientIds = recipientIds.filter(id => validIds.has(id))
  }

  if (recipientIds.length === 0) {
    return NextResponse.json({ error: "발송 대상이 없습니다" }, { status: 400 })
  }

  const content = subject ? `[${subject}]\n${message}` : message
  let success = 0
  let failed = 0
  let lastError = ""

  // 각 수신자에게 쪽지 발송
  for (const recipientId of recipientIds) {
    try {
      // 기존 관리자 쪽지 채팅방 찾기
      const { data: existingRoom } = await admin
        .from('chat_rooms')
        .select('id')
        .eq('buyer_id', recipientId)
        .eq('post_type', 'admin_notice')
        .limit(1)
        .maybeSingle()

      let roomId: string

      if (existingRoom) {
        roomId = existingRoom.id
      } else {
        const insertData: any = {
          buyer_id: recipientId,
          seller_id: user.id,
          post_type: 'admin_notice',
          ...(plaza && { plaza_id: plaza }),
        }

        const { data: newRoom, error: roomError } = await admin
          .from('chat_rooms')
          .insert(insertData)
          .select('id')
          .single()

        if (roomError) {
          // property_id 가 필수이면 더미값으로 재시도
          if (roomError.message?.includes('property_id') || roomError.code === '23502') {
            insertData.property_id = '00000000-0000-0000-0000-000000000000'
            const { data: retryRoom, error: retryError } = await admin
              .from('chat_rooms')
              .insert(insertData)
              .select('id')
              .single()
            if (retryError) {
              console.error(`Room creation error for ${recipientId}:`, retryError)
              lastError = retryError.message
              failed++
              continue
            }
            roomId = retryRoom.id
          } else {
            console.error(`Room creation error for ${recipientId}:`, roomError)
            lastError = roomError.message
            failed++
            continue
          }
        } else {
          roomId = newRoom.id
        }
      }

      const { error: msgError } = await admin
        .from('messages')
        .insert({
          chat_room_id: roomId,
          sender_id: user.id,
          content,
        })

      if (msgError) {
        console.error(`Message send error for ${recipientId}:`, msgError)
        failed++
        continue
      }

      await admin
        .from('chat_rooms')
        .update({
          last_message: content,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', roomId)

      success++
    } catch (e) {
      console.error(`Unexpected error for ${recipientId}:`, e)
      failed++
    }
  }

  return NextResponse.json({
    success: true,
    sent: success,
    failed,
    total: recipientIds.length,
    ...(lastError && { error: lastError }),
  })
}
