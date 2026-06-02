'use client'
import { Home } from 'lucide-react'
import { AdminBoardCategoryPage } from '@/components/admin/board-category-page'

export default function LivingBoardAdminPage() {
  return (
    <AdminBoardCategoryPage
      title="생활정보"
      description="생활정보 게시글을 관리합니다"
      slug="living"
      icon={Home}
    />
  )
}
