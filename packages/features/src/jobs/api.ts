/**
 * Jobs (구인구직) 도메인 — Supabase 호출. RN + 웹 공유.
 *
 * 광장 web /jobs/[id] 와 동일 패턴:
 *   - jobs_posts + profiles 별도 join
 *   - 조회수 RPC: increment_view_count(p_table='jobs_posts', p_column='views')
 *   - 좋아요는 jobs_likes + change_like_count RPC 동기화
 *   - 상태 변경 PATCH /api/jobs/[id] 와 동일하게 supabase.update({status}) 로 처리
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthorByPlaza } from "../profile/api"
import { incrementViewCount } from "../shared/rpc-helpers"

export type JobsKind = "hiring" | "seeking"
export type JobsStatus = "active" | "closed" | string

export interface JobsPost {
  id: string
  user_id: string
  kind: JobsKind
  title: string
  description: string | null
  category: string | null
  work_type: string | null
  hourly_wage: number
  work_days: string | null
  work_hours: string | null
  location: string | null
  contact: string | null
  images: string[] | null
  status: JobsStatus
  views: number
  likes: number
  created_at: string
  lat: number | null
  lng: number | null
}

export interface JobsAuthor {
  id: string
  nickname: string | null
  avatar_url: string | null
}

export async function getJobsPost(
  supabase: SupabaseClient,
  id: string,
  plaza: string | null,
  userId: string | null,
): Promise<{
  post: JobsPost | null
  author: JobsAuthor | null
  is_liked: boolean
}> {
  let q = supabase.from("jobs_posts").select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post } = await q.maybeSingle()
  if (!post) return { post: null, author: null, is_liked: false }
  // 🅲 광장 격리 — 작성자와 좋아요 여부를 병렬로 조회
  const likedPromise = userId
    ? supabase
        .from("jobs_likes")
        .select("user_id")
        .eq("user_id", userId)
        .eq("post_id", id)
        .maybeSingle()
    : Promise.resolve({ data: null } as any)
  const [author, { data: lk }] = await Promise.all([
    getAuthorByPlaza(
      supabase,
      (post as any).user_id,
      (post as any).plaza_id ?? plaza,
    ),
    likedPromise,
  ])
  incrementViewCount(supabase, "jobs_posts", id)
  return {
    post: post as JobsPost,
    author: (author as JobsAuthor | null) ?? null,
    is_liked: !!lk,
  }
}

export async function toggleJobsLike(
  supabase: SupabaseClient,
  args: { postId: string; userId: string; isLiked: boolean },
): Promise<boolean> {
  if (args.isLiked) {
    await supabase
      .from("jobs_likes")
      .delete()
      .eq("user_id", args.userId)
      .eq("post_id", args.postId)
    void supabase.rpc("change_like_count", {
      p_table: "jobs_posts",
      p_id: args.postId,
      p_column: "likes",
      p_delta: -1,
    })
    return false
  }
  const { error } = await supabase
    .from("jobs_likes")
    .insert({ user_id: args.userId, post_id: args.postId })
  if (error && (error as any).code !== "23505") throw error
  void supabase.rpc("change_like_count", {
    p_table: "jobs_posts",
    p_id: args.postId,
    p_column: "likes",
    p_delta: 1,
  })
  return true
}

export async function closeJobsPost(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from("jobs_posts")
    .update({ status: "closed" })
    .eq("id", postId)
  if (error) throw error
}

/**
 * 새 구인구직 글 작성 — 광장 web POST /api/jobs 와 동일 엔드포인트.
 */
export interface JobsCreateInput {
  kind: "hiring" | "seeking"
  title: string
  description: string
  category: string
  workType: string
  hourlyWage: number
  workDays: string
  workHours: string
  location: string
  contact: string
  images?: string[] | null
}

interface JobsFetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

/** 구인구직 글 수정 — 광장 web PATCH /api/jobs/[id] 와 동일. */
export async function updateJobsPost(
  fetcher: JobsFetchAdapter,
  id: string,
  input: JobsCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetcher(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        title: input.title,
        description: input.description,
        category: input.category,
        workType: input.workType,
        hourlyWage: input.hourlyWage,
        workDays: input.workDays,
        workHours: input.workHours,
        location: input.location,
        contact: input.contact,
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

export async function createJobsPost(
  fetcher: JobsFetchAdapter,
  input: JobsCreateInput,
): Promise<{
  ok: boolean
  postId?: string
  flagged?: boolean
  rateLimited?: boolean
  error?: string
}> {
  try {
    const r = await fetcher("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        title: input.title,
        description: input.description,
        category: input.category,
        workType: input.workType,
        hourlyWage: input.hourlyWage,
        workDays: input.workDays,
        workHours: input.workHours,
        location: input.location,
        contact: input.contact,
        images: input.images && input.images.length > 0 ? input.images : null,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (r.status === 429) {
      return {
        ok: false,
        rateLimited: true,
        error: data?.error || "하루 등록 한도(3건)를 초과했습니다",
      }
    }
    if (!r.ok) return { ok: false, error: data?.error || "처리에 실패했습니다" }
    return { ok: true, postId: data?.post?.id, flagged: !!data?.flagged }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "처리에 실패했습니다" }
  }
}

// 중앙 카테고리에서 re-export — packages/features/src/categories.ts
export { JOBS_CATEGORIES, JOBS_WORK_TYPES } from "../categories"

/** 2026 최저시급 — 광장 web 와 동일 */
export const MIN_WAGE_2026 = 10030

export async function deleteJobsPost(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  const { error } = await supabase.from("jobs_posts").delete().eq("id", postId)
  if (error) throw error
}
