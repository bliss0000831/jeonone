'use client'

/**
 * 업체별 정산 페이지.
 * 지역 내 업체들의 정산금 계산, 수수료 공제, 지급 처리.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Banknote, RotateCcw, TrendingUp, ArrowRight, Building2, Save } from 'lucide-react'

interface Settlement {
  id: string
  plaza_id: string
  period_start: string
  period_end: string
  total_revenue: number
  platform_fee: number
  net_amount: number
  commission_rate: number
  status: 'pending' | 'confirmed' | 'settled' | 'paid'
  created_at: string
}

interface BankAccount {
  bank_name: string
  account_number: string
  account_holder: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: '정산 대기',  color: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: '확인 완료',  color: 'bg-blue-100 text-blue-700' },
  settled:   { label: '정산 완료',  color: 'bg-green-100 text-green-700' },
  paid:      { label: '지급 완료',  color: 'bg-emerald-100 text-emerald-700' },
}

export default function BillingSettlementsPage() {
  const [loading, setLoading] = useState(true)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [bankAccount, setBankAccount] = useState<BankAccount>({ bank_name: '', account_number: '', account_holder: '' })
  const [bankSaving, setBankSaving] = useState(false)
  const [bankMessage, setBankMessage] = useState<string | null>(null)
  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadData = useCallback(async () => {
    if (!plaza) return
    setLoading(true)
    try {
      const [settRes, bankRes] = await Promise.all([
        (supabase as any)
          .from('plaza_settlements')
          .select('*')
          .eq('plaza_id', plaza)
          .order('period_start', { ascending: false })
          .limit(50),
        (supabase as any)
          .from('site_settings')
          .select('value')
          .eq('key', `bank_account_${plaza}`)
          .maybeSingle(),
      ])
      setSettlements((settRes.data as Settlement[]) || [])
      if (bankRes.data?.value) {
        try {
          const parsed = typeof bankRes.data.value === 'string'
            ? JSON.parse(bankRes.data.value)
            : bankRes.data.value
          setBankAccount({
            bank_name: parsed.bank_name || '',
            account_number: parsed.account_number || '',
            account_holder: parsed.account_holder || '',
          })
        } catch { /* 파싱 실패 무시 */ }
      }
    } catch (e) {
      console.error('Failed to load settlements:', e)
    } finally {
      setLoading(false)
    }
  }, [plaza])

  const saveBankAccount = async () => {
    if (!plaza) return
    setBankSaving(true)
    setBankMessage(null)
    try {
      const res = await fetch('/api/admin/billing/bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bankAccount),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `저장 실패 (${res.status})`)
      }
      setBankMessage('저장되었습니다')
      setTimeout(() => setBankMessage(null), 3000)
    } catch (e: any) {
      setBankMessage(`저장 실패: ${e?.message || '오류'}`)
    } finally {
      setBankSaving(false)
    }
  }

  useEffect(() => { loadData() }, [loadData])

  const totalRevenue = settlements.reduce((s, r) => s + r.total_revenue, 0)
  const totalFee = settlements.reduce((s, r) => s + r.platform_fee, 0)
  const totalNet = settlements.reduce((s, r) => s + r.net_amount, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">업체별 정산</h1>
          <p className="text-muted-foreground mt-1">정산금 계산, 수수료 공제, 지급 처리</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RotateCcw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 매출</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString()}원</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">플랫폼 수수료</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{totalFee.toLocaleString()}원</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">순 분배금</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalNet.toLocaleString()}원</div>
          </CardContent>
        </Card>
      </div>

      {/* 정산 계좌 등록 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            정산 계좌 정보
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">은행명</label>
              <Input
                value={bankAccount.bank_name}
                onChange={(e) => setBankAccount(prev => ({ ...prev, bank_name: e.target.value }))}
                placeholder="예: 국민은행"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">계좌번호</label>
              <Input
                value={bankAccount.account_number}
                onChange={(e) => setBankAccount(prev => ({ ...prev, account_number: e.target.value }))}
                placeholder="- 없이 숫자만"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">예금주</label>
              <Input
                value={bankAccount.account_holder}
                onChange={(e) => setBankAccount(prev => ({ ...prev, account_holder: e.target.value }))}
                placeholder="예금주명"
                className="h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Button
              size="sm"
              onClick={saveBankAccount}
              disabled={bankSaving || !bankAccount.bank_name || !bankAccount.account_number || !bankAccount.account_holder}
            >
              {bankSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              저장
            </Button>
            {bankMessage && (
              <span className={`text-xs ${bankMessage === '저장되었습니다' ? 'text-emerald-600' : 'text-destructive'}`}>
                {bankMessage}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 정산 내역 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">정산 내역</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {settlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Banknote className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">정산 내역이 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">정산 기간</th>
                    <th className="text-right px-4 py-3 font-medium">총 매출</th>
                    <th className="text-right px-4 py-3 font-medium">수수료율</th>
                    <th className="text-right px-4 py-3 font-medium">수수료</th>
                    <th className="text-right px-4 py-3 font-medium">분배금</th>
                    <th className="text-center px-4 py-3 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {settlements.map((s) => {
                    const st = STATUS_LABEL[s.status] || STATUS_LABEL.pending
                    return (
                      <tr key={s.id} className="hover:bg-accent/50">
                        <td className="px-4 py-3">
                          <span className="text-xs">
                            {new Date(s.period_start).toLocaleDateString('ko-KR')}
                          </span>
                          <ArrowRight className="w-3 h-3 inline mx-1 text-muted-foreground" />
                          <span className="text-xs">
                            {new Date(s.period_end).toLocaleDateString('ko-KR')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {s.total_revenue.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {s.commission_rate}%
                        </td>
                        <td className="px-4 py-3 text-right text-orange-600">
                          {s.platform_fee.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600">
                          {s.net_amount.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="secondary" className={st.color}>
                            {st.label}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
