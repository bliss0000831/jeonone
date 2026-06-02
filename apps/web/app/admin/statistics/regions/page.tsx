'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import {
  MapPin, Loader2, Home, Users, TrendingUp,
  Building2, BarChart3,
} from 'lucide-react'

interface Property {
  id: string
  address: string | null
  price: number | null
  created_at: string
}

interface Profile {
  id: string
  location: string | null
}

interface RegionData {
  name: string
  count: number
  avgPrice: number
  lastCreated: string
}

interface MemberRegion {
  location: string
  count: number
}

export default function RegionStatsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [propRows, setPropRows] = useState<RegionData[]>([])
  const [memberRows, setMemberRows] = useState<MemberRegion[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const plaza = getCurrentPlazaClient()

      // properties — district 컬럼이 없으므로 address에서 파싱
      let propQ: any = supabase
        .from('properties')
        .select('id, address, price, created_at')
        .limit(10000)
      if (plaza) propQ = propQ.eq('plaza_id', plaza)

      const propRes = await propQ
      if (propRes.error) console.error('properties error:', propRes.error.message)

      const props = (propRes.data as Property[]) || []
      const districtMap = new Map<string, { count: number; priceSum: number; lastCreated: string }>()
      props.forEach((p) => {
        const d = p.address ? p.address.split(' ').slice(0, 2).join(' ') : '기타'
        const cur = districtMap.get(d) || { count: 0, priceSum: 0, lastCreated: '' }
        cur.count += 1
        cur.priceSum += p.price || 0
        if (!cur.lastCreated || p.created_at > cur.lastCreated) cur.lastCreated = p.created_at
        districtMap.set(d, cur)
      })
      setPropRows(
        Array.from(districtMap.entries())
          .map(([name, v]) => ({
            name,
            count: v.count,
            avgPrice: v.count ? Math.round(v.priceSum / v.count) : 0,
            lastCreated: v.lastCreated?.slice(0, 10) || '-',
          }))
          .sort((a, b) => b.count - a.count)
      )

      // 회원 지역 — plaza일 때 plaza_profiles에서 user_id 목록 → profiles에서 location 조회
      let profs: Profile[] = []
      if (plaza) {
        const ppRes = await supabase
          .from('plaza_profiles')
          .select('user_id')
          .eq('plaza_id', plaza)
          .limit(10000)
        const userIds = ((ppRes.data || []) as any[]).map((r: any) => r.user_id).filter(Boolean)
        if (userIds.length > 0) {
          const profRes = await supabase
            .from('profiles')
            .select('id, location')
            .in('id', userIds)
          profs = (profRes.data as Profile[]) || []
        }
      } else {
        const profRes = await supabase.from('profiles').select('id, location').limit(10000)
        profs = (profRes.data as Profile[]) || []
      }
      const locMap = new Map<string, number>()
      profs.forEach((p) => {
        const l = p.location || '(미지정)'
        locMap.set(l, (locMap.get(l) || 0) + 1)
      })
      setMemberRows(
        Array.from(locMap.entries())
          .map(([location, count]) => ({ location, count }))
          .sort((a, b) => b.count - a.count)
      )
      setLoading(false)
    }
    load()
  }, [])

  const stats = useMemo(() => {
    const totalProperties = propRows.reduce((s, r) => s + r.count, 0)
    const totalMembers = memberRows.reduce((s, r) => s + r.count, 0)
    const topRegion = propRows.length > 0 ? propRows[0] : null
    const regionCount = propRows.length
    return { totalProperties, totalMembers, topRegion, regionCount }
  }, [propRows, memberRows])

  const maxPropCount = Math.max(1, ...propRows.map(r => r.count))
  const maxMemberCount = Math.max(1, ...memberRows.map(r => r.count))

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">지역별 데이터를 분석하는 중...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="지역별 통계"
        description="매물과 회원의 지역 분포를 분석합니다"
        icon={<MapPin className="w-6 h-6" />}
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.regionCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">지역 수</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Home className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.totalProperties}</div>
          <div className="text-xs text-muted-foreground mt-0.5">전체 매물</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-violet-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-violet-600">{stats.totalMembers}</div>
          <div className="text-xs text-muted-foreground mt-0.5">전체 회원</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-lg font-bold truncate">{stats.topRegion?.name || '-'}</div>
          <div className="text-xs text-muted-foreground mt-0.5">매물 최다 지역 ({stats.topRegion?.count || 0}건)</div>
        </div>
      </div>

      {/* 지역별 매물 현황 */}
      <div className="p-5 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          지역별 매물 현황
        </h3>
        {propRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">매물 데이터가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {propRows.map((row, i) => (
              <div key={row.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0",
                  i < 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {i + 1}
                </span>
                <span className="text-sm font-medium w-32 truncate shrink-0">{row.name}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/60 rounded-full"
                    style={{ width: `${(row.count / maxPropCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold w-10 text-right shrink-0">{row.count}</span>
                <span className="text-[11px] text-muted-foreground w-24 text-right shrink-0 hidden md:block">
                  평균 {row.avgPrice.toLocaleString()}원
                </span>
                <span className="text-[11px] text-muted-foreground w-20 text-right shrink-0 hidden lg:block">
                  {row.lastCreated}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 회원 거주 지역 분포 */}
      <div className="p-5 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" />
          회원 거주 지역 분포
        </h3>
        {memberRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">회원 데이터가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {memberRows.map((row, i) => (
              <div key={row.location} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0",
                  i < 3 ? "bg-violet-100 text-violet-600 dark:bg-violet-950/50" : "bg-muted text-muted-foreground"
                )}>
                  {i + 1}
                </span>
                <span className="text-sm font-medium w-32 truncate shrink-0">{row.location}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500/60 rounded-full"
                    style={{ width: `${(row.count / maxMemberCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold w-10 text-right shrink-0">{row.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
