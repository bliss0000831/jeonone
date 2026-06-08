/**
 * Secondhand (중고거래) 도메인 — Supabase 호출. RN + 웹 공유.
 *
 * 광장 web /secondhand/[id] 와 동일 패턴:
 *   - secondhand_posts + profiles 별도 join
 *   - 조회수 RPC: increment_view_count(p_table='secondhand_posts', p_column='views')
 *   - 좋아요는 secondhand_likes + likes 컬럼 동기화 (web inline)
 *   - 상태: active / reserved / completed
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthorByPlaza } from "../profile/api"
import { incrementViewCount } from "../shared/rpc-helpers"

export type SecondhandStatus = "active" | "reserved" | "completed" | string

export interface SecondhandPost {
  id: string
  user_id: string
  title: string
  description: string | null
  category: string | null
  price: number
  is_price_negotiable: boolean
  images: string[] | null
  status: SecondhandStatus
  location: string | null
  condition: string | null // 상품 상태 — 새상품/거의 새것/사용감 적음/사용감 많음
  views: number
  likes: number
  created_at: string
  lat: number | null
  lng: number | null
}

/** 표준 상품 상태 옵션 (등록/수정 폼 칩 + 카드 뱃지에 사용). */
export const SECONDHAND_CONDITIONS = [
  "새상품",
  "거의 새것",
  "사용감 적음",
  "사용감 많음",
] as const
export type SecondhandCondition = (typeof SECONDHAND_CONDITIONS)[number]

export interface SecondhandAuthor {
  id: string
  nickname: string | null
  avatar_url: string | null
}

export async function getSecondhandPost(
  supabase: SupabaseClient,
  id: string,
  plaza: string | null,
  userId: string | null,
): Promise<{
  post: SecondhandPost | null
  author: SecondhandAuthor | null
  is_liked: boolean
}> {
  let q = supabase.from("secondhand_posts").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post } = await q.maybeSingle()
  if (!post) return { post: null, author: null, is_liked: false }
  // 🅲 광장 격리 — 글의 plaza_id 기준 plaza_profiles 우선
  // author + like 체크는 서로 독립 — 동시 fetch
  const favPromise = userId
    ? supabase
        .from("secondhand_likes")
        .select("user_id")
        .eq("user_id", userId)
        .eq("post_id", id)
        .maybeSingle()
    : Promise.resolve({ data: null } as any)
  const [author, { data: fav }] = await Promise.all([
    getAuthorByPlaza(
      supabase,
      (post as any).user_id,
      (post as any).plaza_id ?? plaza,
    ),
    favPromise,
  ])
  const liked = !!fav
  incrementViewCount(supabase, "secondhand_posts", id)
  return {
    post: post as SecondhandPost,
    author: (author as SecondhandAuthor | null) ?? null,
    // (author shape compatible: { id, nickname, avatar_url, ... })
    is_liked: liked,
  }
}

export async function toggleSecondhandLike(
  supabase: SupabaseClient,
  args: { postId: string; userId: string; isLiked: boolean; currentLikes: number },
): Promise<{ liked: boolean; likes: number }> {
  if (args.isLiked) {
    await Promise.all([
      supabase
        .from("secondhand_likes")
        .delete()
        .eq("user_id", args.userId)
        .eq("post_id", args.postId),
      // atomic counter (race-free) — web 와 동일
      supabase.rpc("change_like_count", {
        p_table: "secondhand_posts",
        p_id: args.postId,
        p_column: "likes",
        p_delta: -1,
      }),
    ])
    return { liked: false, likes: Math.max(0, args.currentLikes - 1) }
  }
  const { error } = await supabase
    .from("secondhand_likes")
    .insert({ user_id: args.userId, post_id: args.postId })
  if (error && (error as any).code !== "23505") throw error
  await supabase.rpc("change_like_count", {
    p_table: "secondhand_posts",
    p_id: args.postId,
    p_column: "likes",
    p_delta: 1,
  })
  return { liked: true, likes: args.currentLikes + 1 }
}

