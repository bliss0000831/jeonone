'use client'

/**
 * 슈퍼관리자 — 지역별 정산 관리.
 * 정산 조회, 상태 변경 (pending → confirmed → settled → paid).
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  RotateCcw,
  ArrowRight,
  CheckCircle,
  Clock,
  Banknote,
  CreditCard,
} from 'lucide-react'

interface Settlement {
  id: string
  plaza_id: string
  period_start: string
  period_end: string
  total_revenue: number
  platform_fee: number
  net_amount: number
  commission_rate: number
  status: string
  memo: string | null
  settled_at: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  pending:   { label: '정산 대기',  color: 'bg-yellow-100 text-yellow-700', next: 'confirmed', nextLabel: '확인 처리' },
  confirmed: { label: '확인 완료',  color: 'bg-blue-100 text-blue-700',     next: 'settled',   nextLabel: '정산 처리' },
  settled:   { label: '정산 완료',  color: 'bg-green-100 text-green-700',   next: 'paid',      nextLabel: '지급 처리' },
  paid:      { label: '지급 완료',  color: 'bg-emerald-100 text-emerald-700' },
}

export default function SuperAdminSettlementsPage() {
  const [loading, setLoading] = useState(true)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [plazaNames, setPlazaNames] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState<string | null>(null)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: settlementData }, { data: plazas }] = await Promise.all([
        (supabase as any)
          .from('plaza_settlements')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('plazas').select('id, name'),
      ])

      setSettlements((settlementData as Settlement[]) || [])

      const names: Record<string, string> = {}
      for (const p of plazas || []) {
        names[(p as any).id] = (p as any).name
      }
      setPlazaNames(names)
    } catch (e) {
      console.error('Failed to load settlements:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleStatusChange = async (id: string, nextStatus: string) => {
    setProcessing(id)
    try {
      const update: Record<string, any> = { status: nextStatus }
      if (nextStatus === 'settled' || nextStatus === 'paid') {
        update.settled_at = new Date().toISOString()
      }
      await (supabase as any)
        .from('plaza_settlements')
        .update(update)
        .eq('id', id)
      await loadData()
    } catch (e) {
      console.error('Failed to update settlement status:', e)
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">지역별 정산</h1>
          <p className="text-gray-500 mt-1">정산 상태 관리 및 지급 처리</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RotateCcw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 상태별 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <Card key={key}>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-gray-500">{cfg.label}</div>
              <div className="text-xl font-bold mt-1">
                {settlements.filter(s => s.status === key).length}건
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 정산 목록 */}
      <Card>
        <CardContent className="p-0">
          {settlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Banknote className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">정산 내역이 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">지역</th>
                    <th className="text-left px-4 py-3 font-medium">정산 기간</th>
                    <th className="text-right px-4 py-3 font-medium">매출</th>
                    <th className="text-right px-4 py-3 font-medium">수수료 ({'%'})</th>
                    <th className="text-right px-4 py-3 font-medium">분배금</th>
                    <th className="text-center px-4 py-3 font-medium">상태</th>
                    <th className="text-center px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {settlements.map((s) => {
                    const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.pending
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-4 py-3 font-medium">
                          {plazaNames[s.plaza_id] || s.plaza_id}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(s.period_start).toLocaleDateString('ko-KR')}
                          <ArrowRight className="w-3 h-3 inline mx-1" />
                          {new Date(s.period_end).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-4 py-3 text-right">{s.total_revenue.toLocaleString()}원</td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {s.platform_fee.toLocaleString()}원 ({s.commission_rate}%)
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600">
                          {s.net_amount.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="secondary" className={cfg.color}>
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cfg.next ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={processing === s.id}
                              onClick={() => handleStatusChange(s.id, cfg.next!)}
                            >
                              {processing === s.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                cfg.nextLabel
                              )}
                            </Button>
                          ) : (
                            <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                          )}
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
