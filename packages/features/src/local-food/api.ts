/**
 * Local-Food (로컬푸드) 도메인 — Supabase 호출. RN + 웹 공유.
 *
 * 광장 web /api/local-food/[id] 가 반환하는 형태와 동일하게 매핑:
 *   - posts.* + author{nickname,avatar_url,account_type} + user_liked
 *   - 조회수 RPC: increment_view_count(p_table='local_food', p_column='view_count')
 *   - 좋아요 카운트: change_like_count(p_table='local_food', p_column='like_count', p_delta)
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthorByPlaza } from "../profile/api"
import { incrementViewCount } from "../shared/rpc-helpers"

export interface LocalFoodPost {
  id: string
  user_id: string
  title: string
  description: string | null
  content: string | null
  price: number
  original_price: number | null
  unit: string | null
  category: string
  images: string[] | null
  location: string | null
  district: string | null
  farm_name: string | null  // 농가/가게/브랜드명 (옵션) — 카드에 "🌱 행복농원" 표시용
  status: "selling" | "sold_out" | "hidden" | string
  view_count: number
  like_count: number
  shipping_fee: number
  free_shipping: boolean
  created_at: string
}

export interface LocalFoodAuthor {
  id: string
  nickname: string | null
  avatar_url: string | null
  account_type: string | null
}

/** 단건 + 작성자 + 좋아요 여부 + 조회수 RPC */
export async function getLocalFoodPost(
  supabase: SupabaseClient,
  id: string,
  plaza: string | null,
  userId: string | null,
): Promise<{
  post: LocalFoodPost | null
  author: LocalFoodAuthor | null
  user_liked: boolean
}> {
  // plaza 필터 제거 — 전국공개(visibility=national) 글은 타광장에서도 진입 가능해야 함
  const { data: post } = await supabase
    .from("local_food")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!post) return { post: null, author: null, user_liked: false }
  // 다른 광장의 글이라면 visibility=national 인 경우에만 노출
  const pp = post as any
  if (plaza && pp.plaza_id !== plaza && pp.visibility !== "national") {
    return { post: null, author: null, user_liked: false }
  }
  // 🅲 광장 격리 — 작성자와 좋아요 여부를 병렬로 조회
  const likedPromise = userId
    ? supabase
        .from("local_food_likes")
        .select("user_id")
        .eq("local_food_id", id)
        .eq("user_id", userId)
        .maybeSingle()
    : Promise.resolve({ data: null } as any)
  const [author, { data: like }] = await Promise.all([
    getAuthorByPlaza(
      supabase,
      (post as any).user_id,
      (post as any).plaza_id ?? plaza,
    ),
    likedPromise,
  ])
  incrementViewCount(supabase, "local_food", id, "view_count")
  return {
    post: post as LocalFoodPost,
    author: (author as LocalFoodAuthor | null) ?? null,
    user_liked: !!like,
  }
}

/** 좋아요 토글 — change_like_count RPC 동기화 */
export async function toggleLocalFoodLike(
  supabase: SupabaseClient,
  args: { postId: string; userId: string; isLiked: boolean },
): Promise<boolean> {
  if (args.isLiked) {
    await supabase
      .from("local_food_likes")
      .delete()
      .eq("user_id", args.userId)
      .eq("local_food_id", args.postId)
    void supabase.rpc("change_like_count", {
      p_table: "local_food",
      p_id: args.postId,
      p_column: "like_count",
      p_delta: -1,
    })
    return false
  }
  const { error } = await supabase
    .from("local_food_likes")
    .insert({ user_id: args.userId, local_food_id: args.postId })
  if (error && (error as any).code !== "23505") throw error
  void supabase.rpc("change_like_count", {
    p_table: "local_food",
    p_id: args.postId,
    p_column: "like_count",
    p_delta: 1,
  })
  return true
}

export async function deleteLocalFoodPost(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("local_food").delete().eq("id", id)
  if (error) throw error
}

/**
 * 새 로컬푸드 글 작성 — 광장 web POST /api/local-food 와 동일 엔드포인트.
 * 생산자(account_type='producer') 또는 admin 만 가능 — 서버 검증.
 */
export interface LocalFoodCreateInput {
  title: string
  description?: string | null
  content?: string | null
  price: number
  original_price?: number | null
  unit: string
  category: string
  location?: string | null
  district?: string | null
  farm_name?: string | null
  shipping_fee?: number | null
  free_shipping?: boolean | null
  images?: string[] | null
  visibility?: "plaza" | "national" | null
}

interface LFFetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

export async function createLocalFoodPost(
  fetcher: LFFetchAdapter,
  input: LocalFoodCreateInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const r = await fetcher("/api/local-food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        description: input.description ?? null,
        content: input.content ?? null,
        price: input.price,
        original_price: input.original_price ?? null,
        unit: input.unit,
        category: input.category,
        location: input.location ?? null,
        district: input.district ?? null,
        farm_name: input.farm_name?.trim() ? input.farm_name.trim() : null,
        shipping_fee: input.free_shipping ? 0 : (input.shipping_fee ?? 0),
        free_shipping: !!input.free_shipping,
        images: input.images && input.images.length > 0 ? input.images : null,
        visibility: input.visibility ?? "plaza",
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true, postId: data?.post?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

/** 로컬푸드 글 수정 — 광장 web PATCH /api/local-food/[id]. */
export async function updateLocalFoodPost(
  fetcher: LFFetchAdapter,
  id: string,
  input: LocalFoodCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/local-food/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        description: input.description ?? null,
        content: input.content ?? null,
        price: input.price,
        original_price: input.original_price ?? null,
        unit: input.unit,
        category: input.category,
        location: input.location ?? null,
        district: input.district ?? null,
        farm_name: input.farm_name?.trim() ? input.farm_name.trim() : null,
        shipping_fee: input.free_shipping ? 0 : (input.shipping_fee ?? 0),
        free_shipping: !!input.free_shipping,
        images: input.images && input.images.length > 0 ? input.images : null,
        visibility: input.visibility ?? "plaza",
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

/** 로컬푸드 주문 생성 — POST /api/local-food-orders. */
export interface LocalFoodOrderInput {
  items: Array<{ local_food_id: string; quantity: number }>
  delivery_addr: {
    recipient_name: string
    phone: string
    postcode?: string
    addr1: string
    addr2?: string
  }
  buyer_memo?: string | null
  points_used?: number
}

export async function createLocalFoodOrder(
  fetcher: LFFetchAdapter,
  input: LocalFoodOrderInput,
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  try {
    const r = await fetcher("/api/local-food-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: input.items,
        delivery_addr: input.delivery_addr,
        buyer_memo: input.buyer_memo ?? null,
        points_used: input.points_used ?? 0,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "주문 생성 실패" }
    return { ok: true, orderId: data?.order?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "주문 생성 실패" }
  }
}

export async function payLocalFoodOrder(
  fetcher: LFFetchAdapter,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/local-food-orders/${orderId}/mock-pay`, {
      method: "POST",
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "결제 처리 실패" }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "결제 처리 실패" }
  }
}

/** 플랫폼 수수료 5% (web lib/local-food-orders 와 동일). */
export const PLATFORM_FEE_RATE = 0.05
export function calculateOrderFee(amount: number): number {
  if (amount <= 0) return 0
  return Math.ceil(amount * PLATFORM_FEE_RATE)
}

// 중앙 카테고리에서 re-export — packages/features/src/categories.ts
export { LOCAL_FOOD_CATEGORIES, LOCAL_FOOD_UNITS } from "../categories"