export async function setSecondhandStatus(
  supabase: SupabaseClient,
  postId: string,
  status: SecondhandStatus,
): Promise<void> {
  const { error } = await supabase
    .from("secondhand_posts")
    .update({ status })
    .eq("id", postId)
  if (error) throw error
}

export async function deleteSecondhandPost(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from("secondhand_posts")
    .delete()
    .eq("id", postId)
  if (error) throw error
}

/** 가격 포맷터 — 광장 web @/components/secondhand-card 의 formatPrice 와 동일 */
export function formatSecondhandPrice(price: number): string {
  if (!price || price <= 0) return "무료나눔"
  // web 1:1: ₩520,000 형식 (KRW 통화 기호)
  return `₩${price.toLocaleString("ko-KR")}`
}

/**
 * 새 중고거래 글 작성 — 광장 web POST /api/secondhand 와 동일 엔드포인트.
 * 0원 + postAsSharing 인 경우 호출자가 sharing.createSharingPost 로 라우팅.
 */
export interface SecondhandCreateInput {
  title: string
  description: string
  category: string
  price: number
  isPriceNegotiable: boolean
  images?: string[] | null
  location?: string | null
  condition?: string | null
  /** 거래방식 — 미지정 시 서버가 'sale' 처리 (기존 동작 보존) */
  listingType?: "sale" | "auction" | "rental"
  /** 경매 부가 정보 (listingType='auction' 일 때) */
  auctionStartPrice?: number
  auctionDays?: number
  auctionBidIncrement?: number
  /** 대여 부가 정보 (listingType='rental' 일 때) */
  rentalDailyPrice?: number
  rentalDeposit?: number
}

interface SHFetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

/** 중고거래 글 수정 — 광장 web PATCH /api/secondhand/[id] 와 동일. */
export async function updateSecondhandPost(
  fetcher: SHFetchAdapter,
  id: string,
  input: SecondhandCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/secondhand/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        category: input.category,
        price: input.price,
        isPriceNegotiable: input.isPriceNegotiable,
        images: input.images && input.images.length > 0 ? input.images : null,
        location: input.location || null,
        condition: input.condition?.trim() ? input.condition.trim() : null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

export async function createSecondhandPost(
  fetcher: SHFetchAdapter,
  input: SecondhandCreateInput,
): Promise<{
  ok: boolean
  postId?: string
  /** 경매/대여 매물 id — 서버가 post 와 같은 요청에 원자적으로 생성 */
  listingId?: string
  flagged?: boolean
  rateLimited?: boolean
  error?: string
}> {
  try {
    // listingType 이 auction/rental 이면 부가 정보를 함께 전송 — 서버가 같은
    // 트랜잭션으로 매물을 생성하고 listingId 를 반환한다 (원자성).
    const extra: Record<string, unknown> = {}
    if (input.listingType && input.listingType !== "sale") {
      extra.listing_type = input.listingType
      if (input.listingType === "auction") {
        extra.auction_start_price = input.auctionStartPrice ?? input.price
        if (typeof input.auctionDays === "number") extra.auction_days = input.auctionDays
        if (typeof input.auctionBidIncrement === "number")
          extra.auction_bid_increment = input.auctionBidIncrement
      } else if (input.listingType === "rental") {
        extra.rental_daily_price = input.rentalDailyPrice ?? input.price
        extra.rental_deposit = input.rentalDeposit ?? 0
      }
    }
    const r = await fetcher("/api/secondhand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        category: input.category,
        price: input.price,
        isPriceNegotiable: input.isPriceNegotiable,
        images: input.images && input.images.length > 0 ? input.images : null,
        location: input.location || null,
        condition: input.condition?.trim() ? input.condition.trim() : null,
        ...extra,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (r.status === 429) {
      return {
        ok: false,
        rateLimited: true,
        error: data?.error || "하루 3건 한도를 초과했습니다",
      }
    }
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true, postId: data?.post?.id, listingId: data?.listingId, flagged: !!data?.flagged }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

/** 광장 web 의 SECONDHAND_CATEGORIES 와 동일 */
// 중앙 카테고리에서 re-export — packages/features/src/categories.ts
export { SECONDHAND_CATEGORIES } from "../categories"
