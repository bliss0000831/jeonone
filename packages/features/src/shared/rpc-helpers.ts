import type { SupabaseClient } from "@supabase/supabase-js"

/** 허용된 view count 테이블 목록 — RPC p_table 인자에 오타 방지 */
export type ViewCountTable =
  | "board_posts"
  | "sharing_posts"
  | "secondhand_posts"
  | "group_buying_posts"
  | "local_food"
  | "jobs_posts"
  | "interior_posts"
  | "moving_posts"
  | "cleaning_posts"
  | "repair_posts"
  | "new_store_posts"
  | "services_posts"
  | "clubs"
  | "properties"

/**
 * 조회수 증가 (fire-and-forget).
 * 실패해도 무시 — 사용자 경험에 영향 없음.
 */
export function incrementViewCount(
  supabase: SupabaseClient,
  table: ViewCountTable,
  id: string,
  column: string = "views",
): void {
  void supabase.rpc("increment_view_count", {
    p_table: table,
    p_id: id,
    p_column: column,
  })
}
