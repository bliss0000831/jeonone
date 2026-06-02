/**
 * 앱 전역 상수 — 광장 라벨 등.
 */

/** plaza id -> 한글 라벨 (cross-plaza 칩 표시용) */
export const PLAZA_LABEL: Record<string, string> = {
  chuncheon: "춘천광장",
  gangneung: "강릉광장",
}

/**
 * plazas 테이블에서 id→name 을 한 번 가져와 PLAZA_LABEL 에 병합.
 * 앱 시작 시 1회 호출 — 이후 plazaName() 이 모든 광장을 한글로 표시.
 */
let _labelsLoaded = false
export async function loadPlazaLabels(): Promise<void> {
  if (_labelsLoaded) return
  try {
    const { getSupabase } = await import("@/lib/supabase")
    const { data } = await getSupabase()
      .from("plazas")
      .select("id, name")
    if (data) {
      for (const p of data) {
        if (p.id && p.name) PLAZA_LABEL[p.id] = p.name
      }
    }
    _labelsLoaded = true
  } catch {
    // 네트워크 실패 — 하드코딩된 fallback 유지
  }
}

/** plaza id 를 한글 라벨로 변환 (미등록이면 id 그대로 반환) */
export function plazaName(id: string | null | undefined): string {
  if (!id) return ""
  return PLAZA_LABEL[id] ?? id
}
