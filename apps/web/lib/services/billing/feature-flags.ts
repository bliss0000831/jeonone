/**
 * Feature Flag 서비스 — 6개월 무료 운영 기간 동안 결제 기능을 코드 배포 없이
 * ON/OFF 가능하게 하는 토글 시스템.
 *
 * - 서버에서만 호출 (DB 접근 필요).
 * - Next.js cache 로 60초 캐시 → DB 부하 최소화.
 * - 슈퍼 어드민이 토글하면 cache invalidate 호출 필요.
 *
 * 기본 동작 — 플래그 키가 DB 에 없으면 OFF (안전한 기본값).
 */
import { createClient } from '@/lib/supabase/server'
import { unstable_cache, revalidateTag } from 'next/cache'
import type { FeatureFlag, FeatureFlagKey } from './types'

const FEATURE_FLAGS_TAG = 'billing-feature-flags'
const CACHE_TTL_SECONDS = 60

/**
 * 단일 플래그 조회 — DB 접근 60초 캐시.
 *
 * @example
 *   if (await isFeatureEnabled('monetization.subscriptions')) {
 *     // 구독 결제 UI 노출
 *   }
 */
export const isFeatureEnabled = unstable_cache(
  async (key: FeatureFlagKey): Promise<boolean> => {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('key', key)
        .maybeSingle()
      return data?.enabled === true
    } catch {
      // DB 에러 시 안전하게 OFF
      return false
    }
  },
  ['feature-flag'],
  { tags: [FEATURE_FLAGS_TAG], revalidate: CACHE_TTL_SECONDS },
)

/** 모든 플래그 조회 (관리자 UI 용). */
export const fetchAllFeatureFlags = unstable_cache(
  async (): Promise<FeatureFlag[]> => {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('feature_flags')
        .select('*')
        .order('key')
      return (data ?? []) as FeatureFlag[]
    } catch {
      return []
    }
  },
  ['feature-flags-all'],
  { tags: [FEATURE_FLAGS_TAG], revalidate: CACHE_TTL_SECONDS },
)

/**
 * 플래그 토글 — 슈퍼 어드민만 호출 가능.
 *
 * RLS 가 권한을 강제하므로, 호출자는 인증된 관리자 세션이어야 함.
 */
export async function setFeatureFlag(
  key: FeatureFlagKey,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('feature_flags')
      .upsert({ key, enabled, updated_at: new Date().toISOString() }, { onConflict: 'key' })

    if (error) return { ok: false, error: error.message }

    // cache invalidate
    ;(revalidateTag as any)(FEATURE_FLAGS_TAG, 'max')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

/**
 * 클라이언트용 — 다중 플래그 조회.
 * 클라이언트에서 fetch('/api/billing/feature-flags') 등으로 호출.
 */
export async function fetchEnabledFlags(
  keys: FeatureFlagKey[],
): Promise<Record<FeatureFlagKey, boolean>> {
  const results = await Promise.all(keys.map(async (k) => [k, await isFeatureEnabled(k)] as const))
  return Object.fromEntries(results) as Record<FeatureFlagKey, boolean>
}
