/**
 * 광장 타이포그래피 토큰 — Pretendard 기반.
 *
 * 단일 소스: apps/web/app/globals.css 의 @font-face / @theme inline / body 정의.
 *
 * RN 사용 예:
 *   import { typography } from "@gwangjang/tokens"
 *   <Text style={{ fontSize: typography.size.md, letterSpacing: typography.letterSpacing.body }}>
 */

/** 폰트 패밀리 — RN 에서는 Pretendard 폰트 파일 등록 후 'Pretendard' 사용 */
export const fontFamily = {
  sans: "Pretendard",
  // RN 은 fallback 체인 직접 X. iOS / Android 가 시스템 한국어 폰트로 자연 fallback.
} as const

/**
 * 폰트 사이즈 — Tailwind 기본 + 광장 추가 (text-md = 15px).
 * globals.css L184: --text-md: 0.9375rem (15px)
 *
 * 단위: pixel (RN 표준 — RN 의 fontSize 는 unitless = sp/dp)
 */
export const fontSize = {
  xs: 12, // Tailwind text-xs
  sm: 14, // text-sm
  base: 16, // text-base
  md: 15, // 광장 추가 — 한국 모바일 카드 본문 디팩토 (globals.css L184)
  lg: 18, // text-lg
  xl: 20, // text-xl
  "2xl": 24, // text-2xl
  "3xl": 30, // text-3xl
  "4xl": 36, // text-4xl
} as const

/**
 * 폰트 굵기 — Pretendard variable (45~920) 지원.
 * 표준 단계만 정의 (RN 은 100 단위 string 또는 'normal'/'bold').
 */
export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const

/**
 * 라인 하이트 — 사이즈별 (Tailwind 기본 매칭).
 * RN 은 lineHeight 에 px 값 직접 사용.
 */
export const lineHeight = {
  xs: 16,
  sm: 20,
  base: 24,
  md: 22, // globals.css L185: 1.4rem ≈ 22px
  lg: 28,
  xl: 28,
  "2xl": 32,
  "3xl": 36,
  "4xl": 40,
} as const

/**
 * letter-spacing — 한국어 가독성 최적화 (당근/토스 디팩토).
 * globals.css L200, L208 정의값.
 */
export const letterSpacing = {
  body: -0.02, // body 기본 (em → RN 은 -0.32 같은 px 값. 상대 단위 X)
  heading: -0.03, // h1~h4
  md: -0.015, // text-md 전용 (globals.css L186)
  // RN 은 letterSpacing 에 px 사용. 16px * -0.02em = -0.32px
} as const

/** RN letterSpacing px 값 (사이즈별) */
export function letterSpacingPx(size: number, mode: "body" | "heading" | "md" = "body"): number {
  const em = letterSpacing[mode]
  return Math.round(size * em * 100) / 100
}
