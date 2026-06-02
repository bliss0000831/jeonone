/**
 * New-Store (신장개업) 도메인 — Supabase 호출. RN + 웹 공유.
 *
 * 광장 web /new-store/[id] 와 동일 패턴:
 *   - new_store_posts + profiles 별도 join
 *   - 조회수 RPC: increment_view_count(p_table='new_store_posts', p_column='views')
 *   - 좋아요는 new_store_favorites + likes 컬럼 동기화
 *   - 단, store_name 이 제목, opening_event / opening_date 가 도메인 특화 필드
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthorByPlaza } from "../profile/api"
import { incrementViewCount } from "../shared/rpc-helpers"

export interface NewStorePost {
  id: string
  user_id: string
  store_name: string
  description: string | null
  category: string | null
  images: string[] | null
  address: string | null
  phone: string | null
  opening_date: string | null
  opening_event: string | null
  views: number
  likes: number
  created_at: string
  lat: number | null
  lng: number | null
}

export interface NewStoreAuthor {
  id: string
  nickname: string | null
  avatar_url: string | null
}

/** 단건 + 작성자 + 좋아요 여부 + 조회수 RPC */
export async function getNewStorePost(
  supabase: SupabaseClient,
  id: string,
  plaza: string | null,
  userId: string | null,
): Promise<{
  post: NewStorePost | null
  author: NewStoreAuthor | null
  is_liked: boolean
}> {
  let q = supabase.from("new_store_posts").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post } = await q.maybeSingle()
  if (!post) return { post: null, author: null, is_liked: false }
  // 🅲 광장 격리 — 작성자와 좋아요 여부를 병렬로 조회
  // 카드(FavoriteButton)와 동일 테이블(new_store_likes)로 일원화 — 상태 불일치 방지
  const favPromise = userId
    ? (() => {
        let fq: any = supabase
          .from("new_store_likes")
          .select("user_id")
          .eq("user_id", userId)
          .eq("post_id", id)
        if (plaza) fq = fq.eq("plaza_id", plaza)
        return fq.maybeSingle()
      })()
    : Promise.resolve({ data: null } as any)
  const [author, { data: fav }] = await Promise.all([
    getAuthorByPlaza(
      supabase,
      (post as any).user_id,
      (post as any).plaza_id ?? plaza,
    ),
    favPromise,
  ])
  incrementViewCount(supabase, "new_store_posts", id)
  return {
    post: post as NewStorePost,
    author: (author as NewStoreAuthor | null) ?? null,
    is_liked: !!fav,
  }
}

/** 좋아요 토글 — likes 컬럼 동기화 */
export async function toggleNewStoreLike(
  supabase: SupabaseClient,
  args: { postId: string; userId: string; isLiked: boolean; currentLikes: number; plazaId?: string | null },
): Promise<{ liked: boolean; likes: number }> {
  if (args.isLiked) {
    let delQ: any = supabase
      .from("new_store_likes")
      .delete()
      .eq("user_id", args.userId)
      .eq("post_id", args.postId)
    if (args.plazaId) delQ = delQ.eq("plaza_id", args.plazaId)
    await delQ
    await supabase.rpc("change_like_count", {
      p_table: "new_store_posts",
      p_id: args.postId,
      p_column: "likes",
      p_delta: -1,
    })
    return { liked: false, likes: Math.max(0, args.currentLikes - 1) }
  }
  const insertRow: Record<string, any> = { user_id: args.userId, post_id: args.postId }
  if (args.plazaId) insertRow.plaza_id = args.plazaId
  const { error } = await supabase
    .from("new_store_likes")
    .insert(insertRow)
  if (error && (error as any).code !== "23505") throw error
  if (!error) {
    // 실제 insert 된 경우에만 카운트 +1 (중복 23505 면 변동 없음)
    await supabase.rpc("change_like_count", {
      p_table: "new_store_posts",
      p_id: args.postId,
      p_column: "likes",
      p_delta: 1,
    })
    return { liked: true, likes: args.currentLikes + 1 }
  }
  return { liked: true, likes: args.currentLikes }
}

export async function deleteNewStorePost(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("new_store_posts").delete().eq("id", id)
  if (error) throw error
}

/**
 * 새 신장개업 글 작성 — 광장 web POST /api/new-store 와 동일.
 * 사장님 계정(account_type='business')만 가능. 서버에서 검증.
 */
export interface NewStoreCreateInput {
  store_name: string
  description: string
  category: string
  address: string
  phone?: string | null
  opening_date?: string | null
  opening_event?: string | null
  images?: string[] | null
}

interface NSFetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

export async function createNewStorePost(
  fetcher: NSFetchAdapter,
  input: NewStoreCreateInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const r = await fetcher("/api/new-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_name: input.store_name,
        description: input.description,
        category: input.category,
        address: input.address,
        phone: input.phone || null,
        opening_date: input.opening_date || null,
        opening_event: input.opening_event || null,
        images: input.images && input.images.length > 0 ? input.images : null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true, postId: data?.post?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

/** 신장개업 글 수정 — 광장 web PATCH /api/new-store/[id]. */
export async function updateNewStorePost(
  fetcher: NSFetchAdapter,
  id: string,
  input: NewStoreCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/new-store/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_name: input.store_name,
        description: input.description,
        category: input.category,
        address: input.address,
        phone: input.phone || null,
        opening_date: input.opening_date || null,
        opening_event: input.opening_event || null,
        images: input.images && input.images.length > 0 ? input.images : null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

// 중앙 카테고리에서 re-export — packages/features/src/categories.ts
export { NEW_STORE_CATEGORIES } from "../categories"
