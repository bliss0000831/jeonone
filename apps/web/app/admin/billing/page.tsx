'use client'

/**
 * 광장 운영/수익 통합 페이지.
 *
 * 탭:
 *  - 부스트 결제 (boost_orders)
 *  - 구독 회원 (subscriptions)
 *  - 거래 수수료 (transactions)
 *  - 정산 내역 (payouts) — 광장 협회 운영자에게 보임
 *
 * 모든 데이터는 현재 광장으로 자동 필터링 (RLS).
 */
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Loader2, Rocket, Crown, Banknote, Wallet, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'

type TabKey = 'boosts' | 'subscriptions' | 'transactions' | 'payouts'

interface BoostRow {
  id: string
  user_id: string
  target_type: string
  target_id: string
  tier: string
  amount: number
  starts_at: string
  ends_at: string
  status: string
  free_period: boolean
  created_at: string
}

interface SubRow {
  id: string
  user_id: string
  plan_id: string
  status: string
  current_period_end: string
  is_early_bird: boolean
  applied_discount_pct: number
  created_at: string
}

interface TxRow {
  id: string
  kind: string
  buyer_id: string | null
  seller_id: string | null
  gross_amount: number
  commission_rate: number
  commission_amount: number
  status: string
  completed_at: string | null
  created_at: string
}

interface PayoutRow {
  id: string
  period_start: string
  period_end: string
  gross_amount: number
  hq_fee_amount: number
  net_amount: number
  status: string
  transferred_at: string | null
  created_at: string
}

const TABS: Array<{ key: TabKey; label: string; icon: any; color: string }> = [
  { key: 'boosts',        label: '부스트 결제',  icon: Rocket,  color: 'text-amber-600' },
  { key: 'subscriptions', label: '구독 회원',    icon: Crown,   color: 'text-violet-600' },
  { key: 'transactions',  label: '거래 수수료',  icon: Banknote, color: 'text-emerald-600' },
  { key: 'payouts',       label: '정산 내역',    icon: Wallet,  color: 'text-sky-600' },
]

