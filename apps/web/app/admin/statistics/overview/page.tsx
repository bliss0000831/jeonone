'use client'

import { useState } from 'react'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import {
  BarChart3, Users, Home, Receipt, Search, MapPin, UserCheck,
  ArrowRight,
} from 'lucide-react'
import VisitorStatsPage from '../visitors/page'
import PropertiesStatsPage from '../properties/page'
import TransactionStatsPage from '../transactions/page'
import PopularSearchAdminPage from '../popular-search/page'
import RegionStatsPage from '../regions/page'
import MemberVisitorStatsPage from '../../members/visitor-stats/page'

const TABS = [
  { key: 'visitors' as const, label: '방문자', icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/30', borderColor: 'border-blue-500', description: '일별 방문·세션·경로 분석' },
  { key: 'properties' as const, label: '매물', icon: Home, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', borderColor: 'border-emerald-500', description: '매물 현황·상태·유형별 집계' },
  { key: 'transactions' as const, label: '거래', icon: Receipt, color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-950/30', borderColor: 'border-violet-500', description: '완료 거래·금액·추이' },
  { key: 'popular-search' as const, label: '검색어', icon: Search, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-950/30', borderColor: 'border-amber-500', description: '인기 검색어·숨김 관리' },
  { key: 'regions' as const, label: '지역', icon: MapPin, color: 'text-rose-600', bgColor: 'bg-rose-50 dark:bg-rose-950/30', borderColor: 'border-rose-500', description: '지역별 매물·회원 분포' },
  { key: 'member-visits' as const, label: '회원 방문', icon: UserCheck, color: 'text-teal-600', bgColor: 'bg-teal-50 dark:bg-teal-950/30', borderColor: 'border-teal-500', description: '회원별 방문 이력' },
] as const

type TabKey = typeof TABS[number]['key']

export default function StatisticsOverviewPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('visitors')

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="통계 한눈에 보기"
        description="방문자·매물·거래·검색어·지역·회원 통계를 한 곳에서 확인합니다"
        icon={<BarChart3 className="w-6 h-6" />}
      />

      {/* 탭 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'p-3 rounded-xl border text-left transition-all',
                isActive
                  ? `${tab.borderColor} ${tab.bgColor} shadow-sm`
                  : 'border-border bg-card hover:bg-muted',
              )}
            >
              <Icon className={cn('w-5 h-5 mb-1.5', isActive ? tab.color : 'text-muted-foreground')} />
              <div className={cn('text-sm font-semibold', isActive ? tab.color : '')}>
                {tab.label}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                {tab.description}
              </div>
            </button>
          )
        })}
      </div>

      {/* 콘텐츠 */}
      <div>
        {activeTab === 'visitors' && <VisitorStatsPage />}
        {activeTab === 'properties' && <PropertiesStatsPage />}
        {activeTab === 'transactions' && <TransactionStatsPage />}
        {activeTab === 'popular-search' && <PopularSearchAdminPage />}
        {activeTab === 'regions' && <RegionStatsPage />}
        {activeTab === 'member-visits' && <MemberVisitorStatsPage />}
      </div>
    </div>
  )
}
