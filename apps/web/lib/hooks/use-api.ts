import useSWR, { type SWRConfiguration } from "swr"

/**
 * 공통 API fetch 훅 — useEffect+fetch 패턴을 SWR 로 대체.
 *
 * 장점:
 *  - 같은 키 중복 요청 자동 제거 (deduping)
 *  - stale-while-revalidate: 캐시된 데이터 즉시 표시 → 백그라운드 갱신
 *  - 탭 전환 시 자동 revalidate
 *  - 에러 자동 재시도
 *
 * @example
 *   const { data, isLoading, error } = useApi<NewsItem[]>("/api/news?region=chuncheon")
 *   const { data, isLoading } = useApi<Weather>(selectedRegion ? `/api/weather?region=${selectedRegion}` : null)
 */
export function useApi<T = unknown>(
  key: string | null,
  config?: SWRConfiguration<T>,
) {
  return useSWR<T>(key, config)
}

/**
 * POST/mutation 용 — SWR mutate 와 함께 사용.
 * 향후 확장 포인트: optimistic updates, rollback 등.
 */
export { mutate } from "swr"