export default function AdminBillingPage() {
  const [tab, setTab] = useState<TabKey>('boosts')
  const [loading, setLoading] = useState(true)
  const [boosts, setBoosts] = useState<BoostRow[]>([])
  const [subs, setSubs] = useState<SubRow[]>([])
  const [txs, setTxs] = useState<TxRow[]>([])
  const [payouts, setPayouts] = useState<PayoutRow[]>([])

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        const supabase = createClient()
        const plaza = getCurrentPlazaClient()
        if (!plaza) {
          setLoading(false)
          return
        }

        const [bRes, sRes, tRes, pRes] = await Promise.all([
          supabase.from('boost_orders').select('*').eq('plaza_id', plaza)
            .order('created_at', { ascending: false }).limit(100),
          supabase.from('subscriptions').select('*').eq('plaza_id', plaza)
            .order('created_at', { ascending: false }).limit(100),
          supabase.from('transactions').select('*').eq('plaza_id', plaza)
            .order('created_at', { ascending: false }).limit(100),
          supabase.from('payouts').select('*').eq('plaza_id', plaza)
            .order('period_end', { ascending: false }).limit(50),
        ])

        if (bRes.data) setBoosts(bRes.data as BoostRow[])
        if (sRes.data) setSubs(sRes.data as SubRow[])
        if (tRes.data) setTxs(tRes.data as TxRow[])
        if (pRes.data) setPayouts(pRes.data as PayoutRow[])
      } catch (e) {
        console.warn('[admin/billing] fetch failed', e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  // 통계 카드
  const totalBoostRevenue = boosts
    .filter((b) => b.status === 'active' && !b.free_period)
    .reduce((sum, b) => sum + b.amount, 0)
  const activeSubsCount = subs.filter((s) => s.status === 'active' || s.status === 'free_period').length
  const totalTxCommission = txs
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.commission_amount, 0)
  const totalPayoutNet = payouts
    .filter((p) => p.status === 'transferred')
    .reduce((sum, p) => sum + p.net_amount, 0)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
          <CreditCard className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">운영 / 수익</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            부스트 결제, 구독, 거래 수수료, 정산 내역
          </p>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="부스트 매출"
          value={`${totalBoostRevenue.toLocaleString()}원`}
          icon={<Rocket className="w-4 h-4" />}
          color="amber"
          sub={`${boosts.length}건`}
        />
        <StatCard
          label="활성 구독"
          value={`${activeSubsCount}명`}
          icon={<Crown className="w-4 h-4" />}
          color="violet"
          sub={`전체 ${subs.length}건`}
        />
        <StatCard
          label="거래 수수료"
          value={`${totalTxCommission.toLocaleString()}원`}
          icon={<Banknote className="w-4 h-4" />}
          color="emerald"
          sub={`${txs.length}건`}
        />
        <StatCard
          label="협회 수령액"
          value={`${totalPayoutNet.toLocaleString()}원`}
          icon={<Wallet className="w-4 h-4" />}
          color="sky"
          sub={`${payouts.length}회`}
        />
      </div>

      {/* 탭 — 서브틀 디자인 */}
      <div className="flex gap-1 border-b border-border/50">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', active ? '' : 'opacity-60')} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* 콘텐츠 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === 'boosts' && <BoostsTable rows={boosts} />}
          {tab === 'subscriptions' && <SubsTable rows={subs} />}
          {tab === 'transactions' && <TxsTable rows={txs} />}
          {tab === 'payouts' && <PayoutsTable rows={payouts} />}
        </>
      )}

      {/* 안내 */}
      <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-[12px] text-muted-foreground">
        RLS 로 자동 필터링되어 현재 광장 데이터만 표시됩니다.
        전체 통합 보기는 <code className="text-[11px] bg-muted px-1 py-0.5 rounded">/super-admin/billing</code> 에서 확인하세요.
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: 'amber' | 'violet' | 'emerald' | 'sky'
  sub?: string
}) {
  const colorMap = {
    amber:   'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
    violet:  'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
    sky:     'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30',
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={cn('p-1.5 rounded-lg', colorMap[color])}>{icon}</div>
      </div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function BoostsTable({ rows }: { rows: BoostRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="부스트 결제 내역이 없습니다" />
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <Th>대상</Th>
            <Th>등급</Th>
            <Th align="right">금액</Th>
            <Th>기간</Th>
            <Th>상태</Th>
            <Th>등록일</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors">
              <Td>{targetTypeLabel(r.target_type)}</Td>
              <Td>{tierLabel(r.tier)}</Td>
              <Td align="right">
                {r.free_period ? (
                  <span className="text-emerald-600 font-medium">무료</span>
                ) : (
                  `${r.amount.toLocaleString()}원`
                )}
              </Td>
              <Td className="text-xs text-muted-foreground">
                {fmtDate(r.starts_at)} ~ {fmtDate(r.ends_at)}
              </Td>
              <Td><StatusBadge status={r.status} /></Td>
              <Td className="text-xs">{fmtDateTime(r.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubsTable({ rows }: { rows: SubRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="구독 회원이 없습니다" />
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <Th>플랜</Th>
            <Th>상태</Th>
            <Th>얼리버드</Th>
            <Th>다음 결제일</Th>
            <Th>가입일</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors">
              <Td>{planLabel(r.plan_id)}</Td>
              <Td><StatusBadge status={r.status} /></Td>
              <Td>
                {r.is_early_bird ? (
                  <span className="text-amber-600 font-medium">평생 {r.applied_discount_pct}% 할인</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </Td>
              <Td className="text-xs">{fmtDate(r.current_period_end)}</Td>
              <Td className="text-xs">{fmtDateTime(r.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TxsTable({ rows }: { rows: TxRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="거래 내역이 없습니다" />
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <Th>종류</Th>
            <Th align="right">거래액</Th>
            <Th align="right">수수료율</Th>
            <Th align="right">수수료</Th>
            <Th>상태</Th>
            <Th>완료일</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors">
              <Td>{txKindLabel(r.kind)}</Td>
              <Td align="right">{r.gross_amount.toLocaleString()}원</Td>
              <Td align="right" className="text-muted-foreground">{Number(r.commission_rate).toFixed(1)}%</Td>
              <Td align="right" className="font-medium">{r.commission_amount.toLocaleString()}원</Td>
              <Td><StatusBadge status={r.status} /></Td>
              <Td className="text-xs">{r.completed_at ? fmtDateTime(r.completed_at) : '-'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PayoutsTable({ rows }: { rows: PayoutRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="정산 내역이 없습니다" />
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <Th>기간</Th>
            <Th align="right">총 매출</Th>
            <Th align="right">본사 수수료</Th>
            <Th align="right">협회 수령</Th>
            <Th>상태</Th>
            <Th>송금일</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors">
              <Td className="text-xs">{fmtDate(r.period_start)} ~ {fmtDate(r.period_end)}</Td>
              <Td align="right">{r.gross_amount.toLocaleString()}원</Td>
              <Td align="right" className="text-muted-foreground">{r.hq_fee_amount.toLocaleString()}원</Td>
              <Td align="right" className="font-bold text-emerald-600">{r.net_amount.toLocaleString()}원</Td>
              <Td><StatusBadge status={r.status} /></Td>
              <Td className="text-xs">{r.transferred_at ? fmtDate(r.transferred_at) : '-'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th
      className={cn('px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70', align === 'right' ? 'text-right' : 'text-left')}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode
  align?: 'right' | 'left'
  className?: string
}) {
  return <td className={cn('px-4 py-3 text-[13px]', align === 'right' ? 'text-right' : 'text-left', className)}>{children}</td>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    pending:       'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    expired:       'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
    canceled:      'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    refunded:      'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    completed:     'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    free_period:   'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    past_due:      'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
    transferred:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    approved:      'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  }
  const labels: Record<string, string> = {
    active: '활성',
    pending: '대기',
    expired: '만료',
    canceled: '취소',
    refunded: '환불',
    completed: '완료',
    free_period: '무료기간',
    past_due: '결제대기',
    transferred: '송금완료',
    approved: '승인',
    disputed: '이의',
    failed: '실패',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', map[status] ?? 'bg-slate-100 text-slate-700')}>
      {labels[status] ?? status}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

// ===== 라벨 =====

function targetTypeLabel(t: string): string {
  const m: Record<string, string> = {
    property: '부동산',
    new_store: '신장개업',
    job: '구인구직',
    group_buying: '공동구매',
    club: '모임',
  }
  return m[t] ?? t
}

function tierLabel(t: string): string {
  const m: Record<string, string> = {
    main_banner_3d: '메인 배너 3일',
    main_banner_7d: '메인 배너 1주',
    category_top_3d: '카테고리 상단 3일',
    category_top_7d: '카테고리 상단 1주',
    card_news_push: 'AI 카드뉴스 + 푸시',
  }
  return m[t] ?? t
}

function planLabel(p: string): string {
  const m: Record<string, string> = {
    realtor: '공인중개사',
    service_provider: '서비스 업종',
    newstore_basic: '신장개업 베이직',
  }
  return m[p] ?? p
}

function txKindLabel(k: string): string {
  const m: Record<string, string> = {
    group_buying: '공동구매',
    local_food: '로컬푸드',
    service_match: '서비스 매칭',
    secondhand_safe: '중고 안전거래',
  }
  return m[k] ?? k
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

function fmtDateTime(s: string): string {
  const d = new Date(s)
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}
