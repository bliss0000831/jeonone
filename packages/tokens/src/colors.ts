/**
 * 광장 컬러 토큰 — RN 용 hex 값.
 *
 * 단일 소스: apps/web/app/globals.css 의 :root / .dark 정의.
 * 이 파일은 동일 값을 hex 형식으로 RN 에서 사용 가능하게 export.
 *
 * OKLCH → hex 변환 정확도 제한:
 *   culori 같은 색공간 라이브러리 없이는 픽셀 정확 매핑 X.
 *   현재 값은 globals.css 코드 주석 + Tailwind 표준 팔레트 매칭 기반 근사값.
 *   Phase 2 RN 화면 비교 시 ±10 hex 단위 조정 가능.
 *
 * 양측 일치 관리 (M7 단계):
 *   웹 (globals.css) ↔ RN (이 파일) 값 변경 시 양쪽 모두 업데이트 필수.
 *   기억 보조: 본 파일 각 토큰 옆 globals.css 줄 번호 명시.
 */

export const lightColors = {
  /* 배경 */
  background: "#ffffff", // oklch(1 0 0) — globals.css L22
  foreground: "#1a263d", // oklch(0.18 0.04 230) — 어두운 네이비

  /* 카드 / 팝오버 */
  card: "#ffffff",
  cardForeground: "#1a263d",
  popover: "#ffffff",
  popoverForeground: "#1a263d",

  /* primary — 딥 스카이블루 (#0284c7, sky-600) */
  primary: "#0284c7",
  primaryForeground: "#ffffff",

  /* secondary — 연한 하늘빛 배경 */
  secondary: "#ebf3f8",
  secondaryForeground: "#1f2c47",

  /* muted — 옅은 뉴트럴 */
  muted: "#f7f7f7",
  mutedForeground: "#6b7280",

  /* accent — 로고 포인트 오렌지 (#f97316 근사) */
  accent: "#f97316",
  accentForeground: "#ffffff",

  /* destructive — 빨강 */
  destructive: "#dc2626",
  destructiveForeground: "#ffffff",

  /* border / input / ring */
  border: "#d6dee5",
  input: "#e8ecef",
  ring: "#0284c7",

  /* 차트 팔레트 (스카이블루 기반) */
  chart1: "#0284c7",
  chart2: "#1d8fc7",
  chart3: "#f97316",
  chart4: "#22a8d1",
  chart5: "#7e8de4",

  /* 사이드바 */
  sidebar: "#f4f7fa",
  sidebarForeground: "#1a263d",
  sidebarPrimary: "#0284c7",
  sidebarPrimaryForeground: "#ffffff",
  sidebarAccent: "#e1edf6",
  sidebarAccentForeground: "#1f2c47",
  sidebarBorder: "#d6dee5",
  sidebarRing: "#0284c7",

  /* 채팅 — 순백 캔버스 */
  chatCanvas: "#ffffff",
  chatBubbleOther: "#ffffff",
  chatPill: "rgba(255, 255, 255, 0.8)",
  chatPattern: "transparent",

  /* 한국형 ink 팔레트 — 당근/토스 톤 (globals.css L84-87, hex 직접 정의) */
  ink900: "#1a1a1a", // 본문/제목
  ink700: "#4d4d4d", // 보조 본문
  ink500: "#8e8e8e", // 메타
  ink300: "#c8c8c8", // 비활성
} as const

export const darkColors = {
  /* 배경 */
  background: "#131a26", // oklch(0.13 0.02 230)
  foreground: "#ebeef0",

  /* 카드 / 팝오버 */
  card: "#1a2331",
  cardForeground: "#ebeef0",
  popover: "#1a2331",
  popoverForeground: "#ebeef0",

  /* primary — 다크 모드는 약간 더 밝게 */
  primary: "#38bdf8",
  primaryForeground: "#152030",

  /* secondary */
  secondary: "#26334a",
  secondaryForeground: "#dde2ea",

  /* muted */
  muted: "#28344a",
  mutedForeground: "#94a0b3",

  /* accent — 동일 오렌지 */
  accent: "#f97316",
  accentForeground: "#fbfbfb",

  /* destructive — 약간 어둡게 */
  destructive: "#c0341c",
  destructiveForeground: "#f0f0f0",

  /* border / input / ring */
  border: "#33425a",
  input: "#26334a",
  ring: "#38bdf8",

  /* 차트 (다크) */
  chart1: "#38bdf8",
  chart2: "#1d8fc7",
  chart3: "#f97316",
  chart4: "#1d8fc7",
  chart5: "#677dd4",

  /* 사이드바 (다크) */
  sidebar: "#16202f",
  sidebarForeground: "#ebeef0",
  sidebarPrimary: "#38bdf8",
  sidebarPrimaryForeground: "#152030",
  sidebarAccent: "#28344a",
  sidebarAccentForeground: "#dde2ea",
  sidebarBorder: "#33425a",
  sidebarRing: "#38bdf8",

  /* 채팅 — 다크 세이지 */
  chatCanvas: "#1a2522",
  chatBubbleOther: "#1f2935",
  chatPill: "rgba(40, 52, 70, 0.8)",
  chatPattern: "rgba(220, 235, 220, 0.04)",

  /* ink (다크 반전, globals.css L131-134, hex 직접 정의) */
  ink900: "#f0f0f0",
  ink700: "#b8b8b8",
  ink500: "#8a8a8a",
  ink300: "#5a5a5a",
} as const

/** 컬러 토큰 키 목록 (light/dark 동일 keyset). */
export type ColorToken = keyof typeof lightColors

/** 모드별 컬러 객체 — 키는 동일, 값은 string. */
export type ColorScheme = Record<ColorToken, string>

/** 모드별 컬러 객체 가져오기 */
export function getColors(mode: "light" | "dark" = "light"): ColorScheme {
  return mode === "dark" ? darkColors : lightColors
}
