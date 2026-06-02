'use client'
import { HelpCircle } from 'lucide-react'
import { AdminBoardCategoryPage } from '@/components/admin/board-category-page'

export default function QnaBoardAdminPage() {
  return (
    <AdminBoardCategoryPage
      title="질문답변"
      description="질문답변 게시글을 관리합니다"
      slug="qna"
      icon={HelpCircle}
    />
  )
}
