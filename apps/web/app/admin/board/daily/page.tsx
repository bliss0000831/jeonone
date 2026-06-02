'use client'
import { Sun } from 'lucide-react'
import { AdminBoardCategoryPage } from '@/components/admin/board-category-page'

export default function DailyBoardAdminPage() {
  return (
    <AdminBoardCategoryPage
      title="일상공유"
      description="일상공유 게시글을 관리합니다"
      slug="daily"
      icon={Sun}
    />
  )
}
