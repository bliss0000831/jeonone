/**
 * 슈퍼 어드민 — 업자 자동 차단.
 *
 * 정책: 중고거래는 일반 사용자 전용. 사업자는 입장 자체 금지.
 * 자동 탐지된 의심 사용자(대량 등록 등) 를 관리자가 검토 → 경고 / 정지.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  verifySuperAdminToken,
  SUPER_ADMIN_COOKIE,
} from '@/lib/services/super-admin'
import { listOpenFlags } from '@/lib/services/business-detection'
import { FlagsReviewClient } from '@/components/super-admin/flags-review'
import { Shield, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function BusinessFlagsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)
  if (!authed) redirect('/super-admin')

  const supabase = await createClient()
  const flags = await listOpenFlags(100)

  // 플래그된 사용자 프로필 조회
  const userIds = Array.from(new Set(flags.map((f) => f.user_id)))
  const profilesRes = userIds.length
    ? await supabase
        .from('profiles')
        .select('id, nickname, avatar_url, phone')
        .in('id', userIds)
    : { data: [] }
  const profilesById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-red-500" />
              업자 자동 차단 (중고거래)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              자동 탐지된 의심 사용자 검토 → 경고 또는 정지.
            </p>
          </div>
          <Link href="/super-admin/billing" className="text-sm text-muted-foreground">
            ← 결제 대시보드
          </Link>
        </div>

        {/* 정책 안내 */}
        <div className="rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-red-900 dark:text-red-200 mb-1">
                정책: 중고거래는 일반 사용자(C2C) 전용
              </p>
              <p className="text-red-800 dark:text-red-200 leading-relaxed">
                사업자(B2C)는 입장 자체가 금지되며, 별도 카테고리/마크 운영하지 않습니다.
                자동 탐지된 의심 사용자는 검토 후 즉시 경고 또는 정지 처리합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 자동 탐지 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="검토 대기"
            value={`${flags.filter((f) => f.severity === 'low').length}`}
            color="yellow"
            sub="LOW"
          />
          <StatCard
            label="중간 의심"
            value={`${flags.filter((f) => f.severity === 'medium').length}`}
            color="amber"
            sub="MEDIUM"
          />
          <StatCard
            label="고도 의심"
            value={`${flags.filter((f) => f.severity === 'high').length}`}
            color="orange"
            sub="HIGH"
          />
          <StatCard
            label="긴급"
            value={`${flags.filter((f) => f.severity === 'critical').length}`}
            color="red"
            sub="CRITICAL"
          />
        </div>

        <section>
          <h2 className="text-lg font-bold mb-3">검토 대기 ({flags.length})</h2>
          <p className="text-xs text-muted-foreground mb-3">
            매일 03:00 UTC 자동 갱신. 30일 내 20건 이상 중고거래 등록 시 자동 플래그.
          </p>
          <FlagsReviewClient
            flags={flags}
            profiles={Object.fromEntries(profilesById)}
          />
        </section>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string
  value: string
  color: 'yellow' | 'amber' | 'orange' | 'red'
  sub: string
}) {
  const map: Record<string, string> = {
    yellow: 'text-yellow-600 dark:text-yellow-400',
    amber: 'text-amber-600 dark:text-amber-400',
    orange: 'text-orange-600 dark:text-orange-400',
    red: 'text-red-600 dark:text-red-400',
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${map[color]}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  )
}
