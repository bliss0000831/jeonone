'use client'

/**
 * 광장 관리자 — 포인트 시스템 운영 페이지.
 *
 * 4개 탭:
 *  - 대시보드: 발행/회수/잔액 통계
 *  - 적립 규칙: point_rules 조회 (편집은 차후)
 *  - 사용처: point_redemption_settings 조회
 *  - 거래 내역: point_transactions 검색
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Coins, TrendingUp, ShieldCheck, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type TabKey = 'dashboard' | 'rules' | 'redemption' | 'transactions'

const TABS: Array<{ key: TabKey; label: string; icon: any }> = [
  { key: 'dashboard',    label: '대시보드',     icon: TrendingUp },
  { key: 'rules',        label: '적립 규칙',    icon: Coins },
  { key: 'redemption',   label: '사용처',       icon: ShieldCheck },
  { key: 'transactions', label: '거래 내역',    icon: ListChecks },
]

export default function AdminPointsPage() {
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalEarned: 0,
    totalManualGrant: 0,
    totalSpent: 0,
    totalDeducted: 0,
    activeBalance: 0,
    activeUsers: 0,
    pendingCount: 0,
  })
  const [rules, setRules] = useState<any[]>([])
  const [redemptions, setRedemptions] = useState<any[]>([])
  const [recentTxs, setRecentTxs] = useState<any[]>([])

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        const supabase = createClient()
        const plaza = getCurrentPlazaClient()

        const [r, rd, txs, balances] = await Promise.all([
          supabase.from('point_rules').select('*').order('amount', { ascending: false }),
          supabase.from('point_redemption_settings').select('*').order('display_name'),
          supabase
            .from('point_transactions')
            .select('*')
            .eq('plaza_id', plaza ?? '')
            .order('created_at', { ascending: false })
            .limit(100),
          supabase.from('user_points').select('*'),
        ])

        if (r.data) setRules(r.data)
        if (rd.data) setRedemptions(rd.data)
        if (txs.data) setRecentTxs(txs.data)

        // 통계 집계
        const allTxs = (txs.data ?? []) as any[]
        // 자동 적립 (earn)
        const earned = allTxs.filter(t => t.type === 'earn' && t.status === 'confirmed').reduce((s, t) => s + t.amount, 0)
        // 관리자 수동 지급 (manual_adjust, event — credit 방향)
        const manualGrant = allTxs
          .filter(t => (t.type === 'manual_adjust' || t.type === 'event') && t.status === 'confirmed')
          .reduce((s, t) => s + t.amount, 0)
        // 사용 (spend)
        const spent = allTxs.filter(t => t.type === 'spend' && t.status === 'confirmed').reduce((s, t) => s + t.amount, 0)
        // 차감/회수 (penalty 확정 + 자동 회수 reverted)
        const deducted = allTxs
          .filter(t => (t.type === 'penalty' && t.status === 'confirmed') || t.status === 'reverted')
          .reduce((s, t) => s + t.amount, 0)
        const pending = allTxs.filter(t => t.status === 'pending').length
        const balanceData = (balances.data ?? []) as any[]
        const activeBalance = balanceData.reduce((s, b) => s + (b.available ?? 0), 0)
        const activeUsers = balanceData.filter(b => (b.available ?? 0) > 0).length

        setStats({
          totalEarned: earned,
          totalManualGrant: manualGrant,
          totalSpent: spent,
          totalDeducted: deducted,
          activeBalance,
          activeUsers,
          pendingCount: pending,
        })
      } catch (e) {
        console.warn('[admin/points] fetch failed', e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Coins className="w-6 h-6 text-amber-500" />
          포인트 시스템
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          포인트 적립 규칙, 사용처 정책, 전체 거래 내역을 관리합니다. 개별 회원 지급/차감은 회원관리 &gt; 포인트 관리에서 처리하세요.
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2.5">
        <StatBox label="자동 적립" value={stats.totalEarned} suffix="pt" color="emerald" />
        <StatBox label="관리자 지급" value={stats.totalManualGrant} suffix="pt" color="violet" />
        <StatBox label="누적 사용" value={stats.totalSpent} suffix="pt" color="blue" />
        <StatBox label="차감/회수" value={stats.totalDeducted} suffix="pt" color="red" />
        <StatBox label="활성 잔액" value={stats.activeBalance} suffix="pt" color="amber" />
        <StatBox label="잔액 보유자" value={stats.activeUsers} suffix="명" color="violet" />
        <StatBox label="평가 대기" value={stats.pendingCount} suffix="건" color="orange" />
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === 'dashboard' && (
            <Card>
              <CardContent className="p-6 space-y-3 text-sm">
                <h2 className="font-bold mb-2">포인트 시스템 상태</h2>
                <ul className="space-y-2 text-muted-foreground">
                  <li>자동 적립 (확정): <strong className="text-emerald-600">{stats.totalEarned.toLocaleString()}pt</strong></li>
                  <li>관리자 수동 지급: <strong className="text-violet-600">{stats.totalManualGrant.toLocaleString()}pt</strong></li>
                  <li>총 사용: <strong className="text-blue-600">{stats.totalSpent.toLocaleString()}pt</strong></li>
                  <li>차감/회수 (페널티/평가실패): <strong className="text-red-600">{stats.totalDeducted.toLocaleString()}pt</strong></li>
                  <li>현재 사용자 잔액 합계: <strong className="text-amber-600">{stats.activeBalance.toLocaleString()}pt</strong></li>
                  <li>평가 대기 중인 거래: <strong className="text-foreground">{stats.pendingCount}건</strong></li>
                </ul>
                <div className="mt-4 p-3 rounded-lg bg-muted/40 text-xs">
                  💡 평가 대기 거래는 매시간 cron 으로 자동 처리됩니다 (확정 또는 회수). 24시간 후 평가 시각이 도래.
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'rules' && (
            <RulesEditor rules={rules} onChange={setRules} />
          )}

          {tab === 'redemption' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {redemptions.map((r: any) => (
                <Card key={r.category}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold">{r.display_name}</h3>
                      <Badge active={r.enabled} />
                    </div>
                    <dl className="space-y-1.5 text-sm">
                      <Row label="최대 사용 비율" value={`${r.max_redemption_pct}%`} />
                      <Row label="환율" value={`1pt = ${r.exchange_rate}원`} />
                      <Row label="일 사용 한도" value={r.daily_limit_pt ? `${r.daily_limit_pt.toLocaleString()}pt` : '무제한'} />
                      <Row label="필요 가입일" value={`${r.required_account_age_days}일+`} />
                    </dl>
                    {r.description && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">{r.description}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {tab === 'transactions' && (
            <div className="rounded-lg border border-border overflow-hidden">
              {recentTxs.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  거래 내역이 없습니다 (Feature Flag OFF 또는 활동 없음)
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <Th>종류</Th>
                      <Th>활동</Th>
                      <Th align="right">금액</Th>
                      <Th align="center">상태</Th>
                      <Th align="right">시각</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTxs.map((tx: any) => (
                      <tr key={tx.id} className="border-t border-border">
                        <Td>
                          <span className={cn(
                            'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium',
                            txTypeColor(tx.type),
                          )}>
                            {txTypeLabel(tx.type)}
                          </span>
                        </Td>
                        <Td className="text-xs text-muted-foreground">{tx.source}</Td>
                        <Td align="right" className={cn(
                          'font-bold tabular-nums',
                          ['earn', 'manual_adjust', 'event'].includes(tx.type)
                            ? 'text-emerald-600'
                            : tx.type === 'spend' ? 'text-blue-600' : 'text-red-600',
                        )}>
                          {['earn', 'manual_adjust', 'event'].includes(tx.type) ? '+' : '-'}{tx.amount.toLocaleString()}pt
                        </Td>
                        <Td align="center">
                          <StatusBadge status={tx.status} />
                        </Td>
                        <Td align="right" className="text-xs text-muted-foreground">
                          {new Date(tx.created_at).toLocaleString('ko-KR', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          💡 Feature Flag <code>monetization.points</code> 가 OFF 인 동안에는 포인트 적립이 작동하지 않습니다.
          {' '}<a href="/super-admin/billing" className="text-primary underline hover:no-underline">슈퍼 어드민</a>에서 토글하세요.
        </CardContent>
      </Card>
    </div>
  )
}

function StatBox({ label, value, suffix, color }: {
  label: string
  value: number
  suffix: string
  color: 'emerald' | 'blue' | 'red' | 'amber' | 'violet' | 'orange'
}) {
  const colorMap = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    violet: 'text-violet-600',
    orange: 'text-orange-600',
  }
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
        <div className={cn('text-xl font-extrabold tabular-nums', colorMap[color])}>
          {value.toLocaleString()}<span className="text-sm font-medium opacity-70 ml-0.5">{suffix}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'center' }) {
  return (
    <th className={cn('px-3 py-2 text-xs font-semibold text-muted-foreground',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
    )}>{children}</th>
  )
}

function Td({ children, align, className }: { children: React.ReactNode; align?: 'right' | 'center'; className?: string }) {
  return (
    <td className={cn('px-3 py-2',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      className,
    )}>{children}</td>
  )
}

function Badge({ active }: { active: boolean }) {
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
      active
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
    )}>
      {active ? '활성' : '비활성'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    reverted:  'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  }
  const labels: Record<string, string> = {
    pending: '대기',
    confirmed: '확정',
    reverted: '회수',
  }
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', m[status] ?? '')}>
      {labels[status] ?? status}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function txTypeLabel(t: string): string {
  const m: Record<string, string> = {
    earn: '적립', spend: '사용', revert: '회수',
    expire: '만료', manual_adjust: '관리자', penalty: '페널티', event: '이벤트',
  }
  return m[t] ?? t
}

// ==== 규칙 편집기 ====================================
function RulesEditor({ rules, onChange }: { rules: any[]; onChange: (next: any[]) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<any>({})
  const [saving, setSaving] = useState(false)

  function startEdit(r: any) {
    setEditingId(r.id)
    setDraft({
      amount: r.amount,
      daily_cap: r.daily_cap,
      cooldown_seconds: r.cooldown_seconds,
      evaluation_period_hours: r.evaluation_period_hours,
      enabled: r.enabled,
    })
  }

  async function save(id: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/points/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? '저장 실패')
      // 로컬 갱신
      onChange(rules.map((r) => (r.id === id ? { ...r, ...draft } : r)))
      setEditingId(null)
      toast.success('저장되었습니다')
    } catch (e: any) {
      toast.error(e?.message ?? '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>활동</Th>
            <Th align="right">적립</Th>
            <Th align="center">일 한도</Th>
            <Th align="center">평가</Th>
            <Th align="center">활성</Th>
            <Th align="center">편집</Th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r: any) => {
            const editing = editingId === r.id
            return (
              <tr key={r.id} className="border-t border-border">
                <Td>
                  <div className="font-medium">{r.display_name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </Td>
                <Td align="right">
                  {editing ? (
                    <input
                      type="number"
                      value={draft.amount}
                      onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                      className="w-16 px-1.5 py-0.5 rounded border border-border bg-background text-right text-sm"
                    />
                  ) : (
                    <span className="font-bold text-amber-600 tabular-nums">+{r.amount}pt</span>
                  )}
                </Td>
                <Td align="center" className="text-xs text-muted-foreground">
                  {editing ? (
                    <input
                      type="number"
                      value={draft.daily_cap ?? ''}
                      onChange={(e) =>
                        setDraft({ ...draft, daily_cap: e.target.value ? Number(e.target.value) : null })
                      }
                      placeholder="없음"
                      className="w-14 px-1.5 py-0.5 rounded border border-border bg-background text-center text-sm"
                    />
                  ) : (
                    r.daily_cap ? `${r.daily_cap}회` : '무제한'
                  )}
                </Td>
                <Td align="center" className="text-xs text-muted-foreground">
                  {editing ? (
                    <input
                      type="number"
                      value={draft.evaluation_period_hours}
                      onChange={(e) => setDraft({ ...draft, evaluation_period_hours: Number(e.target.value) })}
                      className="w-12 px-1.5 py-0.5 rounded border border-border bg-background text-center text-sm"
                    />
                  ) : (
                    r.evaluation_period_hours === 0 ? '즉시' : `${r.evaluation_period_hours}h`
                  )}
                </Td>
                <Td align="center">
                  {editing ? (
                    <input
                      type="checkbox"
                      checked={!!draft.enabled}
                      onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                    />
                  ) : (
                    <Badge active={r.enabled} />
                  )}
                </Td>
                <Td align="center">
                  {editing ? (
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => save(r.id)} className="h-6 text-xs">
                        저장
                      </Button>
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditingId(null)} className="h-6 text-xs">
                        취소
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => startEdit(r)} className="h-6 text-xs">
                      편집
                    </Button>
                  )}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function txTypeColor(t: string): string {
  const m: Record<string, string> = {
    earn:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    spend:   'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    revert:  'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
    expire:  'bg-slate-100 text-slate-700',
    manual_adjust: 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
    penalty: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
    event:   'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  }
  return m[t] ?? 'bg-slate-100 text-slate-700'
}
