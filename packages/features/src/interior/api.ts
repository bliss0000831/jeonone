/**
 * Interior (인테리어) 도메인 — Supabase 호출. RN + 웹 공유.
 *
 * 광장 web /interior/[id] 와 동일 패턴:
 *   - profiles 별도 조회 (FK 조인 실패 fallback)
 *   - 조회수 RPC: increment_view_count(p_table='interior_posts', p_column='views')
 *   - 좋아요는 interior_favorites + likes 컬럼 동기화
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { incrementViewCount } from "../shared/rpc-helpers"
import { getAuthorByPlaza } from "../profile/api"

export interface InteriorPost {
  id: string
  user_id: string
  title: string
  content: string | null
  category: string | null
  images: string[] | null
  min_price: number | null
  max_price: number | null
  price_unit: string | null
  contact_phone: string | null
  service_region: string | null
  service_district: string | null
  service_dong: string | null
  career_years: number | null // 시공 경력(년)
  views: number
  likes: number
  created_at: string
  status?: string | null
  lat: number | null
  lng: number | null
}

export interface InteriorAuthor {
  id: string
  nickname: string | null
  avatar_url: string | null
  account_type: string | null
}

/** 단건 + 작성자 + 좋아요 여부 + 조회수 RPC */
export async function getInteriorPost(
  supabase: SupabaseClient,
  id: string,
  plaza: string | null,
  userId: string | null,
): Promise<{
  post: InteriorPost | null
  author: InteriorAuthor | null
  is_liked: boolean
}> {
  let q = supabase.from("interior_posts").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post } = await q.maybeSingle()
  if (!post) return { post: null, author: null, is_liked: false }
  // 🅲 광장 격리 — 작성자와 좋아요 여부를 병렬로 조회
  const favPromise = userId
    ? supabase
        .from("interior_favorites")
        .select("id")
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
  incrementViewCount(supabase, "interior_posts", id)
  return {
    post: post as InteriorPost,
    author: (author as InteriorAuthor | null) ?? null,
    is_liked: !!fav,
  }
}

/** 좋아요 토글 — likes 컬럼 동기화 */
export async function toggleInteriorLike(
  supabase: SupabaseClient,
  args: { postId: string; userId: string; isLiked: boolean; currentLikes: number },
): Promise<{ liked: boolean; likes: number }> {
  if (args.isLiked) {
    await supabase
      .from("interior_favorites")
      .delete()
      .eq("user_id", args.userId)
      .eq("post_id", args.postId)
    await supabase.rpc("change_like_count", {
      p_table: "interior_posts",
      p_id: args.postId,
      p_column: "likes",
      p_delta: -1,
    })
    return { liked: false, likes: Math.max(0, args.currentLikes - 1) }
  }
  const { error } = await supabase
    .from("interior_favorites")
    .insert({ user_id: args.userId, post_id: args.postId })
  if (error && (error as any).code !== "23505") throw error
  await supabase.rpc("change_like_count", {
    p_table: "interior_posts",
    p_id: args.postId,
    p_column: "likes",
    p_delta: 1,
  })
  return { liked: true, likes: args.currentLikes + 1 }
}

export async function deleteInteriorPost(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("interior_posts").delete().eq("id", id)
  if (error) throw error
}

/**
 * 새 인테리어 글 작성 — 광장 web /interior/register 와 동일하게 supabase 직접 insert.
 * 인테리어 전문가(account_type='interior') 또는 admin 만 가능 — RLS 가 차단.
 *
 * 공간(space)은 별도 컬럼이 없어 본문에 "[공간] X" 태그로 붙여 검색 필터에 걸리게 한다.
 */
export interface InteriorCreateInput {
  plaza: string
  userId: string
  title: string
  content: string
  category: string
  space?: string | null
  service_region?: string | null
  service_district?: string | null
  service_dong?: string | null
  contact_phone?: string | null
  min_price?: number | null
  max_price?: number | null
  price_unit?: string
  career_years?: number | null
  images?: string[]
}

export async function createInteriorPost(
  supabase: SupabaseClient,
  input: InteriorCreateInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const contentWithSpace = input.space
      ? `${input.content.trim()}\n\n[공간] ${input.space}`
      : input.content.trim()
    const { data, error } = await supabase
      .from("interior_posts")
      .insert({
        plaza_id: input.plaza,
        user_id: input.userId,
        title: input.title.trim(),
        content: contentWithSpace,
        category: input.category,
        service_region: input.service_region ?? null,
        service_district: input.service_district ?? null,
        service_dong: input.service_dong ?? null,
        contact_phone: input.contact_phone ?? null,
        min_price: input.min_price ?? null,
        max_price: input.max_price ?? null,
        price_unit: input.price_unit ?? "만원",
        career_years: input.career_years ?? null,
        images: input.images ?? [],
      })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, postId: (data as any)?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

/** 인테리어 글 수정 — 광장 web /interior/[id]/edit 와 동일 supabase direct update. */
export async function updateInteriorPost(
  supabase: SupabaseClient,
  id: string,
  input: InteriorCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const contentWithSpace = input.space
      ? `${input.content.trim()}\n\n[공간] ${input.space}`
      : input.content.trim()
    const { error } = await supabase
      .from("interior_posts")
      .update({
        title: input.title.trim(),
        content: contentWithSpace,
        category: input.category,
        service_region: input.service_region ?? null,
        service_district: input.service_district ?? null,
        service_dong: input.service_dong ?? null,
        contact_phone: input.contact_phone ?? null,
        min_price: input.min_price ?? null,
        max_price: input.max_price ?? null,
        price_unit: input.price_unit ?? "만원",
        career_years: input.career_years ?? null,
        images: input.images ?? [],
      })
      .eq("id", id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

// 중앙 카테고리에서 re-export — packages/features/src/categories.ts
export { INTERIOR_CATEGORIES, INTERIOR_SPACES } from "../categories"
