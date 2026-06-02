/**
 * 업자 자동 차단 서비스 — 중고거래 신뢰 자산 보호.
 *
 * 정책:
 *   - 중고거래는 일반 사용자(C2C) 전용 플랫폼.
 *   - 사업자(B2C)는 입장 자체를 금지 — 별도 카테고리/마크 운영하지 않음.
 *   - 자동 탐지된 의심 사용자는 관리자가 검토 후 경고 또는 정지.
 *
 * 탐지 기준 (DB SQL 함수 detect_high_volume_users 참조):
 *   - 30일 내 20건 이상 중고거래 등록 → low
 *   - 30일 내 40건 이상 → medium
 *   - 30일 내 60건 이상 → high
 *
 * 추가 기준 (향후 확장):
 *   - 동일 이미지 다중 등록 (이미지 해시 비교)
 *   - 동일 IP 다계정 (auth.users 의 last_sign_in_ip 활용)
 *   - 사용자 신고 누적
 */
import { createClient } from '@/lib/supabase/server'

export interface UserFlag {
  id: string
  user_id: string
  flag_type:
    | 'high_volume_posts'
    | 'duplicate_images'
    | 'multi_account_ip'
    | 'manual_admin'
    | 'reported_by_users'
  severity: 'low' | 'medium' | 'high' | 'critical'
  metadata: Record<string, any>
  status:
    | 'open'
    | 'reviewed_clear'
    | 'reviewed_warning'
    | 'reviewed_suspended'
  reviewed_by: string | null
  reviewed_at: string | null
  reviewer_notes: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// 자동 탐지 / 플래그
// ============================================================================

export interface RunDetectionOptions {
  threshold?: number   // 30일 내 N건 이상 (기본 20)
  daysBack?: number    // 며칠 동안 (기본 30)
}

/**
 * 대량 등록 탐지 → user_flags 자동 생성.
 * cron 으로 매일 호출.
 */
export async function runHighVolumeDetection(
  opts: RunDetectionOptions = {},
): Promise<{ ok: boolean; flagged: number; error?: string }> {
  const supabase = await createClient()
  const threshold = opts.threshold ?? 20
  const daysBack = opts.daysBack ?? 30

  const { data, error } = await supabase.rpc('apply_high_volume_flags', {
    threshold,
    days_back: daysBack,
  })
  if (error) return { ok: false, flagged: 0, error: error.message }
  return { ok: true, flagged: Number(data ?? 0) }
}

/** open 상태 플래그 목록 (관리자 검토용). */
export async function listOpenFlags(limit = 50): Promise<UserFlag[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_flags')
    .select('*')
    .eq('status', 'open')
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as UserFlag[]
}

/** 플래그 처리 (관리자). */
export async function reviewFlag(
  flagId: string,
  reviewerId: string,
  decision: UserFlag['status'],
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (decision === 'open') return { ok: false, error: 'invalid decision' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_flags')
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
      reviewer_notes: notes ?? null,
    })
    .eq('id', flagId)
  return { ok: !error, error: error?.message }
}
