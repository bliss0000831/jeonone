/**
 * Services (서비스 — moving / cleaning / repair) 도메인.
 * 광장 web 의 moving/cleaning/repair 상세 페이지가 동일 구조를 갖고
 * 테이블 이름만 다르므로 한 모듈로 묶어 RN + 웹 양쪽이 공유한다.
 *
 *  - <kind>_posts: 본문 + meta + likes + views
 *  - <kind>_favorites: 사용자 좋아요
 *  - 조회수 RPC: increment_view_count(p_table='<kind>_posts', p_column='views')
 */

/**
 * Error handling: direct Supabase helpers (deleteServicePost, toggleServiceLike) throw on errors;
 * write wrappers (createServicePost, updateServicePost) return { ok, error } results (never throw).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthorByPlaza } from "../profile/api"
import { incrementViewCount, type ViewCountTable } from "../shared/rpc-helpers"

export type ServiceKind = "interior" | "moving" | "cleaning" | "repair"

export interface ServicePost {
  id: string
  user_id: string
  title: string
  content: string | null
  category: string | null
  images: string[] | null
  service_region: string | null
  service_district: string | null
  service_dong: string | null
  min_price: number | null
  max_price: number | null
  price_unit: string | null
  contact_phone: string | null
  career_years: number | null // 경력(년) — 카드에 "경력 N년" 표시용
  views: number
  likes: number
  status: string | null
  created_at: string
  lat: number | null
  lng: number | null
}

export interface ServiceAuthor {
  id: string
  nickname: string | null
  avatar_url: string | null
}

function tableFor(kind: ServiceKind): string {
  return `${kind}_posts`
}

function favTableFor(kind: ServiceKind): string {
  return `${kind}_favorites`
}

/** 단건 + 작성자 + 좋아요 여부 + 조회수 RPC */
export async function getServicePost(
  supabase: SupabaseClient,
  kind: ServiceKind,
  id: string,
  plaza: string | null,
  userId: string | null,
): Promise<{
  post: ServicePost | null
  author: ServiceAuthor | null
  is_liked: boolean
}> {
  let q = supabase.from(tableFor(kind)).select("*").eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: post } = await q.maybeSingle()
  if (!post) return { post: null, author: null, is_liked: false }
  // 🅲 광장 격리 — 글의 plaza_id 기준 plaza_profiles 우선
  const [author, liked] = await Promise.all([
    getAuthorByPlaza(
      supabase,
      (post as any).user_id,
      (post as any).plaza_id ?? plaza,
    ),
    userId
      ? supabase
          .from(favTableFor(kind))
          .select("id")
          .eq("user_id", userId)
          .eq("post_id", id)
          .maybeSingle()
          .then((r) => !!r.data)
      : false,
  ])
  incrementViewCount(supabase, tableFor(kind) as ViewCountTable, id)
  return {
    post: post as ServicePost,
    author: (author as ServiceAuthor | null) ?? null,
    is_liked: liked,
  }
}

/** 좋아요 토글 — likes 컬럼 동기화 */
export async function toggleServiceLike(
  supabase: SupabaseClient,
  args: {
    kind: ServiceKind
    postId: string
    userId: string
    isLiked: boolean
    currentLikes: number
  },
): Promise<{ liked: boolean; likes: number }> {
  if (args.isLiked) {
    await Promise.all([
      supabase
        .from(favTableFor(args.kind))
        .delete()
        .eq("user_id", args.userId)
        .eq("post_id", args.postId),
      supabase.rpc("change_like_count", {
        p_table: tableFor(args.kind),
        p_id: args.postId,
        p_column: "likes",
        p_delta: -1,
      }),
    ])
    return { liked: false, likes: Math.max(0, args.currentLikes - 1) }
  }
  const { error } = await supabase
    .from(favTableFor(args.kind))
    .insert({ user_id: args.userId, post_id: args.postId })
  if (error && (error as any).code !== "23505") throw error
  if (!error) {
    await supabase.rpc("change_like_count", {
      p_table: tableFor(args.kind),
      p_id: args.postId,
      p_column: "likes",
      p_delta: 1,
    })
  }
  return { liked: true, likes: args.currentLikes + 1 }
}

export async function deleteServicePost(
  supabase: SupabaseClient,
  kind: ServiceKind,
  postId: string,
): Promise<void> {
  const { error } = await supabase.from(tableFor(kind)).delete().eq("id", postId)
  if (error) throw error
}

/** UX 라벨/색상 — RN/웹 공통 */
export const SERVICE_META: Record<
  ServiceKind,
  { label: string; ko: string; defaultBadge: string; bg: string }
> = {
  interior: { label: "인테리어", ko: "인테리어", defaultBadge: "인테리어", bg: "#3b82f6" },
  moving:   { label: "이사",   ko: "이사",   defaultBadge: "이사",   bg: "#eab308" },
  cleaning: { label: "청소",   ko: "청소",   defaultBadge: "청소",   bg: "#22c55e" },
  repair:   { label: "수리",   ko: "수리",   defaultBadge: "수리",   bg: "#a855f7" },
}

/**
 * 새 서비스 글 작성 — 광장 web /<kind>/register 와 동일 supabase 직접 insert.
 * <kind>_posts 테이블 (moving_posts / cleaning_posts / repair_posts).
 */
export interface ServiceCreateInput {
  plaza: string
  userId: string
  title: string
  content: string
  category: string
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

export async function createServicePost(
  supabase: SupabaseClient,
  kind: ServiceKind,
  input: ServiceCreateInput,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from(tableFor(kind))
      .insert({
        plaza_id: input.plaza,
        user_id: input.userId,
        title: input.title.trim(),
        content: input.content.trim(),
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

/** 서비스 글 수정 — 광장 web /<kind>/[id]/edit 와 동일 supabase direct update. */
export async function updateServicePost(
  supabase: SupabaseClient,
  kind: ServiceKind,
  id: string,
  input: ServiceCreateInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from(tableFor(kind))
      .update({
        title: input.title.trim(),
        content: input.content.trim(),
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

/** kind 별 카테고리 — 중앙 카테고리에서 re-export */
export { SERVICE_CATEGORIES } from "../categories"

/** 공유 가격 포맷터 */
export function formatServicePrice(p: ServicePost): string {
  if (!p.min_price && !p.max_price) return "가격 문의"
  const unit = p.price_unit || "만원"
  if (p.min_price && p.max_price) {
    return `${p.min_price.toLocaleString()}~${p.max_price.toLocaleString()}${unit}`
  }
  if (p.min_price) return `${p.min_price.toLocaleString()}${unit}~`
  return `~${p.max_price?.toLocaleString()}${unit}`
}
