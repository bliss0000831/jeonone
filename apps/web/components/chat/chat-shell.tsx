'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  /** ChatHeader 컴포넌트 */
  header: ReactNode
  /** 게시물 컨텍스트 카드 (부동산/모임/공동구매 등 모든 채팅방 상단에 표시) */
  contextCard?: ReactNode
  /** ParticipantStrip (선택) */
  participants?: ReactNode
  /** 상태바 / 스텝바 등 추가 고정 영역 (선택) */
  statusBar?: ReactNode
  /** 메시지 리스트 컨테이너 자식 */
  children: ReactNode
  /** ChatComposer */
  composer: ReactNode
  /** 모달/오버레이 슬롯 */
  overlays?: ReactNode
  className?: string
}

/** 모든 채팅 페이지의 공용 레이아웃 스켈레톤 */
export function ChatShell({
  header,
  contextCard,
  participants,
  statusBar,
  children,
  composer,
  overlays,
  className,
}: Props) {
  return (
    <div className="h-screen bg-background flex justify-center">
      <div
        className={cn(
          'flex flex-col h-full w-full max-w-2xl bg-background border-x border-border/60',
          className,
        )}
      >
        {header}
        {contextCard}
        {participants}
        {statusBar}
        <main
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          style={{ backgroundColor: 'var(--chat-canvas)' }}
        >
          {children}
        </main>
        {composer}
      </div>
      {overlays}
    </div>
  )
}
