/**
 * 게시판 도메인 API — 광장 web /api/board 와 동일 결과를 RN 도 사용.
 */

/**
 * Error handling: direct Supabase helpers (getBoardPost, deleteBoardPost, etc.) throw on errors;
 * write wrappers (createBoardPost, updateBoardPost) return { ok, error } results (never throw).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { incrementViewCount } from "../shared/rpc-helpers"

export interface BoardPost {
  id: string
  category_id: string | null
  title: string
  content: string
  author_name: string
  author_avatar: string | null
  view_count: number
  like_count: number
  comment_count: number
  created_at: string
  updated_at: string
  is_pinned: boolean
  user_id: string
  images: string[] | null
  thumbnail_url: string | null
}

export interface BoardComment {
  id: string
  post_id: string
  user_id: string
  author_name: string
  author_avatar: string | null
  content: string
  images: string[] | null
  created_at: string
}

/** 게시글 단건 + 조회수 증가 (fire-and-forget) */
export async function getBoardPost(
  supabase: SupabaseClient,
  id: string,
  plaza: string | null,
): Promise<BoardPost | null> {
  let q = supabase
    .from("board_posts")
    .select("id, category_id, title, content, author_name, author_avatar, view_count, like_count, comment_count, created_at, updated_at, is_pinned, user_id, images, thumbnail_url")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data } = await q.maybeSingle()
  if (!data) return null
  incrementViewCount(supabase, "board_posts", id, "view_count")
  return data as BoardPost
}

/** 댓글 목록 — plazaId 주어지면 작성자 표시(author_name/avatar) 를 그 광장 plaza_profile 로 hydrate */
export async function listBoardComments(
  supabase: SupabaseClient,
  postId: string,
  plazaId?: string | null,
): Promise<BoardComment[]> {
  const { data } = await supabase
    .from("board_comments")
    .select("id, post_id, user_id, author_name, author_avatar, content, images, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
  const rows = (data ?? []) as BoardComment[]
  if (!plazaId || rows.length === 0) return rows
  // plaza_profiles overlay — 각 댓글 작성자의 광장별 닉네임/아바타로 교체
  const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)))
  if (userIds.length === 0) return rows
  const { data: pps } = await supabase
    .from("plaza_profiles")
    .select("user_id, nickname, avatar_url")
    .in("user_id", userIds)
    .eq("plaza_id", plazaId)
  const ppMap = new Map<string, { nickname: string | null; avatar_url: string | null }>(
    (pps ?? []).map((p: any) => [p.user_id, { nickname: p.nickname, avatar_url: p.avatar_url }]),
  )
  return rows.map((r: any) => {
    const pp = ppMap.get(r.user_id)
    return pp
      ? { ...r, author_name: pp.nickname ?? r.author_name, author_avatar: pp.avatar_url ?? r.author_avatar }
      : r
  })
}

/** 댓글 작성 */
export async function createBoardComment(
  supabase: SupabaseClient,
  args: {
    postId: string
    userId: string
    authorName: string
    authorAvatar?: string | null
    content: string
    images?: string[]
  },
): Promise<BoardComment> {
  const { data, error } = await supabase
    .from("board_comments")
    .insert({
      post_id: args.postId,
      user_id: args.userId,
      author_name: args.authorName,
      author_avatar: args.authorAvatar ?? null,
      content: args.content,
      images: args.images ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return data as BoardComment
}

export async function deleteBoardComment(
  supabase: SupabaseClient,
  commentId: string,
): Promise<void> {
  const { error } = await supabase.from("board_comments").delete().eq("id", commentId)
  if (error) throw error
}

/** 좋아요 토글 (멱등) */
export async function toggleBoardLike(
  supabase: SupabaseClient,
  args: { postId: string; userId: string; isLiked: boolean },
): Promise<boolean> {
  if (args.isLiked) {
    const { error } = await supabase
      .from("board_post_likes")
      .delete()
      .eq("post_id", args.postId)
      .eq("user_id", args.userId)
    if (error) throw error
    return false
  }
  const { error } = await supabase
    .from("board_post_likes")
    .insert({ post_id: args.postId, user_id: args.userId })
  if (error && (error as any).code !== "23505") throw error
  return true
}

export async function isBoardPostLiked(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("board_post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle()
  return !!data
}

export async function deleteBoardPost(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("board_posts").delete().eq("id", id)
  if (error) throw error
}

// ── 작성 (write) ───────────────────────────────────

export interface BoardCategory {
  id: string
  name: string
  slug: string
}

/** 게시판 카테고리 목록 — 광장(plaza) 별로 분리되어 있어 plaza 필터 필수.
 *  웹은 쿠키 기반 RLS 가 자동 필터하지만 모바일(Bearer)은 anon 으로 SELECT 되어
 *  모든 광장의 카테고리가 함께 반환 → 자유게시판/맛집추천 같은 이름이 중복 표시되던 회귀 해결. */
export async function listBoardCategories(
  supabase: SupabaseClient,
  plaza?: string | null,
): Promise<BoardCategory[]> {
  // TODO: replace `any` with proper Supabase query builder type
  let q: any = supabase
    .from("board_categories")
    .select("id, name, slug")
    .order("sort_order")
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data } = await q
  return (data ?? []) as BoardCategory[]
}

export interface BoardCreateInput {
  plaza: string
  userId: string
  authorName: string
  authorAvatar?: string | null
  title: string
  content: string
  categoryId: string
  images?: string[]
  region?: string | null
}

/**
 * 새 게시글 작성 — 광장 web /board/create 와 동일하게 supabase 직접 insert.
 * thumbnail_url 은 images[0] 으로 자동 설정.
 */
export async function createBoardPost(
  supabase: SupabaseClient,
  input: BoardCreateInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const images = input.images ?? []
    const { data, error } = await supabase
      .from("board_posts")
      .insert([
        {
          plaza_id: input.plaza,
          title: input.title.trim(),
          content: input.content.trim(),
          category_id: input.categoryId,
          user_id: input.userId,
          author_name: input.authorName,
          author_avatar: input.authorAvatar ?? null,
          images,
          thumbnail_url: images[0] ?? null,
          region: input.region ?? null,
        },
      ])
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, postId: (data as any)?.id }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

/** 게시글 수정 — 광장 web /board/[id]/edit 와 동일하게 supabase direct update. */
export async function updateBoardPost(
  supabase: SupabaseClient,
  args: {
    plaza: string
    postId: string
    title: string
    content: string
    categoryId: string
    images?: string[]
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const images = args.images ?? []
    // TODO: replace `any` with proper Supabase query builder type
    let q: any = supabase
      .from("board_posts")
      .update({
        title: args.title.trim(),
        content: args.content.trim(),
        category_id: args.categoryId,
        images,
        thumbnail_url: images[0] ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.postId)
    if (args.plaza) q = q.eq("plaza_id", args.plaza)
    const { error } = await q
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}
