'use client'

/**
 * 슈퍼관리자 — 정산 내역서.
 * 월별 정산 내역 조회.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, RotateCcw, Calendar, Download } from 'lucide-react'

interface MonthlyStatement {
  month: string
  plazaCount: number
  totalRevenue: number
  totalFee: number
  totalNet: number
  settledCount: number
  pendingCount: number
}

export default function SuperAdminStatementsPage() {
  const [loading, setLoading] = useState(true)
  const [statements, setStatements] = useState<MonthlyStatement[]>([])
  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await (supabase as any)
        .from('plaza_settlements')
        .select('plaza_id, period_start, total_revenue, platform_fee, net_amount, status')
        .order('period_start', { ascending: false })

      if (data && data.length > 0) {
        // 월별 그룹핑
        const monthly = new Map<string, MonthlyStatement>()
        const plazaSets = new Map<string, Set<string>>()
        for (const s of data) {
          const d = new Date(s.period_start)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const existing = monthly.get(key) || {
            month: key,
            plazaCount: 0,
            totalRevenue: 0,
            totalFee: 0,
            totalNet: 0,
            settledCount: 0,
            pendingCount: 0,
          }
          if (!plazaSets.has(key)) plazaSets.set(key, new Set<string>())
          plazaSets.get(key)!.add(s.plaza_id)
          existing.totalRevenue += s.total_revenue || 0
          existing.totalFee += s.platform_fee || 0
          existing.totalNet += s.net_amount || 0
          if (s.status === 'paid' || s.status === 'settled') {
            existing.settledCount += 1
          } else {
            existing.pendingCount += 1
          }
          monthly.set(key, existing)
        }
        for (const [key, entry] of monthly) {
          entry.plazaCount = plazaSets.get(key)?.size ?? 0
        }
        setStatements(Array.from(monthly.values()))
      } else {
        setStatements([])
      }
    } catch (e) {
      console.error('Failed to load statements:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">정산 내역서</h1>
          <p className="text-gray-500 mt-1">월별 정산 내역 조회 및 다운로드</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RotateCcw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {statements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">정산 내역이 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">월</th>
                    <th className="text-right px-4 py-3 font-medium">총 매출</th>
                    <th className="text-right px-4 py-3 font-medium">수수료</th>
                    <th className="text-right px-4 py-3 font-medium">분배금</th>
                    <th className="text-center px-4 py-3 font-medium">처리현황</th>
                    <th className="text-center px-4 py-3 font-medium">내역서</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {statements.map((s) => (
                    <tr key={s.month} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {s.month}
                      </td>
                      <td className="px-4 py-3 text-right">{s.totalRevenue.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-right text-amber-600">{s.totalFee.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{s.totalNet.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Badge className="bg-green-100 text-green-700 text-xs">{s.settledCount}완료</Badge>
                          {s.pendingCount > 0 && (
                            <Badge className="bg-yellow-100 text-yellow-700 text-xs">{s.pendingCount}대기</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="sm" className="text-gray-500">
                          <Download className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
