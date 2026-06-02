/**
 * 광장 운영자 (협회) 대시보드 — /plaza-admin
 *
 * 인증: plaza_admins 테이블에 본인이 등록되어 있어야 함.
 * 표시: 본인이 운영하는 광장의 협회 정보 + 매출 / 정산 내역.
 *
 * 6개월 무료 기간 동안에는 정산 데이터가 없으므로 안내 메시지.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/header'
import {
  getPlazaAssociation,
  listPayoutsForPlaza,
  isFeatureEnabled,
  type PlazaAssociation,
  type Payout,
} from '@/lib/services/billing'
import { plazaCityName } from '@/lib/plaza/city-name'
import { Building2, Banknote, Sparkles, Calendar, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PlazaAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // 본인이 운영하는 광장 조회
  const { data: myAdminRows } = await supabase
    .from('plaza_admins')
    .select('plaza_id, role')
    .eq('user_id', user.id)

  const myPlazas = (myAdminRows ?? []) as Array<{ plaza_id: string; role: string }>
  if (myPlazas.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={user} />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-xl font-bold mb-2">광장 운영자 권한이 없습니다</h1>
          <p className="text-sm text-muted-foreground mb-4">
            이 페이지는 광장 협회로 등록된 운영자만 접근할 수 있습니다.
          </p>
          <Link href="/" className="text-sm text-primary hover:underline">
            홈으로
          </Link>
        </main>
      </div>
    )
  }

  // 첫 번째 광장 데이터 (다중 광장 운영 시 향후 셀렉터 추가)
  const plazaId = myPlazas[0].plaza_id
  const [association, payouts, payoutsEnabled] = await Promise.all([
    getPlazaAssociation(plazaId),
    listPayoutsForPlaza(plazaId),
    isFeatureEnabled('monetization.payouts'),
  ])

  // 광장 이름
  const { data: plazaRow } = await supabase
    .from('plazas')
    .select('name')
    .eq('id', plazaId)
    .maybeSingle()
  const plazaDisplayName = plazaRow?.name ?? plazaCityName(plazaId)

  // 누적 통계
  const totalGross = payouts.reduce((s: number, p: any) => s + Number(p.gross_amount), 0)
  const totalNet = payouts.reduce((s: number, p: any) => s + Number(p.net_amount), 0)
  const totalHq = payouts.reduce((s: number, p: any) => s + Number(p.hq_fee_amount), 0)
  const transferred = payouts.filter((p: any) => p.status === 'transferred').length

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Building2 className="w-6 h-6" />
          {plazaDisplayName} 운영자 대시보드
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          광장 협회 (운영 사업자) 정보 / 정산 내역 / 회원사 관리
        </p>

        {/* 무료 기간 안내 */}
        {!payoutsEnabled && (
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-5 mb-6">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-emerald-900 dark:text-emerald-300 mb-1">
                  6개월 무료 운영 기간 진행 중
                </h2>
                <p className="text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed">
                  현재 결제 / 정산 기능이 비활성 상태입니다. 무료 기간 종료 후 매월 1일에
                  자동으로 정산이 생성되며, 본 대시보드에서 내역 / 통장 / 세금계산서를
                  확인하실 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 협회 정보 */}
        <section className="mb-6">
          <h2 className="text-lg font-bold mb-3">협회 정보</h2>
          {association ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <Info label="사업자명" value={association.business_name} />
                <Info label="사업자번호" value={association.business_number} />
                <Info label="대표자" value={association.ceo_name} />
                <Info label="입금 은행" value={association.bank_name} />
                <Info label="계좌번호" value={maskAccount(association.bank_account)} />
                <Info label="예금주" value={association.bank_holder} />
                <Info label="연락처" value={association.contact_email} />
                <Info
                  label="본사 수수료율"
                  value={`${Number(association.royalty_rate).toFixed(0)}%`}
                />
                <Info
                  label="상태"
                  value={association.status === 'active' ? '활성' : association.status}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
                계좌 정보 변경은 본사 운영팀(admin@gwangjang.app)에 문의해 주세요.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 dark:text-amber-200">
                광장 협회가 아직 등록되지 않았습니다. 본사 운영팀에 문의해 주세요.
              </p>
            </div>
          )}
        </section>

        {/* 누적 통계 */}
        <section className="mb-6">
          <h2 className="text-lg font-bold mb-3">누적 정산 통계</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="누적 매출"
              value={`${totalGross.toLocaleString()}원`}
              icon={<Banknote className="w-4 h-4" />}
            />
            <StatCard
              label="협회 수령 (80%)"
              value={`${totalNet.toLocaleString()}원`}
              accent="emerald"
            />
            <StatCard label="본사 수수료 (20%)" value={`${totalHq.toLocaleString()}원`} />
            <StatCard
              label="송금 완료"
              value={`${transferred} / ${payouts.length} 건`}
              accent="sky"
            />
          </div>
        </section>

        {/* 정산 내역 */}
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            정산 내역
          </h2>
          {payouts.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              아직 정산 내역이 없습니다.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium">기간</th>
                    <th className="text-right p-3 font-medium">총 매출</th>
                    <th className="text-right p-3 font-medium">수령</th>
                    <th className="text-left p-3 font-medium">상태</th>
                    <th className="text-left p-3 font-medium">송금일</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p: any) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-3">
                        {p.period_start} ~ {p.period_end}
                      </td>
                      <td className="p-3 text-right">
                        {Number(p.gross_amount).toLocaleString()}원
                      </td>
                      <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {Number(p.net_amount).toLocaleString()}원
                      </td>
                      <td className="p-3">{payoutStatusLabel(p.status)}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {p.transferred_at
                          ? new Date(p.transferred_at).toLocaleDateString('ko-KR')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function maskAccount(acct: string): string {
  if (!acct || acct.length < 4) return acct
  const visible = 4
  return acct.slice(0, visible) + '*'.repeat(Math.max(0, acct.length - visible - 4)) + acct.slice(-4)
}

function payoutStatusLabel(s: Payout['status']): string {
  switch (s) {
    case 'pending': return '대기'
    case 'approved': return '승인 — 송금 대기'
    case 'transferred': return '송금 완료'
    case 'failed': return '실패'
    case 'disputed': return '이의 제기'
    case 'refunded': return '환불됨'
  }
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? '-'}</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  accent?: 'emerald' | 'sky'
}) {
  const accentClass: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    sky: 'text-sky-600 dark:text-sky-400',
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`text-lg font-bold ${accent ? accentClass[accent] : ''}`}>{value}</p>
    </div>
  )
}
