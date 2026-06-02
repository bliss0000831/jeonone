/**
 * Sharing (나눔) 도메인 — Supabase 호출. RN + 웹 공유.
 *
 * 광장 web /sharing/[id] 와 동일 패턴:
 *   - sharing_posts + profiles inline join
 *   - 조회수 RPC: increment_view_count(p_table='sharing_posts', p_column='views')
 *   - 좋아요는 sharing_likes + likes 컬럼 동기화
 *   - 상태: available / reserved / completed
 */

/**
 * Error handling: direct Supabase helpers (completeSharing, deleteSharingPost, toggleSharingLike) throw on errors;
 * HTTP-fetcher wrappers (createSharingPost, updateSharingPost) return { ok, error } results (never throw).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { incrementViewCount } from "../shared/rpc-helpers"
import { getAuthorByPlaza } from "../profile/api"

export type SharingStatus = "available" | "reserved" | "completed"

export interface SharingPost {
  id: string
  user_id: string
  title: string
  description: string | null
  images: string[] | null
  status: SharingStatus | string
  location: string | null
  views: number
  likes: number
  created_at: string
  lat: number | null
  lng: number | null
}

export interface SharingAuthor {
  id: string
  nickname: string | null
  avatar_url: string | null
}

/** 단건 + 작성자 + 좋아요 여부 + 조회수 RPC */
export async function getSharingPost(
  supabase: SupabaseClient,
  id: string,
  plaza: string | null,
  userId: string | null,
): Promise<{
  post: SharingPost | null
  author: SharingAuthor | null
  is_liked: boolean
}> {
  let q = supabase
    .from("sharing_posts")
    .select("*")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const favPromise = userId
    ? supabase
        .from("sharing_likes")
        .select("id")
        .eq("user_id", userId)
        .eq("post_id", id)
        .maybeSingle()
    : Promise.resolve({ data: null } as any)
  const [{ data: row }, { data: fav }] = await Promise.all([
    q.maybeSingle(),
    favPromise,
  ])
  if (!row) return { post: null, author: null, is_liked: false }
  // 🅲 광장 격리 — 글의 plaza_id 기준 plaza_profiles 우선
  const authorRow = await getAuthorByPlaza(
    supabase,
    (row as any).user_id,
    (row as any).plaza_id ?? plaza,
  )
  const author = authorRow
    ? {
        id: (authorRow as any).id,
        nickname: (authorRow as any).nickname ?? null,
        avatar_url: (authorRow as any).avatar_url ?? null,
      }
    : null
  incrementViewCount(supabase, "sharing_posts", id)
  const post: SharingPost = {
    id: (row as any).id,
    user_id: (row as any).user_id,
    title: (row as any).title,
    description: (row as any).description ?? null,
    images: (row as any).images ?? null,
    status: (row as any).status ?? "available",
    location: (row as any).location ?? null,
    views: (row as any).views ?? 0,
    likes: (row as any).likes ?? 0,
    created_at: (row as any).created_at,
    lat: (row as any).lat ?? null,
    lng: (row as any).lng ?? null,
  }
  return { post, author, is_liked: !!fav }
}

/** 좋아요 토글 — likes 컬럼 동기화 */
export async function toggleSharingLike(
  supabase: SupabaseClient,
  args: { postId: string; userId: string; isLiked: boolean; currentLikes: number },
): Promise<{ liked: boolean; likes: number }> {
  if (args.isLiked) {
    await Promise.all([
      supabase
        .from("sharing_likes")
        .delete()
        .eq("user_id", args.userId)
        .eq("post_id", args.postId),
      supabase.rpc("change_like_count", {
        p_table: "sharing_posts",
        p_id: args.postId,
        p_column: "likes",
        p_delta: -1,
      }),
    ])
    return { liked: false, likes: Math.max(0, args.currentLikes - 1) }
  }
  const { error } = await supabase
    .from("sharing_likes")
    .insert({ user_id: args.userId, post_id: args.postId })
  if (error && (error as any).code !== "23505") throw error
  if (!error) {
    await supabase.rpc("change_like_count", {
      p_table: "sharing_posts",
      p_id: args.postId,
      p_column: "likes",
      p_delta: 1,
    })
  }
  return { liked: true, likes: args.currentLikes + 1 }
}

/** 호스트: 나눔완료 상태 전환 */
export async function completeSharing(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from("sharing_posts")
    .update({ status: "completed" })
    .eq("id", postId)
  if (error) throw error
}

export async function deleteSharingPost(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from("sharing_posts")
    .delete()
    .eq("id", postId)
  if (error) throw error
}

/**
 * 새 나눔 글 작성 — 광장 web POST /api/sharing 와 동일 엔드포인트.
 * fetcher 로 호출 → plaza_id 자동 주입 + awardPoints 등 서버 로직 그대로 적용.
 */
export interface SharingCreateInput {
  title: string
  description: string
  category?: string
  images?: string[] | null
  location?: string | null
}

interface FetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

export async function createSharingPost(
  fetcher: FetchAdapter,
  input: SharingCreateInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const r = await fetcher("/api/sharing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        category: input.category || "기타",
        images: input.images && input.images.length > 0 ? input.images : null,
        location: input.location || null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true, postId: data?.post?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

/** 나눔 글 수정 — 광장 web PATCH /api/sharing/[id] 와 동일. */
export async function updateSharingPost(
  fetcher: FetchAdapter,
  id: string,
  input: SharingCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/sharing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        category: input.category || "기타",
        images: input.images && input.images.length > 0 ? input.images : null,
        location: input.location || null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}
