/**
 * @deprecated Use @gwangjang/types/chat instead.
 * These types are kept for reference only and will be removed.
 *
 * Chat 도메인 타입.
 *
 * 1:1 채팅 (chat_rooms) + 단체 채팅 (clubs / group-buying 멤버 기반).
 */

export type PostType =
  | 'property'
  | 'sharing'
  | 'new_store'
  | 'local_food'
  | 'group_buying'
  | 'interior'
  | 'moving'
  | 'cleaning'
  | 'repair'
  | 'secondhand'
  | 'jobs'
  | 'direct'
  | 'admin_notice'

export interface ChatRoom {
  id: string
  plaza_id: string
  /** buyer 가 채팅 시작 시 머물던 광장 (cross-plaza 거래 시 plaza_id 와 다름) */
  buyer_plaza_id?: string | null
  buyer_id: string
  seller_id: string
  post_type: PostType
  property_id: string  // 의미는 post_type 따라 다름 — legacy 명명
  last_message_at: string | null
  last_message_preview: string | null
  created_at: string
}

export interface Message {
  id: string
  room_id: string
  user_id: string
  content: string | null
  image_url?: string | null
  created_at: string
}

export interface PostContextDescriptor {
  href: string
  title: string
  image?: string | null
  badgeLabel?: string
  badgeTone?: 'primary' | 'amber' | 'muted'
  meta?: string
  /** 원본 글이 삭제됨 (E4 — Phase 4 미진행) */
  missing?: boolean
}
