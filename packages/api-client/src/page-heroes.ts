/**
 * 게시판별 히어로(상단 배너) 메타 정보.
 * - key: DB `page_heroes.page_key` 와 각 페이지 `<PageHero pageKey="..." />` 에서 사용
 * - defaultImage: DB 에 저장된 값이 없을 때 쓰는 폴백 (public/banners 아래 파일)
 * - label: 관리자 페이지에 표시되는 한글 이름
 */
export interface PageHeroDef {
  key: string
  label: string
  defaultImage: string
  path: string
}

export const PAGE_HERO_DEFS: PageHeroDef[] = [
  { key: "board",         label: "소식통",         defaultImage: "/banners/board-banner.jpg",        path: "/board" },
  { key: "secondhand",    label: "농기구/자재",     defaultImage: "/banners/secondhand-banner.jpg",   path: "/secondhand" },
  { key: "sharing",       label: "나눔",           defaultImage: "/banners/sharing-banner.jpg",      path: "/sharing" },
  { key: "jobs",          label: "일손",           defaultImage: "/banners/jobs-banner.jpg",         path: "/jobs" },
  { key: "clubs",         label: "동네 모임",      defaultImage: "/banners/clubs-banner.jpg",        path: "/clubs" },
  { key: "group-buying",  label: "공동구매",       defaultImage: "/banners/group-buying-banner.jpg", path: "/group-buying" },
  { key: "local-food",    label: "로컬푸드",       defaultImage: "/banners/local-food-banner.jpg",   path: "/local-food" },
  { key: "new-store",     label: "신장개업",       defaultImage: "/banners/new-store-banner.jpg",    path: "/new-store" },
  { key: "properties",    label: "부동산",         defaultImage: "/banners/properties-banner.jpg",   path: "/properties" },
  { key: "requests",      label: "구해주세요",     defaultImage: "/banners/requests-banner.jpg",     path: "/requests" },
  { key: "interior",      label: "인테리어",       defaultImage: "/banners/interior-banner.jpg",     path: "/interior" },
  { key: "moving",        label: "이사",           defaultImage: "/banners/moving-banner.jpg",       path: "/moving" },
  { key: "repair",        label: "수리",           defaultImage: "/banners/repair-banner.jpg",       path: "/repair" },
  { key: "cleaning",      label: "청소",           defaultImage: "/banners/cleaning-banner.jpg",     path: "/cleaning" },
]

