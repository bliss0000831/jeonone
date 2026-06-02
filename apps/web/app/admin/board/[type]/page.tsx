'use client'

/**
 * 게시판 관리 — 동적 라우트 (5개 일반 게시판 통합).
 *
 * 기존엔 free / qna / daily / living / restaurant 5개 폴더가 각각 14줄짜리
 * thin wrapper 로 같은 AdminBoardCategoryPage 를 호출하고 있었음. 새 게시판이
 * 늘어날 때마다 폴더 + page.tsx 한 쌍을 더 만들어야 했는데, 이 동적 라우트가
 * 그 보일러플레이트를 제거함.
 *
 * 주의 — 통합 대상이 아닌 게시판:
 *   - notice, inquiry, faq: 자체 UI (공지 작성 폼·문의 답변·FAQ CRUD) 라
 *     같은 추상화에 안 맞음. 통합하지 않고 기존 폴더 그대로 유지.
 *
 * 기존 /admin/board/free, /admin/board/qna 등 URL 은 그대로 유지됨 (각자
 * page.tsx 가 별도로 존재). 이 동적 라우트는 새 slug 가 추가될 때나, 사이드바
 * 가 동적으로 라우팅하고 싶을 때 fallback 으로 쓸 수 있도록 추가만 함.
 * Next.js 라우팅 우선순위: static segment 가 dynamic 보다 우선이므로 충돌 없음.
 */

import { MessageSquare, HelpCircle, Sun, Home, Utensils, FileText } from 'lucide-react'
import { useParams, notFound } from 'next/navigation'
import { AdminBoardCategoryPage } from '@/components/admin/board-category-page'

type BoardSlug = 'free' | 'qna' | 'daily' | 'living' | 'restaurant'

const META: Record<BoardSlug, {
  title: string
  description: string
  icon: typeof MessageSquare
}> = {
  free:       { title: '자유게시판', description: '자유게시판 게시글을 관리합니다',   icon: MessageSquare },
  qna:        { title: '질문답변',   description: '질문답변 게시글을 관리합니다',     icon: HelpCircle },
  daily:      { title: '일상공유',   description: '일상공유 게시글을 관리합니다',     icon: Sun },
  living:     { title: '생활정보',   description: '생활정보 게시글을 관리합니다',     icon: Home },
  restaurant: { title: '맛집추천',   description: '맛집추천 게시글을 관리합니다',     icon: Utensils },
}

export default function BoardTypeAdminPage() {
  const params = useParams<{ type: string }>()
  const type = params?.type as BoardSlug | undefined
  // notice/inquiry/faq 는 별도 static route 가 처리하므로 여기 들어올 일이 없으나
  // 누군가 직접 URL 로 접근하거나 신규 slug 가 META 에 없으면 404.
  if (!type || !(type in META)) {
    notFound()
  }
  const meta = META[type as BoardSlug]
  // fallback icon (META 키가 모두 채워져 있으나 TS 안전망).
  const Icon = meta.icon ?? FileText
  return (
    <AdminBoardCategoryPage
      title={meta.title}
      description={meta.description}
      slug={type as BoardSlug}
      icon={Icon}
    />
  )
}
