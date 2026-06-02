'use client'
import { Utensils } from 'lucide-react'
import { AdminBoardCategoryPage } from '@/components/admin/board-category-page'

export default function RestaurantBoardAdminPage() {
  return (
    <AdminBoardCategoryPage
      title="맛집추천"
      description="맛집추천 게시글을 관리합니다"
      slug="restaurant"
      icon={Utensils}
    />
  )
}
