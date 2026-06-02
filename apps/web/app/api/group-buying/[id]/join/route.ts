import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { notify, getNickname } from "@/lib/services/notifications"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

// POST /api/group-buying/[id]/join
// body: { quantity?: number, receive_method?: 'pickup'|'delivery',
//         recipient_name?, recipient_phone?, recipient_address?, recipient_address_detail? }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const quantity = Math.max(1, Math.min(Number(body.quantity) || 1, 99))
  let receive_method: 'pickup' | 'delivery' = body.receive_method === 'delivery' ? 'delivery' : 'pickup'
  const {
    recipient_name, recipient_phone,
    recipient_address, recipient_address_detail,
  } = body

  // 게시글 조회 — 광장 검증 (🅲 cross-plaza national 글 허용)
  let postQ: any = supabase
    .from("group_buying_posts")
    .select("id, user_id, current_participants, max_participants, status, delivery_mode, images, plaza_id, visibility")
    .eq("id", id)
  if (plaza) postQ = postQ.or(`plaza_id.eq.${plaza},visibility.eq.national`)
  const { data: post } = await postQ.maybeSingle()

  if (!post) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 })
  }

  if (post.status !== "recruiting") {
    return NextResponse.json({ error: "모집이 마감되었습니다" }, { status: 400 })
  }

  // 주최자 본인 참여 방지
  if (post.user_id === user.id) {
    return NextResponse.json({ error: "주최자는 참여할 수 없습니다" }, { status: 400 })
  }

  // delivery_mode 체크
  if (post.delivery_mode === 'pickup') receive_method = 'pickup'
  if (post.delivery_mode === 'delivery') receive_method = 'delivery'

  if (receive_method === 'delivery') {
    if (!recipient_name || !recipient_phone || !recipient_address) {
      return NextResponse.json({ error: "배송 정보를 모두 입력해주세요" }, { status: 400 })
    }
  }

  const admin = createAdminClient()

  // profiles 레코드 보장 (FK fk_group_buying_participants_user 대비)
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()
  if (!existingProfile) {
    const meta: any = user.user_metadata || {}
    await admin.from("profiles").insert({
      id: user.id,
      nickname: meta.nickname || meta.full_name || (user.email?.split("@")[0] ?? "사용자"),
      avatar_url: meta.avatar_url || null,
    })
  }

  // 원자적 join — TOCTOU 차단 (advisory lock + FOR UPDATE + quantity 합산)
  const { data: rpcRes, error: rpcErr } = await admin.rpc("gb_join_atomic_v2", {
    p_post_id: id,
    p_user_id: user.id,
    p_quantity: quantity,
    p_receive_method: receive_method,
    p_recipient_name: receive_method === 'delivery' ? recipient_name : null,
    p_recipient_phone: receive_method === 'delivery' ? recipient_phone : null,
    p_recipient_address: receive_method === 'delivery' ? recipient_address : null,
    p_recipient_address_detail: receive_method === 'delivery' ? (recipient_address_detail || null) : null,
  })
  if (rpcErr) {
    console.error("[group-buying/join] rpc error:", rpcErr)
    return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
  }
  const result = rpcRes as { ok: boolean; error?: string; current_participants?: number; status?: string; now_full?: boolean; remaining?: number }
  if (!result?.ok) {
    return NextResponse.json({
      error: result?.error || "참여에 실패했습니다",
      ...(typeof result?.remaining === "number" ? { remaining: result.remaining } : {}),
    }, { status: 400 })
  }

  const newTotalQty = result.current_participants ?? 0
  const nextStatus = result.status ?? post.status
  const nowFull = !!result.now_full

  // 주최자 알림
  try {
    const nickname = await getNickname(admin, user.id)
    const postThumb = Array.isArray((post as any).images) && (post as any).images.length > 0
      ? String((post as any).images[0])
      : null
    await notify(
      admin,
      {
        user_id: post.user_id,
        type: "group_buying_join",
        title: "공동구매 새 참여자",
        message: `${nickname}님이 참여했습니다 (수량 ${quantity}개)`,
        link: `/group-buying/${id}`,
        thumbnail_url: postThumb,
      },
      user.id,
    )
    if (nowFull) {
      await notify(
        admin,
        {
          user_id: post.user_id,
          type: "group_buying_full",
          title: "공동구매 정원 마감",
          message: "목표 수량이 달성되어 모집이 마감되었습니다",
          link: `/group-buying/${id}`,
          thumbnail_url: postThumb,
        },
        user.id,
      )
    }
  } catch (notifyErr) {
    console.error("[group-buying/join] notify error (non-fatal):", notifyErr)
  }

  return NextResponse.json({
    ok: true,
    joined: true,
    chatOpened: nowFull,
    current_participants: newTotalQty,
    status: nextStatus,
  })
}

