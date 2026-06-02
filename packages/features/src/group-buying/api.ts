/**
 * Group Buying — Supabase 호출. RN + 웹 공유.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GroupBuyingPost as DomainGbPost, JoinInput } from './types'
import { getAuthorByPlaza } from '../profile/api'

export interface GbPost {
  id: string
  user_id: string
  title: string
  description: string
  product_name: string
  original_price: number | null
  group_price: number
  min_participants: number
  max_participants: number | null
  current_participants: number
  deadline: string | null
  images: string[] | null
  status: 'recruiting' | 'confirmed' | 'completed' | 'cancelled'
  location: string | null
  created_at: string
  views: number
  delivery_mode?: 'pickup' | 'delivery' | 'both'
  pickup_location?: string | null
  pickup_time?: string | null
  payment_required?: boolean
  delivery_fee?: number
  delivery_fee_mode?: 'separate' | 'included' | 'free'
}

export interface GbProfile {
  id: string
  nickname: string | null
  avatar_url: string | null
}

export interface GbParticipant {
  id: string
  user_id: string
  created_at: string
  profile: GbProfile | null
}

export async function listPosts(
  _supabase: SupabaseClient,
  _plaza: string | null,
): Promise<DomainGbPost[]> {
  throw new Error('not implemented')
}

/** 공구 단건 + 작성자 + 조회수 RPC */
export async function getPost(
  supabase: SupabaseClient,
  id: string,
  plaza?: string | null,
): Promise<{ post: GbPost | null; profile: GbProfile | null }> {
  // plaza 필터 제거 — 전국공개(visibility=national) 글은 타광장에서도 진입 가능해야 함
  const { data: post } = await supabase
    .from('group_buying_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!post) return { post: null, profile: null }
  // 다른 광장의 글이라면 visibility=national 인 경우에만 노출
  const p = post as any
  if (plaza && p.plaza_id !== plaza && p.visibility !== 'national') {
    return { post: null, profile: null }
  }
  // 🅲 광장 격리 — 글의 plaza_id 기준 plaza_profiles 우선
  const profile = await getAuthorByPlaza(
    supabase,
    (post as any).user_id,
    (post as any).plaza_id ?? plaza,
  )
  void supabase.rpc('increment_view_count', {
    p_table: 'group_buying_posts',
    p_id: id,
    p_column: 'views',
  })
  return { post: post as GbPost, profile: (profile as GbProfile | null) ?? null }
}

/** 참여자 목록 + 프로필 batch */
export async function listParticipants(
  supabase: SupabaseClient,
  postId: string,
): Promise<GbParticipant[]> {
  const { data: rows } = await supabase
    .from('group_buying_participants')
    .select('id, user_id, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (!rows || rows.length === 0) return []
  const ids = (rows as any[]).map((r) => r.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url')
    .in('id', ids)
  const map = new Map<string, GbProfile>(((profiles ?? []) as any[]).map((p) => [p.id, p]))
  return (rows as any[]).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    profile: map.get(r.user_id) ?? null,
  }))
}

/** 호스트 신뢰 통계 */
export async function getHostStats(
  supabase: SupabaseClient,
  hostId: string,
): Promise<{
  success_count: number
  cancel_count: number
  total_count: number
  success_pct: number | null
}> {
  try {
    const { data } = await supabase
      .from('group_buying_posts')
      .select('status')
      .eq('user_id', hostId)
      .limit(200)
    const rows = (data ?? []) as any[]
    // 단일 패스 (이전: 2회 전체 스캔)
    let success = 0, cancel = 0
    for (const r of rows) {
      if (r.status === 'completed') success++
      else if (r.status === 'cancelled') cancel++
    }
    const total = rows.length
    return {
      success_count: success,
      cancel_count: cancel,
      total_count: total,
      success_pct: total > 0 ? Math.round((success / total) * 100) : null,
    }
  } catch {
    return { success_count: 0, cancel_count: 0, total_count: 0, success_pct: null }
  }
}

