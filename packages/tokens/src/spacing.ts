/**
 * 광장 간격 토큰 — Tailwind 기본 스케일과 1:1 매칭.
 *
 * apps/web 는 globals.css 의 spacing 을 override 하지 않음 → Tailwind 기본 사용.
 * 이 파일은 RN 에서 동일 단위로 padding/margin 적용 가능하게.
 *
 * 단위: pixel.
 */
export const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
  32: 128,
  36: 144,
  40: 160,
  44: 176,
  48: 192,
  52: 208,
  56: 224,
  60: 240,
  64: 256,
  72: 288,
  80: 320,
  96: 384,
} as const

/**
 * 시맨틱 간격 — 컴포넌트 간 표준 패턴.
 * RN 디자인 시스템 가이드.
 */
export const semanticSpacing = {
  /** 카드 내부 패딩 (당근/토스 — 16px 기본) */
  cardPadding: spacing[4],
  /** 섹션 간 큰 여백 */
  sectionGap: spacing[6],
  /** 인라인 요소 간 작은 여백 (icon ↔ text) */
  inlineGap: spacing[2],
  /** 입력 필드 간 여백 */
  fieldGap: spacing[3],
  /** 페이지 좌우 여백 (모바일) */
  screenPadding: spacing[4],
} as const
