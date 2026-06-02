import { redirect } from 'next/navigation'

// /admin/service → 기본 탭(인테리어)으로 리다이렉트.
// 사이드바는 1개 엔트리만 두고 페이지 내부 탭으로 4개 서비스 전환.
export default function ServiceIndexPage() {
  redirect('/admin/service/interior')
}
