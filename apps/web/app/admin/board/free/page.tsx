'use client'
import { MessageSquare } from 'lucide-react'
import { AdminBoardCategoryPage } from '@/components/admin/board-category-page'

export default function FreeBoardAdminPage() {
  return (
    <AdminBoardCategoryPage
      title="자유게시판"
      description="자유게시판 게시글을 관리합니다"
      slug="free"
      icon={MessageSquare}
    />
  )
}
