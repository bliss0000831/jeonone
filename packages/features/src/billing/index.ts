/**
 * @gwangjang/features/billing — 구독·결제 도메인.
 */
export {
  listActivePlans,
  getCurrentSubscription,
  isFeatureEnabled,
  calculateChargeAmount,
  createSubscription,
  type SubscriptionPlan,
  type Subscription,
} from "./api"

// 한국 주요 은행 코드 (정산 계좌 입력 시 select 옵션)
export const BANK_CODES: Array<{ code: string; name: string }> = [
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
