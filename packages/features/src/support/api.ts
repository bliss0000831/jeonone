/**
 * 지원 도메인 API — FAQ / 공지 / 고객센터 등 정적-ish 콘텐츠.
 * 웹과 RN 양쪽이 같은 함수 호출.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface Faq {
  id: string
  category: string
  question: string
  answer: string
  sort_order: number
}

export async function listFaqs(
  supabase: SupabaseClient,
  plazaId?: string,
): Promise<Faq[]> {
  let q = supabase
    .from("faqs")
    .select("id, category, question, answer, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (plazaId) q = q.eq("plaza_id", plazaId)
  const { data, error } = await q
  if (error) return []
  return (data ?? []) as Faq[]
}

export interface NoticePost {
  id: string
  title: string
  content: string
  category: string | null
  created_at: string
  is_pinned: boolean
}

export async function listNotices(
  supabase: SupabaseClient,
  plazaId?: string,
): Promise<NoticePost[]> {
  // notices 테이블에서 직접 조회 (admin /admin/board/notice 에서 작성하는 데이터)
  let q = supabase
    .from("notices")
    .select("id, title, content, created_at, is_pinned")
    .eq("is_published", true)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50)
  if (plazaId) q = q.eq("plaza_id", plazaId)
  const { data, error } = await q
  if (error) return []
  return ((data ?? []) as any[]).map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: null,
    created_at: n.created_at,
    is_pinned: !!n.is_pinned,
  }))
}
