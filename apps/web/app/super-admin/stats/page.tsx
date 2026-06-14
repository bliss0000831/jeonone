'use client'

/**
 * 슈퍼관리자 — 전체 플랫폼 통계.
 * 지역간 비교 분석, 전체 성장 추이.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  BarChart3,
  Users,
  Building2,
  TrendingUp,
  RotateCcw,
  FileText,
} from 'lucide-react'

interface PlazaStat {
  plaza_id: string
  plaza_name: string
  memberCount: number
  postCount: number
  propertyCount: number
}

export default function SuperAdminStatsPage() {
  const [loading, setLoading] = useState(true)
  const [plazaStats, setPlazaStats] = useState<PlazaStat[]>([])
  const [totalMembers, setTotalMembers] = useState(0)
  const [totalPosts, setTotalPosts] = useState(0)
  const [totalProperties, setTotalProperties] = useState(0)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: plazas } = await supabase
        .from('plazas')
        .select('id, name')
        .order('name')

      if (!plazas) {
        setPlazaStats([])
        setLoading(false)
        return
      }

      // 각 지역별 간단 통계 — 모든 지역을 Promise.all 로 병렬 처리 (N+1 → 1+3N 병렬)
      const statsPromises = plazas.map(async (p: any) => {
        const [{ count: memberCount }, { count: postCount }, { count: propCount }] = await Promise.all([
          supabase.from('plaza_profiles').select('user_id', { count: 'exact', head: true }).eq('plaza_id', p.id),
          supabase.from('board_posts').select('id', { count: 'exact', head: true }).eq('plaza_id', p.id),
          supabase.from('properties').select('id', { count: 'exact', head: true }).eq('plaza_id', p.id),
        ])
        return {
          plaza_id: p.id,
          plaza_name: p.name,
          memberCount: memberCount || 0,
          postCount: postCount || 0,
          propertyCount: propCount || 0,
        } as PlazaStat
      })

      const stats = await Promise.all(statsPromises)
      let tMembers = 0
      let tPosts = 0
      let tProps = 0
      for (const s of stats) {
        tMembers += s.memberCount
        tPosts += s.postCount
        tProps += s.propertyCount
      }

      setPlazaStats(stats)
      setTotalMembers(tMembers)
      setTotalPosts(tPosts)
      setTotalProperties(tProps)
    } catch (e) {
      console.error('Failed to load stats:', e)
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">전체 플랫폼 통계</h1>
          <p className="text-gray-500 mt-1">지역간 비교 분석 및 성장 추이</p>
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
              <Building2 className="w-4 h-4" /> 지역 수
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plazaStats.length}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Users className="w-4 h-4" /> 전체 회원
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMembers.toLocaleString()}명</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <FileText className="w-4 h-4" /> 전체 게시물
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPosts.toLocaleString()}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> 전체 매물
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProperties.toLocaleString()}개</div>
          </CardContent>
        </Card>
      </div>

      {/* 지역별 비교 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            지역별 비교
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plazaStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Building2 className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">등록된 지역이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-4">
              {plazaStats
                .sort((a, b) => b.memberCount - a.memberCount)
                .map((s) => {
                  const maxMembers = Math.max(...plazaStats.map(x => x.memberCount), 1)
                  const pct = (s.memberCount / maxMembers) * 100
                  return (
                    <div key={s.plaza_id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{s.plaza_name}</span>
                        <span className="text-gray-500">
                          회원 {s.memberCount.toLocaleString()} · 게시물 {s.postCount.toLocaleString()} · 매물 {s.propertyCount.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
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
