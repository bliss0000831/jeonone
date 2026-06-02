/**
 * Group Buying 도메인 타입.
 */

export type GroupBuyingStatus =
  | 'recruiting'
  | 'full'
  | 'pending_payment'
  | 'group_confirmed'
  | 'cancelled'
  | 'completed'

export type DeliveryMode = 'pickup' | 'delivery' | 'both'

export type Visibility = 'plaza' | 'national'

export interface GroupBuyingPost {
  id: string
  user_id: string
  plaza_id: string
  title: string
  description: string | null
  images: string[] | null
  original_price: number
  group_price: number
  max_participants: number | null
  current_participants: number
  deadline: string | null
  status: GroupBuyingStatus
  payment_required: boolean
  delivery_mode: DeliveryMode
  visibility: Visibility
  category: string | null
  created_at: string
  updated_at: string
}

export interface GroupBuyingParticipant {
  post_id: string
  user_id: string
  quantity: number
  receive_method: 'pickup' | 'delivery'
  recipient_name?: string | null
  recipient_phone?: string | null
  recipient_address?: string | null
  recipient_address_detail?: string | null
  payment_status: 'reserved' | 'paid' | 'refunded'
  joined_at: string
}

export interface GroupBuyingOrder {
  id: string
  post_id: string
  buyer_id: string
  seller_id: string
  plaza_id: string
  status: string
  unit_price: number
  quantity: number
  amount: number
  fee_amount: number
  points_used: number
  points_tx_id: string | null
  receive_method: 'pickup' | 'delivery'
  delivery_addr: any
  pg_provider: 'mock' | 'portone'
  pg_payment_id: string | null
  pg_merchant_uid: string
  idempotency_key: string | null
  created_at: string
}

export interface JoinInput {
  quantity: number
  receive_method: 'pickup' | 'delivery'
  recipient_name?: string | null
  recipient_phone?: string | null
  recipient_address?: string | null
  recipient_address_detail?: string | null
}
