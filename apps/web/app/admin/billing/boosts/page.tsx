'use client'

/**
 * 부스트/구독 관리 페이지.
 * 프리미엄 노출 구매 내역, 구독 현황.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Rocket, Crown, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'boosts' | 'subscriptions'

interface BoostOrder {
  id: string
  user_id: string
  target_type: string
  target_id: string
  tier: string
  amount: number
  starts_at: string
  ends_at: string
  status: string
  created_at: string
}

interface Subscription {
  id: string
  user_id: string
  plan_id: string
  status: string
  current_period_end: string
  is_early_bird: boolean
  applied_discount_pct: number
  created_at: string
}

export default function BillingBoostsPage() {
  const [tab, setTab] = useState<Tab>('boosts')
  const [loading, setLoading] = useState(true)
  const [boosts, setBoosts] = useState<BoostOrder[]>([])
  const [subs, setSubs] = useState<Subscription[]>([])
  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadData = useCallback(async () => {
    if (!plaza) return
    setLoading(true)
    try {
      const [{ data: boostData }, { data: subData }] = await Promise.all([
        supabase
          .from('boost_orders')
          .select('*')
          .eq('plaza_id', plaza)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('subscriptions')
          .select('*')
          .eq('plaza_id', plaza)
          .order('created_at', { ascending: false })
          .limit(50),
      ])
      setBoosts((boostData as BoostOrder[]) || [])
      setSubs((subData as Subscription[]) || [])
    } catch (e) {
      console.error('Failed to load boost/sub data:', e)
    } finally {
      setLoading(false)
    }
  }, [plaza])

  useEffect(() => { loadData() }, [loadData])

  const activeBoosts = boosts.filter(b => b.status === 'active').length
  const activeSubs = subs.filter(s => s.status === 'active').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">부스트/구독</h1>
          <p className="text-muted-foreground mt-1">프리미엄 노출 구매 및 구독 현황</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RotateCcw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Rocket className="w-4 h-4" /> 활성 부스트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeBoosts}건</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Crown className="w-4 h-4" /> 활성 구독
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSubs}건</div>
          </CardContent>
        </Card>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab('boosts')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'boosts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          부스트 ({boosts.length})
        </button>
        <button
          onClick={() => setTab('subscriptions')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'subscriptions'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          구독 ({subs.length})
        </button>
      </div>

      {/* 데이터 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : tab === 'boosts' ? (
            boosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Rocket className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">부스트 내역이 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">대상</th>
                      <th className="text-left px-4 py-3 font-medium">티어</th>
                      <th className="text-right px-4 py-3 font-medium">금액</th>
                      <th className="text-left px-4 py-3 font-medium">기간</th>
                      <th className="text-center px-4 py-3 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {boosts.map((b) => (
                      <tr key={b.id} className="hover:bg-accent/50">
                        <td className="px-4 py-3 text-xs">{b.target_type} #{b.target_id.slice(0, 8)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{b.tier}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{b.amount.toLocaleString()}원</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(b.starts_at).toLocaleDateString('ko-KR')} ~{' '}
                          {new Date(b.ends_at).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant="secondary"
                            className={
                              b.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }
                          >
                            {b.status === 'active' ? '활성' : b.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : subs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Crown className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">구독 내역이 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">사용자</th>
                    <th className="text-left px-4 py-3 font-medium">플랜</th>
                    <th className="text-left px-4 py-3 font-medium">만료일</th>
                    <th className="text-center px-4 py-3 font-medium">얼리버드</th>
                    <th className="text-center px-4 py-3 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {subs.map((s) => (
                    <tr key={s.id} className="hover:bg-accent/50">
                      <td className="px-4 py-3 text-xs">{s.user_id.slice(0, 8)}...</td>
                      <td className="px-4 py-3">{s.plan_id}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(s.current_period_end).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.is_early_bird ? (
                          <Badge className="bg-amber-100 text-amber-700">얼리버드</Badge>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="secondary"
                          className={
                            s.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }
                        >
                          {s.status === 'active' ? '활성' : s.status}
                        </Badge>
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
