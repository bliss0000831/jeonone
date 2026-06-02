'use client'

/**
 * 취소/환불 관리 페이지.
 * 환불 요청 접수, 사유 확인, 승인/반려 처리.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RotateCcw, CheckCircle, XCircle, Clock } from 'lucide-react'

interface RefundRequest {
  id: string
  order_id: string
  user_id: string
  amount: number
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  processed_at: string | null
}

const STATUS_MAP = {
  pending:  { label: '대기', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: '승인', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700', icon: XCircle },
}

export default function BillingRefundsPage() {
  const [loading, setLoading] = useState(true)
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadRefunds = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await (supabase as any)
        .from('refund_requests')
        .select('*')
        .eq('plaza_id', plaza)
        .order('created_at', { ascending: false })
        .limit(50)
      setRefunds((data as RefundRequest[]) || [])
    } catch (e) {
      console.error('Failed to load refunds:', e)
    } finally {
      setLoading(false)
    }
  }, [plaza])

  useEffect(() => { loadRefunds() }, [loadRefunds])

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
          <h1 className="text-2xl font-bold">취소/환불 관리</h1>
          <p className="text-muted-foreground mt-1">환불 요청 접수, 사유 확인, 승인/반려 처리</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadRefunds}>
          <RotateCcw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">대기 중</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {refunds.filter(r => r.status === 'pending').length}건
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">이번 달 승인</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {refunds.filter(r => r.status === 'approved').length}건
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">이번 달 반려</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {refunds.filter(r => r.status === 'rejected').length}건
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 목록 */}
      <Card>
        <CardContent className="p-0">
          {refunds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <RotateCcw className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">환불 요청이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y">
              {refunds.map((r) => {
                const s = STATUS_MAP[r.status]
                const Icon = s.icon
                return (
                  <div key={r.id} className="flex items-center justify-between p-4 hover:bg-accent/50">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">주문 #{r.order_id}</div>
                      <div className="text-xs text-muted-foreground">{r.reason}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString('ko-KR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {r.amount.toLocaleString()}원
                      </span>
                      <Badge variant="secondary" className={s.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {s.label}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
