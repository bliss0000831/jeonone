'use client'

/**
 * 슈퍼관리자 — 전체 수익 현황.
 * 모든 광장의 매출 합산, 본사 수수료, 순 분배금 집계.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Wallet, TrendingUp, Building2, RotateCcw } from 'lucide-react'

interface PlazaRevenue {
  plaza_id: string
  plaza_name: string
  total_revenue: number
  platform_fee: number
  net_amount: number
  pending_count: number
}

export default function SuperAdminRevenuePage() {
  const [loading, setLoading] = useState(true)
  const [plazaRevenues, setPlazaRevenues] = useState<PlazaRevenue[]>([])
  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 광장 목록 + 정산 데이터 조인
      const { data: plazas } = await supabase
        .from('plazas')
        .select('id, name')
        .order('name')

      if (!plazas) {
        setPlazaRevenues([])
        setLoading(false)
        return
      }

      // 각 광장의 정산 합계 조회
      const { data: settlements } = await (supabase as any)
        .from('plaza_settlements')
        .select('plaza_id, total_revenue, platform_fee, net_amount, status')

      const settlementMap = new Map<string, { revenue: number; fee: number; net: number; pending: number }>()
      for (const s of settlements || []) {
        const existing = settlementMap.get(s.plaza_id) || { revenue: 0, fee: 0, net: 0, pending: 0 }
        existing.revenue += s.total_revenue || 0
        existing.fee += s.platform_fee || 0
        existing.net += s.net_amount || 0
        if (s.status === 'pending') existing.pending += 1
        settlementMap.set(s.plaza_id, existing)
      }

      const results: PlazaRevenue[] = plazas.map((p: any) => {
        const s = settlementMap.get(p.id) || { revenue: 0, fee: 0, net: 0, pending: 0 }
        return {
          plaza_id: p.id,
          plaza_name: p.name,
          total_revenue: s.revenue,
          platform_fee: s.fee,
          net_amount: s.net,
          pending_count: s.pending,
        }
      })

      setPlazaRevenues(results)
    } catch (e) {
      console.error('Failed to load revenue data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const grandTotalRevenue = plazaRevenues.reduce((s, r) => s + r.total_revenue, 0)
  const grandTotalFee = plazaRevenues.reduce((s, r) => s + r.platform_fee, 0)
  const grandTotalNet = plazaRevenues.reduce((s, r) => s + r.net_amount, 0)
  const totalPending = plazaRevenues.reduce((s, r) => s + r.pending_count, 0)

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
          <h1 className="text-2xl font-bold">전체 수익 현황</h1>
          <p className="text-gray-500 mt-1">모든 광장의 매출 집계 및 수수료 현황</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RotateCcw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 전체 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> 총 매출
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{grandTotalRevenue.toLocaleString()}원</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Wallet className="w-4 h-4" /> 본사 수수료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{grandTotalFee.toLocaleString()}원</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> 광장 분배금
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{grandTotalNet.toLocaleString()}원</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">미처리 정산</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{totalPending}건</div>
          </CardContent>
        </Card>
      </div>

      {/* 광장별 수익 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">광장별 수익 현황</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {plazaRevenues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Building2 className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">등록된 광장이 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">광장</th>
                    <th className="text-right px-4 py-3 font-medium">총 매출</th>
                    <th className="text-right px-4 py-3 font-medium">본사 수수료</th>
                    <th className="text-right px-4 py-3 font-medium">분배금</th>
                    <th className="text-center px-4 py-3 font-medium">미처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {plazaRevenues.map((r) => (
                    <tr key={r.plaza_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-medium">{r.plaza_name}</td>
                      <td className="px-4 py-3 text-right">{r.total_revenue.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-right text-amber-600">{r.platform_fee.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{r.net_amount.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-center">
                        {r.pending_count > 0 ? (
                          <Badge className="bg-orange-100 text-orange-700">{r.pending_count}건</Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-800/50 font-semibold">
                  <tr>
                    <td className="px-4 py-3">합계</td>
                    <td className="px-4 py-3 text-right">{grandTotalRevenue.toLocaleString()}원</td>
                    <td className="px-4 py-3 text-right text-amber-600">{grandTotalFee.toLocaleString()}원</td>
                    <td className="px-4 py-3 text-right text-green-600">{grandTotalNet.toLocaleString()}원</td>
                    <td className="px-4 py-3 text-center">{totalPending > 0 ? `${totalPending}건` : '-'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