// DELETE /api/group-buying/[id]/join  —  참여 취소 (모집중 + 본인만)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  const limited = await enforceRateLimit(request as any, 'mutate', user.id)
  if (limited) return limited

  const admin = createAdminClient()

  let postDQ: any = admin
    .from("group_buying_posts")
    .select("id, user_id, status, images, plaza_id, visibility")
    .eq("id", id)
  if (plaza) postDQ = postDQ.or(`plaza_id.eq.${plaza},visibility.eq.national`)
  const { data: post } = await postDQ.maybeSingle()
  if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 })

  if (post.user_id === user.id) {
    return NextResponse.json({ error: "주최자는 취소할 수 없습니다" }, { status: 400 })
  }
  if (post.status !== 'recruiting') {
    return NextResponse.json({ error: "모집 마감 후에는 취소할 수 없습니다" }, { status: 400 })
  }

  const { data: existing } = await admin
    .from("group_buying_participants")
    .select("quantity")
    .eq("post_id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: "참여 내역이 없습니다" }, { status: 400 })
  }

  const { error: delErr } = await admin
    .from("group_buying_participants")
    .delete()
    .eq("post_id", id)
    .eq("user_id", user.id)
  if (delErr) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  // current_participants atomic decrement (existing.quantity 만큼 차감)
  const { error: rpcDecErr } = await admin.rpc('change_like_count', {
    p_table: 'group_buying_posts',
    p_id: id,
    p_column: 'current_participants',
    p_delta: -(existing.quantity || 1),
  })
  if (rpcDecErr) {
    // RPC 실패 시 직접 update fallback — 참여자는 이미 삭제됨, 카운트 동기화 필수
    console.warn("[group-buying/join DELETE] decrement RPC failed, fallback:", rpcDecErr.message)
    const { data: currentPost } = await admin
      .from("group_buying_posts")
      .select("current_participants")
      .eq("id", id)
      .maybeSingle()
    if (currentPost) {
      await admin
        .from("group_buying_posts")
        .update({ current_participants: Math.max(0, (currentPost.current_participants || 0) - (existing.quantity || 1)) })
        .eq("id", id)
    }
  }
  const { data: refreshedPost } = await admin
    .from("group_buying_posts")
    .select("current_participants")
    .eq("id", id)
    .maybeSingle()
  const totalQty = refreshedPost?.current_participants ?? 0

  // 주최자에게 취소 알림
  try {
    const nickname = await getNickname(admin, user.id)
    const postThumb = Array.isArray((post as any).images) && (post as any).images.length > 0
      ? String((post as any).images[0])
      : null
    await notify(
      admin,
      {
        user_id: post.user_id,
        type: "group_buying_cancel",
        title: "공동구매 참여 취소",
        message: `${nickname}님이 참여를 취소했습니다`,
        link: `/group-buying/${id}`,
        thumbnail_url: postThumb,
      },
      user.id,
    )
  } catch (notifyErr) {
    console.error("[group-buying/join DELETE] notify error:", notifyErr)
  }

  return NextResponse.json({ ok: true, current_participants: totalQty })
}

// GET /api/group-buying/[id]/join  —  참여자 목록 (PII 마스킹)
//   본인 참여 + 주최자만 recipient_name/phone/address 같은 배송정보 평문 노출.
//   그 외엔 마스킹된 형태만.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // 인증 — 비로그인 사용자엔 PII 일체 차단
  const { user } = await getAuthedUser(supabase, request)
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 })
  }

  // 주최자 ID 조회 (PII 노출 권한 결정용)
  const { data: post } = await supabase
    .from("group_buying_posts")
    .select("id, user_id, plaza_id")
    .eq("id", id)
    .maybeSingle()
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 })
  }
  const isOrganizer = (post as any).user_id === user.id

  const { data: participantsData, error } = await supabase
    .from("group_buying_participants")
    .select("*")
    .eq("post_id", id)
    .order("joined_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "참여자 목록을 불러올 수 없습니다" }, { status: 500 })
  }

  const userIds = participantsData?.map((p: any) => p.user_id) ?? []
  let profilesMap: Record<string, { id: string; nickname: string | null; avatar_url: string | null }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .in("id", userIds)
    profiles?.forEach((p: any) => { profilesMap[p.id] = p })
  }

  const maskName = (s: string | null) => {
    if (!s) return null
    if (s.length <= 1) return '*'
    return s[0] + '*'.repeat(Math.max(1, s.length - 1))
  }
  const maskPhone = (s: string | null) => {
    if (!s) return null
    return s.replace(/\d(?=\d{4})/g, '*')
  }
  const maskAddress = (s: string | null) => {
    if (!s) return null
    // "서울시 강남구 ..." 정도까지만 보이게
    const parts = s.split(' ')
    return parts.slice(0, 2).join(' ') + (parts.length > 2 ? ' ***' : '')
  }

  const participants = (participantsData || []).map((p: any) => {
    const isSelf = p.user_id === user.id
    const showRaw = isOrganizer || isSelf
    return {
      ...p,
      // 배송 정보는 본인/주최자에게만 평문 — 그 외엔 마스킹
      recipient_name: showRaw ? p.recipient_name : maskName(p.recipient_name),
      recipient_phone: showRaw ? p.recipient_phone : maskPhone(p.recipient_phone),
      recipient_address: showRaw ? p.recipient_address : maskAddress(p.recipient_address),
      recipient_address_detail: showRaw ? p.recipient_address_detail : null,
      profiles: profilesMap[p.user_id] || null,
    }
  })

  return NextResponse.json({ participants })
}
