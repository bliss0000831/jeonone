/**
 * 광장 채팅 도메인 타입.
 *
 * DB 스키마 기준 (apps/web/scripts/001_create_tables.sql + 후속 ALTER):
 *   - chat_rooms (1:1 직접 채팅방 — buyer/seller + 최대 expert 1명)
 *   - messages (메시지)
 *   - expert_invitations (전문가 초대)
 *
 * 모임 채팅 (club_chat_messages) / 공동구매 채팅 (group_buying_chat_messages)
 * 은 Phase 2B-2/3 에서 추가.
 */

/** 채팅방의 게시글 타입 */
export type ChatPostType =
  | "direct"
  | "sharing"
  | "local_food"
  | "secondhand"
  | "jobs"
  | "admin_notice"

/** 1:1 채팅방 — chat_rooms 테이블 행 */
export interface ChatRoom {
  id: string
  property_id: string | null // post_id 포괄명 (Direct 시 null)
  buyer_id: string
  seller_id: string
  post_type: ChatPostType
  /** seller 광장 (= post.plaza_id, 정산/anchor) */
  plaza_id: string
  /** buyer 가 채팅 시작 시 머물던 광장 (cross-plaza 거래 시 plaza_id 와 다름) */
  buyer_plaza_id?: string | null
  created_at: string
  updated_at: string
  /** 채팅방 목록 표시용 (서버 측 join 으로 첨부) */
  last_message?: string | null
  last_message_at?: string | null
}

/** 메시지 — messages 테이블 행 */
export interface Message {
  id: string
  chat_room_id: string
  sender_id: string
  content: string
  image_url?: string | null
  is_read: boolean
  is_system?: boolean // 시스템 메시지 (전문가 참여 등)
  plaza_id: string
  created_at: string
}

/** 채팅 참가자 (UI 표시용 — profiles + 역할) */
export interface ChatParticipant {
  id: string
  nickname: string | null
  full_name: string | null
  avatar_url: string | null
  account_type: AccountType | null
  phone: string | null
  /** 채팅방 내 역할 */
  role: "buyer" | "seller" | "expert"
  /** 이 참가자의 표시 광장 — navigation 시 ?plaza= 에 사용 */
  plaza_id?: string | null
}

/** 계정 타입 — profiles.account_type */
export type AccountType =
  | "individual"
  | "business" // 사업자
  | "producer" // 로컬푸드 생산자

/** 전문가 (검색/초대 표시용) */
export interface Expert {
  id: string
  nickname: string | null
  full_name: string | null
  avatar_url: string | null
  account_type: AccountType
  location: string | null
  trust_score: number | null
  review_count: number | null
}

/** 전문가 초대 — expert_invitations 테이블 행 */
export interface ExpertInvitation {
  id: string
  chat_room_id: string
  inviter_id: string
  expert_id: string
  property_id: string | null
  message: string | null
  status: "pending" | "accepted" | "rejected" | "cancelled"
  created_at: string
  responded_at: string | null
}

/** 전문가 초대 생성 요청 (POST /api/expert-invitations 의 body) */
export interface InviteExpertInput {
  chatRoomId: string
  expertId: string
  propertyId?: string | null
  message?: string
}

/** Context Card 표시 데이터 (post_type 별 매물/게시글 정보) */
export interface ChatContextDescriptor {
  /** 카드 클릭 시 이동할 path (예: "/property/abc123") */
  href: string
  /** 표시 이미지 */
  image?: string | null
  /** 제목 */
  title: string
  /** 부제 — 위치/카테고리 등 */
  subtitle?: string | null
  /** 메타 — 가격 등 */
  meta?: string | null
  /** 상태 뱃지 (예: "판매중", "예약중", "거래완료") */
  badgeLabel?: string | null
  /** 뱃지 톤 */
  badgeTone?: "primary" | "amber" | "emerald" | "muted" | "rose"
  /** 원본 데이터 삭제됨 시 fallback */
  missing?: boolean
}

/** 채팅방 목록 표시용 — ChatRoom + 미리보기 메타 */
export interface ChatRoomWithMeta extends ChatRoom {
  otherUser: ChatParticipant
  unreadCount: number
  context?: ChatContextDescriptor | null
  /** 참여자 총 수 (buyer + seller + 수락된 전문가). 3 이상이면 다인 채팅 카드 */
  participantsCount?: number
  /** 참여자 아바타 URL 목록 — 다인 채팅 시 최대 2개 표시용 */
  participantAvatars?: string[]
}

/** 모임 채팅방 — my_club_chat_rooms 뷰 행 */
export interface ClubChatRoom {
  club_id: string
  title: string
  images: string[] | null
  sport_type: string
  status: string
  max_members: number
  current_members: number
  user_id: string
  joined_at: string
  last_read_at: string
  last_message: string | null
  last_message_at: string | null
  unread_count: number
}

/** 공동구매 채팅방 — my_group_buying_chat_rooms 뷰 행 */
export interface GbChatRoom {
  post_id: string
  title: string
  product_name: string | null
  images: string[] | null
  status: string
  group_price: number | null
  max_participants: number | null
  current_participants: number
  owner_id: string
  user_id: string
  payment_status: string | null
  quantity: number | null
  last_read_at: string
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  /** 공구 글이 등록된 광장 (seller plaza) — cross-plaza national 글의 경우 본인 광장과 다를 수 있음 */
  plaza_id?: string | null
  /** 참여자(buyer) 가 채팅 시작 시 머물고 있던 광장 */
  buyer_plaza_id?: string | null
  /** 공구 글 visibility — "national" 이면 cross-plaza 노출 */
  visibility?: string | null
}

/** 채팅 신고 사유 */
export type ChatReportReason =
  | "스팸/광고"
  | "욕설/비방"
  | "음란/선정성"
  | "사기/허위 정보"
  | "기타"