export async function isJoined(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('group_buying_participants')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function isWishlisted(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('group_buying_wishlist')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function toggleWishlist(
  supabase: SupabaseClient,
  args: { postId: string; userId: string; isWishlisted: boolean },
): Promise<boolean> {
  if (args.isWishlisted) {
    const { error } = await supabase
      .from('group_buying_wishlist')
      .delete()
      .eq('post_id', args.postId)
      .eq('user_id', args.userId)
    if (error) throw error
    return false
  }
  const { error } = await supabase
    .from('group_buying_wishlist')
    .insert({ post_id: args.postId, user_id: args.userId })
  if (error && (error as any).code !== '23505') throw error
  return true
}

/**
 * 공구 참여 — atomic RPC `gb_join_atomic_v2` (race-free).
 */
export async function joinAtomic(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
  input: JoinInput,
): Promise<{
  ok: boolean
  error?: string
  current_participants?: number
  status?: string
  now_full?: boolean
  remaining?: number
}> {
  const { data, error } = await supabase.rpc('gb_join_atomic_v2', {
    p_post_id: postId,
    p_user_id: userId,
    p_quantity: (input as any).quantity ?? 1,
    p_receive_method: (input as any).receive_method ?? 'pickup',
    p_recipient_name: (input as any).recipient_name ?? null,
    p_recipient_phone: (input as any).recipient_phone ?? null,
    p_recipient_address: (input as any).recipient_address ?? null,
    p_recipient_address_detail: (input as any).recipient_address_detail ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return (data as any) ?? { ok: true }
}

/** 참여 취소 */
export async function cancelJoin(
  supabase: SupabaseClient,
  args: { postId: string; userId: string },
): Promise<void> {
  const { error } = await supabase
    .from('group_buying_participants')
    .delete()
    .eq('post_id', args.postId)
    .eq('user_id', args.userId)
  if (error) throw error
}

/** 호스트: 마감 / 재오픈 / 삭제 */
export async function closePost(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from('group_buying_posts')
    .update({ status: 'confirmed' })
    .eq('id', postId)
  if (error) throw error
}

export async function reopenPost(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from('group_buying_posts')
    .update({ status: 'recruiting' })
    .eq('id', postId)
  if (error) throw error
}

export async function deletePost(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from('group_buying_posts')
    .delete()
    .eq('id', postId)
  if (error) throw error
}

/**
 * 새 공동구매 글 작성 — 광장 web POST /api/group-buying 와 동일 엔드포인트.
 * 사장님(account_type='business') 또는 admin 만 가능 — 서버에서 검증.
 */
export interface GbCreatePostInput {
  title: string
  description: string
  product_name: string
  original_price?: number | null
  group_price: number
  min_participants: number
  max_participants?: number | null
  deadline?: string | null
  location?: string | null
  delivery_mode: 'pickup' | 'delivery' | 'both'
  delivery_fee?: number
  delivery_fee_mode?: 'included' | 'separate'
  pickup_location?: string | null
  pickup_time?: string | null
  account_info?: string | null
  visibility?: 'plaza' | 'national'
  payment_required?: boolean
  images?: string[] | null
}

interface GbFetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

/** 공구 글 수정 — PATCH /api/group-buying/[id]. */
/**
 * 마감 처리 — deadline 도달했고 status='recruiting' 인 공구를 일괄 정리.
 *   - 참여자 ≥ min_participants → status='confirmed' (성사)
 *   - 그 외 → status='cancelled' + 모든 participants payment_status='refunded'
 *
 * PG 미연동 단계: 환불은 status 만 변경. 실제 환불은 PG 연결 시 webhook 에서 처리.
 * 호출 시점: 공구 상세 진입 시 호스트가 마감 후 처음 보는 경우, 또는 서버 cron.
 */
export async function finalizeExpiredGroupBuying(
  supabase: SupabaseClient,
  postId: string,
): Promise<{ ok: boolean; status?: "confirmed" | "cancelled"; refunded?: number; error?: string }> {
  try {
    const { data: post } = await supabase
      .from("group_buying_posts")
      .select("id, status, min_participants, current_participants, deadline")
      .eq("id", postId)
      .maybeSingle()
    if (!post) return { ok: false, error: "공구를 찾을 수 없습니다" }
    if (post.status !== "recruiting") return { ok: true } // 이미 처리됨
    const now = new Date()
    if (post.deadline && new Date(post.deadline) > now) return { ok: true } // 아직 미마감

    const met = (post.current_participants ?? 0) >= (post.min_participants ?? 0)
    if (met) {
      await supabase
        .from("group_buying_posts")
        .update({ status: "confirmed", confirmed_at: now.toISOString() })
        .eq("id", postId)
      return { ok: true, status: "confirmed" }
    } else {
      // 취소 + 전원 환불
      await supabase
        .from("group_buying_posts")
        .update({ status: "cancelled", cancelled_at: now.toISOString() })
        .eq("id", postId)
      const { data: parts } = await supabase
        .from("group_buying_participants")
        .update({
          payment_status: "refunded",
          refunded_at: now.toISOString(),
        })
        .eq("post_id", postId)
        .neq("payment_status", "refunded")
        .select("id")
      return { ok: true, status: "cancelled", refunded: parts?.length ?? 0 }
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "마감 처리 실패" }
  }
}

export async function updateGroupBuyingPost(
  fetcher: GbFetchAdapter,
  id: string,
  input: GbCreatePostInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/group-buying/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        product_name: input.product_name,
        original_price: input.original_price ?? null,
        group_price: input.group_price,
        min_participants: input.min_participants,
        max_participants: input.max_participants ?? null,
        deadline: input.deadline ?? null,
        location: input.location ?? null,
        delivery_mode: input.delivery_mode,
        delivery_fee: input.delivery_fee ?? 0,
        delivery_fee_mode: input.delivery_fee_mode ?? 'separate',
        pickup_location: input.pickup_location ?? null,
        pickup_time: input.pickup_time ?? null,
        account_info: input.account_info ?? null,
        visibility: input.visibility ?? 'plaza',
        payment_required: input.payment_required ?? false,
        images: input.images && input.images.length > 0 ? input.images : null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || '처리에 실패했습니다' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '처리에 실패했습니다' }
  }
}

export async function createGroupBuyingPost(
  fetcher: GbFetchAdapter,
  input: GbCreatePostInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const r = await fetcher('/api/group-buying', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        product_name: input.product_name,
        original_price: input.original_price ?? null,
        group_price: input.group_price,
        min_participants: input.min_participants,
        max_participants: input.max_participants ?? null,
        deadline: input.deadline ?? null,
        location: input.location ?? null,
        delivery_mode: input.delivery_mode,
        delivery_fee: input.delivery_fee ?? 0,
        delivery_fee_mode: input.delivery_fee_mode ?? 'separate',
        pickup_location: input.pickup_location ?? null,
        pickup_time: input.pickup_time ?? null,
        account_info: input.account_info ?? null,
        visibility: input.visibility ?? 'plaza',
        payment_required: input.payment_required ?? false,
        images: input.images && input.images.length > 0 ? input.images : null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      // Zod 검증 issues 가 있으면 상세 메시지 노출
      const issues = Array.isArray(data?.issues) && data.issues.length > 0
        ? '\n· ' + data.issues.map((i: any) => `${i.path}: ${i.message}`).join('\n· ')
        : ''
      return { ok: false, error: (data?.error || '처리에 실패했습니다') + issues }
    }
    return { ok: true, postId: data?.post?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '처리에 실패했습니다' }
  }
}

/**
 * 공구 주문 생성 — 광장 web POST /api/group-buying-orders.
 * 결제 모드 (post.payment_required=true) 일 때만 사용.
 */
export interface GbOrderInput {
  post_id: string
  quantity: number
  receive_method: 'pickup' | 'delivery'
  delivery_addr?: {
    recipient_name: string
    phone: string
    postcode?: string
    addr1: string
    addr2?: string
  } | null
  buyer_memo?: string | null
  points_used?: number
}

export async function createGbOrder(
  fetcher: GbFetchAdapter,
  input: GbOrderInput,
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  try {
    const r = await fetcher('/api/group-buying-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: input.post_id,
        quantity: input.quantity,
        receive_method: input.receive_method,
        delivery_addr: input.delivery_addr ?? null,
        buyer_memo: input.buyer_memo ?? null,
        points_used: input.points_used ?? 0,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || '주문 생성 실패' }
    return { ok: true, orderId: data?.order?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '주문 생성 실패' }
  }
}

/** Mock 결제 처리 — POST /api/group-buying-orders/[id]/mock-pay. */
export async function payGbOrder(
  fetcher: GbFetchAdapter,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/group-buying-orders/${orderId}/mock-pay`, {
      method: 'POST',
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || '결제 처리 실패' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '결제 처리 실패' }
  }
}

/**
 * 결제 모드 주문 생성 (idempotency_key 처리 포함). RN 미사용 — 웹 fallback.
 */
export async function createOrder(
  _supabase: SupabaseClient,
  _userId: string,
  _input: {
    post_id: string
    quantity: number
    receive_method: 'pickup' | 'delivery'
    delivery_addr?: any
    points_used?: number
    idempotency_key?: string
  },
): Promise<{ order: any; idempotent?: boolean; error?: string }> {
  throw new Error('not implemented')
}
