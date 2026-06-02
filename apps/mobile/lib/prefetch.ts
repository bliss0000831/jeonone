/**
 * 앱 시작 시 Lottie 스플래시 동안 미리 로드할 데이터.
 * 메인 화면 진입 시 로딩 없이 즉시 콘텐츠 표시.
 *
 * 최적화 전략:
 *   CRITICAL (앱 사용 전 반드시 완료): 광장 정보(AsyncStorage), Supabase 세션 복원
 *   DEFERRABLE (앱 사용 가능 후 백그라운드): DNS 워밍업
 */

import { InteractionManager } from "react-native"
import { getSupabase } from "@/lib/supabase"
import { loadSelectedPlaza } from "@/lib/plaza"

export interface PrefetchResult {
  plazaId: string | null
  session: any | null
}

let _prefetchPromise: Promise<PrefetchResult> | null = null
let _result: PrefetchResult | null = null

/**
 * 앱 시작 시 1회 호출 — 결과를 캐시하여 중복 실행 방지.
 * Lottie 재생 중 뒤에서 병렬 실행.
 *
 * CRITICAL 작업만 await — DNS 워밍업은 InteractionManager 로 지연.
 */
export function startPrefetch(): Promise<PrefetchResult> {
  if (_prefetchPromise) return _prefetchPromise

  _prefetchPromise = (async () => {
    const supabase = getSupabase()

    // ── CRITICAL: 앱 사용 전 반드시 완료 ──
    // 광장 정보 + Supabase 세션만 병렬 실행 (이 두 가지가 라우팅/인증에 필수)
    const [plaza, sessionResult] = await Promise.all([
      // 1. 광장 정보 (AsyncStorage)
      loadSelectedPlaza(),
      // 2. Supabase 세션 복원
      supabase.auth.getSession().catch(() => ({ data: { session: null } })),
    ])

    _result = {
      plazaId: plaza?.id ?? null,
      session: sessionResult?.data?.session ?? null,
    }

    // ── DEFERRABLE: 앱 인터랙션 가능 후 백그라운드 실행 ──
    // DNS 워밍업은 첫 paint 이후에 실행해도 충분 (매물 상세 진입까지 3~5초 소요)
    InteractionManager.runAfterInteractions(() => {
      Promise.all([
        fetch("https://map.pstatic.net/", { method: "HEAD" }).catch(() => {}),
        fetch("https://maps.apigw.ntruss.com/", { method: "HEAD" }).catch(() => {}),
      ])
    })

    return _result
  })()

  return _prefetchPromise
}

/** prefetch 완료 여부 동기 체크 */
export function isPrefetchDone(): boolean {
  return _result !== null
}

/** prefetch 결과 (완료 후에만 non-null) */
export function getPrefetchResult(): PrefetchResult | null {
  return _result
}
