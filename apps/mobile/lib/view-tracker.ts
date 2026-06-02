/**
 * 조회수 증가 helper — web 의 increment_view_count RPC 호출.
 *
 * web detail 페이지(`/board/[id]`, `/sharing/[id]` 등)가 마운트 시
 * `supabase.rpc('increment_view_count', { p_table, p_id, p_column })` 를
 * 호출. 모바일도 동일하게 호출해야 양쪽 카운트가 누락 없이 일치.
 *
 * 사용:
 *   useTrackView('board_posts', id, 'view_count')
 */
import { useEffect, useRef } from "react"
import { getSupabase } from "@/lib/supabase"

export async function incrementViewCount(
  table: string,
  id: string | null | undefined,
  column: string = "views",
): Promise<void> {
  if (!id) return
  try {
    await getSupabase().rpc("increment_view_count", {
      p_table: table,
      p_id: id,
      p_column: column,
    })
  } catch {
    // 조회수 증가 실패는 silent — 사용자 흐름 방해 X
  }
}

/**
 * 컴포넌트 마운트 시 1회만 조회수 증가.
 * id 가 바뀌면(같은 컴포넌트에서 다른 글) 다시 1회 호출.
 */
export function useTrackView(
  table: string,
  id: string | null | undefined,
  column: string = "views",
) {
  const trackedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!id || trackedRef.current === id) return
    trackedRef.current = id
    void incrementViewCount(table, id, column)
  }, [table, id, column])
}
