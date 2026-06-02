/**
 * 광장 프로필 도메인 타입.
 *
 * DB: profiles + plaza_profiles + profile_highlights + follows + reviews 등.
 * 광장 web 의 components/profile/* 와 동일 구조.
 */

import type { AccountType } from "./chat"

/** 8개 계정 타입 (chat 의 AccountType 재사용 + extra) */
export type ProfileAccountType = AccountType

/** 플랫폼 역할 — admin/superadmin 표시용 */
export type ProfileRole = "user" | "admin" | "superadmin"

/** profiles 테이블 행 (메인 프로필) */
export interface ProfileRow {
  id: string
  nickname: string | null
  full_name?: string | null
  email?: string | null
  phone: string | null
  avatar_url: string | null
  cover_url: string | null
  bio: string | null
  location: string | null
  /** 가입 시 선택한 시/군 (춘천 / 홍천 / 인제 등) — 일반 사용자 location 대체용 */
  sub_region?: string | null
  website: string | null
  kakao_id: string | null
  account_type: ProfileAccountType | null
  role: ProfileRole | null
  trust_score: number | null
  review_count: number | null
  posts_public: boolean | null
  created_at: string
  updated_at?: string
}

/** ProfileCard 표시 데이터 (UI 변환된 형태) */
export interface ProfileCardData {
  id: string
  nickname: string | null
  avatar_url: string | null
  cover_url?: string | null
  bio: string | null
  location: string | null
  role?: ProfileRole | null
  account_type?: ProfileAccountType | null
  postsCount: number
  followersCount: number
  followingCount: number
  trustScore?: number | null
  reviewCount?: number | null
}

/** 사이드바 데이터 (bio/연락처/영업시간 등) */
export interface ProfileSidebarData {
  bio: string | null
  location: string | null
  website: string | null
  kakao_id: string | null
  phone: string | null
  business_hours?: string | null
}

/** 통합 게시물 아이템 (내 글 탭) — 여러 테이블 합쳐서 한 줄씩 표시 */
export interface UnifiedPost {
  id: string
  /** post 의 source 종류 (board/sharing/group_buying/...) */
  kind: string
  /** 한국어 라벨 (게시판/나눔/공구) */
  kindLabel: string
  title: string
  excerpt: string | null
  created_at: string
  /** 클릭 시 이동할 path */
  href: string
  image?: string | null
  /** 광장 ID — 통합 목록에서 뱃지 표시용 */
  plaza_id?: string | null
}

/** 찜 탭 통합 아이템 */
export interface SavedItem {
  id: string
  /** 출처 카테고리 (property/board/sharing/club/new_store/...) */
  kind: string
  kindLabel: string
  title: string
  href: string
  image?: string | null
  meta?: string | null
  created_at: string
  /** 광장 ID — 통합 목록에서 뱃지 표시용 */
  plaza_id?: string | null
}

/** 프로필 하이라이트 (스토리) */
export interface ProfileHighlight {
  id: string
  user_id: string
  title: string
  cover_url: string | null
  /** 미디어 종류 — image / video */
  kind: "image" | "video"
  media_url: string
  order_index: number
  created_at: string
}

/** 팔로우 관계 */
export interface FollowEntry {
  id: string
  nickname: string | null
  avatar_url: string | null
  account_type: ProfileAccountType | null
}

/** 거래 후기 */
export interface ReviewEntry {
  id: string
  reviewer_id: string
  reviewer_name: string
  response_speed: number
  accuracy: number
  kindness: number
  total_score: number
  content: string | null
  created_at: string
}

/** 포인트 거래 내역 */
export type PointHistoryType =
  | "earn"
  | "spend"
  | "revert"
  | "expire"
  | "manual_adjust"
  | "penalty"
  | "event"

export type PointHistoryStatus = "pending" | "confirmed" | "reverted"

export interface PointHistoryEntry {
  id: string
  user_id: string
  type: PointHistoryType
  amount: number
  source: string | null
  status: PointHistoryStatus
  description?: string | null
  created_at: string
}

/** 주문 (구매/판매 통합) */
export type OrderRole = "buyer" | "seller"
/**
 * 통일된 주문 상태 (local_food + group_buying 공통).
 *   pending_payment — 주문 생성됨, PG 결제 대기
 *   paid            — 결제 완료, 발송 대기
 *   shipped         — 발송됨 (운송장 입력 완료)
 *   completed       — 수령 완료 (구매자 확인 OR 발송 후 7일 자동)
 *   cancelled       — 모집 미달/판매자 취소 등
 *   refunded        — 환불 완료
 *   legacy: reserved / confirmed / received — 기존 데이터 호환용
 */
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded"
  // 레거시 호환
  | "reserved"
  | "confirmed"
  | "received"

export interface OrderEntry {
  id: string
  /** 어떤 도메인 (local_food / group_buying) */
  domain: "local_food" | "group_buying"
  status: OrderStatus
  product_name: string
  product_image?: string | null
  unit_price: number
  quantity: number
  amount: number
  receive_method?: "pickup" | "delivery"
  tracking_carrier?: string | null
  tracking_number?: string | null
  buyer_id: string
  seller_id: string
  created_at: string
}

/** AI 영상 작업 */
export interface AiVideoJob {
  id: string
  user_id: string
  property_id?: string | null
  status: "pending" | "processing" | "completed" | "failed"
  video_url?: string | null
  thumbnail_url?: string | null
  prompt?: string | null
  created_at: string
  completed_at?: string | null
}

/** 정산 계좌 */
export interface SettlementAccount {
  id: string
  user_id: string
  bank_name: string
  bank_account: string
  bank_holder: string
  business_number?: string | null
  is_verified: boolean
  created_at: string
  updated_at: string
}

/** 구독 정보 */
export interface SubscriptionInfo {
  plan_id: string | null
  plan_name: string | null
  status: "active" | "past_due" | "canceled" | "expired" | "free_period" | "pending" | null
  current_period_end: string | null
  is_early_bird: boolean
  applied_discount_pct: number
}

/** 검증 요청 종류 */
export type VerificationType =
  | "phone"
  | "business"
  | "agent"
  | "producer"
  | "service"

export interface VerificationRequest {
  id: string
  user_id: string
  type: VerificationType
  status: "pending" | "approved" | "rejected"
  metadata?: Record<string, unknown>
  documents?: string[]
  created_at: string
  reviewed_at?: string | null
}
