"use client"

import { SWRConfig } from "swr"

/**
 * 전역 SWR 설정 Provider
 *
 * - dedupingInterval: 같은 키로 2초 이내 중복 요청 자동 제거
 * - revalidateOnFocus: 탭 복귀 시 자동 갱신 (stale-while-revalidate)
 * - errorRetryCount: 실패 시 최대 3회 재시도
 * - fetcher: 기본 fetch → JSON 파서
 */
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 2000,
        revalidateOnFocus: true,
        errorRetryCount: 3,
        focusThrottleInterval: 5000,
      }}
    >
      {children}
    </SWRConfig>
  )
}
