import { redirect } from 'next/navigation'

// /admin/community → 기본 탭(나눔)으로 리다이렉트.
// 사이드바는 1개 엔트리만 두고 페이지 내부 탭으로 5개 타입 전환.
export default function CommunityIndexPage() {
  redirect('/admin/community/sharing')
}
