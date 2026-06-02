'use client'

import { ComponentType, ReactNode } from 'react'
import { MessageCircle } from 'lucide-react'

interface Props {
  icon?: ComponentType<{ className?: string }>
  title?: string
  subtitle?: string
  action?: ReactNode
}

export function ChatEmpty({
  icon: Icon = MessageCircle,
  title = '아직 메시지가 없습니다',
  subtitle = '첫 메시지를 보내보세요!',
  action,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
      <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-primary/70" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ChatLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
