/**
 * setPostRegion — 글 작성 직후 region_id 컬럼을 UPDATE.
 *
 * 작성 helper 들(createPropertyPost 등) 의 INSERT payload 를 건드리지 않고
 * 별도 UPDATE 로 region_id 만 세팅. 마이그레이션 전이거나 region_id 가
 * null 이어야 하는 케이스("전체 지역" 글) 도 자연스럽게 처리.
 *
 * 사용:
 *   const r = await createPropertyPost(...)
 *   if (r.ok && r.postId) {
 *     await setPostRegion("properties", r.postId, regionId)
 *   }
 */

import { getSupabase } from "@/lib/supabase"

export async function setPostRegion(
  table: string,
  postId: string,
  regionId: string | null,
): Promise<void> {
  if (!postId) return
  try {
    const { error } = await (getSupabase() as any)
      .from(table)
      .update({ region_id: regionId })
      .eq("id", postId)
    if (error) {
      console.warn(`[setPostRegion] ${table}#${postId} failed:`, error.message)
    }
  } catch (e: any) {
    console.warn(`[setPostRegion] ${table}#${postId} exception:`, e?.message)
  }
}
