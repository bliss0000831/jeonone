/**
 * 로컬푸드 주문 — 공통 타입/유틸
 *
 * 결제 시스템 자리만 잡아두고 현재는 mock 으로 흐름 검증.
 * PortOne 도입 시 lib/payments/portone.ts 만 추가하면 됨.
 */

export type LocalFoodOrderStatus =
  | "pending"            // 결제 대기 (생성됨)
  | "paid"               // 결제 완료 (에스크로 보관)
  | "shipped"            // 발송됨 (운송장 등록)
  | "delivered"          // 배송완료 (택배사 API 추후)
  | "confirmed"          // 구매확정 → 정산 트리거
  | "completed"          // 수령확정 (자동완료 cron·모바일 수령) — confirmed 와 동일 종료상태
  | "refund_requested"   // 환불요청 (구매자)
  | "refunded"           // 환불완료
  | "cancelled"          // 취소됨 (결제 전)
  | "settled"            // 정산완료

export const STATUS_LABELS: Record<LocalFoodOrderStatus, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  shipped: "배송 중",
  delivered: "배송 완료",
  confirmed: "구매 확정",
  completed: "수령 완료",
  refund_requested: "환불 요청",
  refunded: "환불 완료",
  cancelled: "주문 취소",
  settled: "정산 완료",
}

export const STATUS_TONES: Record<LocalFoodOrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  paid: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  shipped: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  delivered: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  refund_requested: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  refunded: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  settled: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
}

export interface DeliveryAddress {
  recipient_name: string
  phone: string
  postcode: string
  addr1: string
  addr2: string
}

export interface LocalFoodOrder {
  id: string
  buyer_id: string
  seller_id: string
  plaza_id: string
  status: LocalFoodOrderStatus
  amount: number
  fee_amount: number
  settlement_amount: number
  delivery_addr: DeliveryAddress
  buyer_memo: string | null
  seller_memo: string | null
  tracking_company: string | null
  tracking_number: string | null
  pg_provider: string
  pg_payment_id: string | null
  pg_merchant_uid: string
  paid_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  confirmed_at: string | null
  refund_requested_at: string | null
  refunded_at: string | null
  cancelled_at: string | null
  settled_at: string | null
  created_at: string
  updated_at: string
}

export interface LocalFoodOrderItem {
  id: string
  order_id: string
  local_food_id: string
  title: string
  unit: string | null
  unit_price: number
  quantity: number
  subtotal: number
  thumbnail_url: string | null
  created_at: string
}

/** 가맹점 주문번호 — PortOne merchant_uid 규약 (영숫자, 하이픈 OK) */
export function generateMerchantUid(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `lfo-${ts}-${rand}`
}

/**
 * 플랫폼 수수료 계산.
 * 초기 정책: 5% (소수점 절상 — 가맹점 부담분)
 * 0원/무료 나눔 글에는 적용 안 함 (그러나 결제 자체가 의미 없음)
 */
export const PLATFORM_FEE_RATE = 0.05

export function calculateFee(amount: number): number {
  if (amount <= 0) return 0
  return Math.ceil(amount * PLATFORM_FEE_RATE)
}

/** 한국 주요 은행 코드 */
export const BANK_CODES: { code: string; name: string }[] = [
  { code: "002", name: "산업" },
  { code: "003", name: "기업" },
  { code: "004", name: "국민" },
  { code: "007", name: "수협" },
  { code: "011", name: "농협" },
  { code: "020", name: "우리" },
  { code: "023", name: "SC제일" },
  { code: "027", name: "한국씨티" },
  { code: "031", name: "대구" },
  { code: "032", name: "부산" },
  { code: "034", name: "광주" },
  { code: "035", name: "제주" },
  { code: "037", name: "전북" },
  { code: "039", name: "경남" },
  { code: "045", name: "새마을금고" },
  { code: "048", name: "신협" },
  { code: "071", name: "우체국" },
  { code: "081", name: "하나" },
  { code: "088", name: "신한" },
  { code: "089", name: "케이뱅크" },
  { code: "090", name: "카카오뱅크" },
  { code: "092", name: "토스뱅크" },
]

/** 한국 주요 택배사 */
export const COURIER_COMPANIES: string[] = [
  "CJ대한통운",
  "한진택배",
  "롯데택배",
  "우체국택배",
  "로젠택배",
  "쿠팡로지스틱스",
  "기타",
]
