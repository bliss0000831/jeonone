/**
 * R2 고아 파일 청소 헬퍼
 *   - DB row 삭제 후 R2 객체를 비동기로 함께 삭제
 *   - 실패는 삼킨다 (로그만): 파일 정리 실패로 API 응답을 망치지 않음
 *   - Supabase Storage 시절 URL(= R2 가 아닌 URL) 은 자동으로 건너뜀
 */
import { deleteFromR2, urlToR2Key } from './r2'

type UrlLike = string | null | undefined

/**
 * 여러 URL(또는 URL 배열) 을 받아 R2 에 속한 것만 골라 병렬 삭제.
 * void 로 호출하면 fire-and-forget.
 */
export async function deleteR2Urls(
  ...inputs: Array<UrlLike | UrlLike[]>
): Promise<void> {
  const flat: string[] = []
  for (const x of inputs) {
    if (!x) continue
    if (Array.isArray(x)) {
      for (const u of x) if (u) flat.push(u)
    } else {
      flat.push(x)
    }
  }
  const keys = flat
    .map((u) => urlToR2Key(u))
    .filter((k): k is string => !!k)

  if (keys.length === 0) return

  const results = await Promise.allSettled(keys.map((k) => deleteFromR2(k)))
  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length > 0) {
    console.warn(`[r2-cleanup] ${failed.length}/${keys.length} 삭제 실패`, failed)
  }
}
