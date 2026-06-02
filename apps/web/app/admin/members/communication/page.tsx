'use client'

import { useState } from 'react'
import { Megaphone, Mail, Bell, ArrowRight } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import MemberMailPage from '../mail/page'
import AdminNotifyPage from '../notify/page'

const TABS = [
  {
    key: 'mail' as const,
    label: '이메일 / 쪽지',
    icon: Mail,
    description: 'Resend 이메일 또는 사이트 내 쪽지 발송',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-500',
  },
  {
    key: 'notify' as const,
    label: '푸시 / 인앱 알림',
    icon: Bell,
    description: '푸시 알림 및 인앱 알림(종 아이콘) 발송',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-500',
  },
] as const

type TabKey = typeof TABS[number]['key']

export default function MemberCommunicationPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('mail')

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="회원 커뮤니케이션"
        description="이메일·쪽지·푸시알림을 한 곳에서 관리합니다"
        icon={<Megaphone className="w-6 h-6" />}
      />

      {/* 채널 안내 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">이메일 / 쪽지</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                no-reply@gwangjang.app 이메일 또는 채팅방 쪽지
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span>Resend API 이메일</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span>관리자 채팅방 쪽지</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span>취소 가능(쪽지)</span>
          </div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">푸시 / 인앱 알림</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                FCM 푸시 + 앱 내 알림(종 아이콘) 발송
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span>Android/iOS 푸시</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span>인앱 알림함</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span>이미지 첨부</span>
          </div>
        </div>
      </div>

      {/* 탭 전환 */}
      <div className="flex gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2.5 px-5 py-3 rounded-xl border text-sm font-medium transition-all flex-1',
                isActive
                  ? `${tab.borderColor} ${tab.bgColor} ${tab.color} shadow-sm`
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="w-4.5 h-4.5" />
              <span>{tab.label}</span>
              {isActive && <ArrowRight className="w-3.5 h-3.5 ml-auto" />}
            </button>
          )
        })}
      </div>

      {/* 콘텐츠 */}
      <div className="mt-2">
        {activeTab === 'mail' ? <MemberMailPage /> : <AdminNotifyPage />}
      </div>
    </div>
  )
}
