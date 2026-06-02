/**
 * @gwangjang/tokens — 광장 디자인 토큰 (RN 용 TS 객체).
 *
 * 단일 소스 정책 (M7):
 *   - 웹: apps/web/app/globals.css 가 캐노니컬 (Tailwind v4 + CSS 변수)
 *   - RN: 이 패키지가 동일 값을 TS 객체로 제공
 *   - 양측 일치는 수동 관리 (Phase 2 RN 안정화 후 통합 검토)
 *
 * 사용:
 *   import { lightColors, fontSize, spacing, radius, shadows } from "@gwangjang/tokens"
 *
 * 또는 모듈별:
 *   import { getColors } from "@gwangjang/tokens/colors"
 *   import { fontSize, fontWeight } from "@gwangjang/tokens/typography"
 */

export * from "./colors"
export * from "./typography"
export * from "./spacing"
export * from "./radius"
export * from "./shadows"
