/**
 * 슈퍼 어드민 — 결제 / 구독 / 정산 종합 대시보드.
 *
 * 인증: SUPER_ADMIN_COOKIE 검증.
 * 데이터: feature_flags / subscriptions / payments / payouts 통계.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  verifySuperAdminToken,
  SUPER_ADMIN_COOKIE,
} from '@/lib/services/super-admin'
import {
  fetchAllFeatureFlags,
  listPayoutBatches,
  listCommissionSettings,
} from '@/lib/services/billing'
import { FeatureFlagsToggle } from '@/components/super-admin/feature-flags-toggle'

export const dynamic = 'force-dynamic'

export default async function SuperAdminBillingPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)
  if (!authed) redirect('/super-admin')

  const supabase = await createClient()
  const [flags, batches, commissionSettings, subStats, paymentStats] = await Promise.all([
    fetchAllFeatureFlags(),
    listPayoutBatches(),
    listCommissionSettings(),
    supabase.from('subscriptions').select('status', { count: 'exact', head: false }),
    supabase.from('payments').select('status, amount', { head: false }),
  ])

  const subCount = subStats.data?.length ?? 0
  const subFreePeriod = (subStats.data ?? []).filter((s: any) => s.status === 'free_period').length
  const subActive = (subStats.data ?? []).filter((s: any) => s.status === 'active').length
  const totalRevenue = (paymentStats.data ?? [])
    .filter((p: any) => p.status === 'succeeded')
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0)

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">결제 / 정산 대시보드</h1>
            <p className="text-sm text-muted-foreground mt-1">
              구독 / 결제 / 광장 협회 정산 종합 관리
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 슈퍼 어드민
          </Link>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="전체 구독" value={`${subCount}`} />
          <StatCard label="무료 기간 가입" value={`${subFreePeriod}`} accent="emerald" />
          <StatCard label="활성 구독" value={`${subActive}`} accent="sky" />
          <StatCard
            label="누적 매출"
            value={`${totalRevenue.toLocaleString()}원`}
            accent="amber"
          />
        </div>

        {/* Feature Flags */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">기능 활성화 토글 (Feature Flags)</h2>
          <p className="text-sm text-muted-foreground mb-4">
            6개월 무료 운영 기간 동안에는 모두 OFF 로 둡니다. 활성화 시 코드 배포 없이 토글로 ON.
          </p>
          <FeatureFlagsToggle initialFlags={flags} />
        </section>

        {/* 수수료 설정 */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">카테고리별 수수료율</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">카테고리</th>
                  <th className="text-left p-3 font-medium">수수료율</th>
                  <th className="text-left p-3 font-medium">설명</th>
                  <th className="text-left p-3 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {commissionSettings.map((c) => (
                  <tr key={c.category} className="border-t border-border">
                    <td className="p-3 font-medium">{c.category}</td>
                    <td className="p-3">{Number(c.rate_pct).toFixed(2)}%</td>
                    <td className="p-3 text-muted-foreground">{c.description}</td>
                    <td className="p-3">
                      <span
                        className={
                          c.is_active
                            ? 'text-emerald-600 font-medium'
                            : 'text-muted-foreground'
                        }
                      >
                        {c.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 정산 배치 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">월말 정산 배치</h2>
            <div className="flex gap-3">
              <Link
                href="/super-admin/business-flags"
                className="text-sm text-primary hover:underline"
              >
                업자 탐지 / 사업자 신고 →
              </Link>
              <Link
                href="/super-admin/plaza-associations"
                className="text-sm text-primary hover:underline"
              >
                광장 협회 관리 →
              </Link>
            </div>
          </div>
          {batches.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              아직 정산 배치가 없습니다. 활성화 후 매월 자동 생성됩니다.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium">기간</th>
                    <th className="text-right p-3 font-medium">총 매출</th>
                    <th className="text-right p-3 font-medium">본사 (20%)</th>
                    <th className="text-right p-3 font-medium">광장 (80%)</th>
                    <th className="text-left p-3 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-t border-border">
                      <td className="p-3">
                        {b.period_start} ~ {b.period_end}
                      </td>
                      <td className="p-3 text-right">
                        {b.total_gross_amount.toLocaleString()}원
                      </td>
                      <td className="p-3 text-right">
                        {b.total_hq_amount.toLocaleString()}원
                      </td>
                      <td className="p-3 text-right">
                        {b.total_plaza_amount.toLocaleString()}원
                      </td>
                      <td className="p-3">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'emerald' | 'sky' | 'amber'
}) {
  const accentClass: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    sky: 'text-sky-600 dark:text-sky-400',
    amber: 'text-amber-600 dark:text-amber-400',
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ? accentClass[accent] : ''}`}>{value}</p>
    </div>
  )
}
