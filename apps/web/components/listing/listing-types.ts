/**
 * 통합 리스팅 카드 데이터 인터페이스.
 *
 * 중고거래 / 나눔 / 구인구직 / 모임 / 신장개업 / 게시판 등
 * 다양한 카테고리가 같은 카드 디자인을 쓸 수 있도록 표준화.
 */
import type { ReactNode } from 'react'

export type BadgeTone = 'gray' | 'red' | 'amber' | 'sky' | 'emerald' | 'violet'

export interface ListingItem {
  /** 상세 페이지 링크 */
  href: string

  /** 대표 이미지 URL (없으면 placeholder) */
  imageUrl?: string | null

  /** 카드 제목 (필수) */
  title: string

  /** 가격/임금/회비 등 (예: "70,000원", "월급 500만원", "무료") */
  price?: string | null

  /** 우측 상단 뱃지 (예: "예약중", "마감", "모집중") */
  badge?: { text: string; tone: BadgeTone } | null

  /** 메타 라인 — 동네 / 시간 / 거리 등 (예: "퇴계동 · 33분 전") */
  meta?: string | null

  /** 두 번째 메타 라인 — 카테고리 / 기타 정보 (선택) */
  meta2?: string | null

  /** 우측 하단 작은 통계 (예: 조회수, 좋아요, 댓글) */
  stats?: ReactNode

  /** 좌측 상단 오버레이 카테고리 칩 (선택) */
  categoryChip?: string | null

  /** 우측 상단 ⋮ 더보기 메뉴 (선택) — 수정/삭제/신고 등 */
  moreMenu?: ReactNode
}

export interface ListingFilterGroup {
  /** 필터 키 (예: "category") */
  key: string
  /** 그룹 라벨 (예: "카테고리") */
  label: string
  /** 라디오 옵션들 */
  options: Array<{ value: string; label: string; count?: number }>
}
