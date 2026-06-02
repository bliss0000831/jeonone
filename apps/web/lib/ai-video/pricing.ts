/**
 * AI 홍보영상 — 가격/크레딧 정책 (단일 출처)
 *
 *   내부 저장 단위: 포인트 (INT)
 *   UI 표시 단위:   크레딧 = 10 포인트
 *
 *   이유: 15초 영상이 0.5 크레딧(= 5 포인트) 이어서
 *         DB 는 깔끔한 INT, 사용자에겐 직관적인 "크레딧" 으로 보여주기 위함.
 */

export const POINTS_PER_CREDIT = 10

/**
 * AI 영상 기능 글로벌 노출 플래그.
 * false → 모든 AI 영상 UI/메뉴 숨김 (API 라우트는 살아있어 기존 데이터엔 영향 X).
 * 활성화 시: true 로 변경 후 환경변수 `NEXT_PUBLIC_AI_VIDEO=on` 으로 점진 롤아웃 가능.
 */
export const AI_VIDEO_UI_ENABLED =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_AI_VIDEO === 'on') || false

/** BETA 기간 플래그 — true 면 크레딧 체크 스킵 (무료) */
export const IS_BETA_FREE = true

/**
 * BETA 기간 중 허용되는 영상 길이 (초)
 *   · API 비용 절감을 위해 15초만 개방
 *   · 30초/60초 는 UI 에서 lock 표시 + 서버에서 400 반환
 */
export const BETA_ALLOWED_DURATIONS: Array<15 | 30 | 60> = [15]

export function isBetaLocked(duration: 15 | 30 | 60): boolean {
  return IS_BETA_FREE && !BETA_ALLOWED_DURATIONS.includes(duration)
}

// ─── 영상 길이별 차감 포인트 ────────────────────────────
export const COST_BY_DURATION: Record<15 | 30 | 60, number> = {
  15: 5, // 0.5 크레딧
  30: 10, // 1 크레딧 (기본)
  60: 20, // 2 크레딧
}

export function creditCostForDuration(d: 15 | 30 | 60): number {
  return COST_BY_DURATION[d] ?? COST_BY_DURATION[30]
}

/** 포인트 → "1 크레딧" / "0.5 크레딧" 같은 표시용 문자열 */
export function formatCredits(points: number): string {
  const n = points / POINTS_PER_CREDIT
  if (Number.isInteger(n)) return `${n}`
  return n.toFixed(1).replace(/\.0$/, "")
}

// ─── 상품 카탈로그 ─────────────────────────────────────
export type CreditProductCode = "credit_1" | "credit_5" | "credit_10"

export interface CreditProduct {
  code: CreditProductCode
  label: string
  credits: number // 크레딧 개수
  points: number // 실제 지급 포인트
  priceKrw: number
  unitKrw: number // 크레딧당 단가
  savingPct: number // 1개 대비 할인율
  tag?: string // "가장 인기" 등
}

export const CREDIT_PRODUCTS: CreditProduct[] = [
  {
    code: "credit_1",
    label: "1 크레딧",
    credits: 1,
    points: 1 * POINTS_PER_CREDIT,
    priceKrw: 5900,
    unitKrw: 5900,
    savingPct: 0,
  },
  {
    code: "credit_5",
    label: "5 크레딧",
    credits: 5,
    points: 5 * POINTS_PER_CREDIT,
    priceKrw: 25000,
    unitKrw: 5000,
    savingPct: 15,
    tag: "가장 인기",
  },
  {
    code: "credit_10",
    label: "10 크레딧",
    credits: 10,
    points: 10 * POINTS_PER_CREDIT,
    priceKrw: 45000,
    unitKrw: 4500,
    savingPct: 24,
    tag: "최대 할인",
  },
]

export function getProduct(code: CreditProductCode): CreditProduct | undefined {
  return CREDIT_PRODUCTS.find((p) => p.code === code)
}
