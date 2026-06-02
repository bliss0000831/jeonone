/**
 * 광장 그림자 토큰 — RN 호환 (iOS shadow* + Android elevation).
 *
 * apps/web globals.css 에는 그림자 별도 토큰 정의 X (Tailwind 기본 사용).
 * 이 파일은 Tailwind shadow-* 와 시각적으로 매칭되는 RN 값.
 *
 * RN 사용 예:
 *   <View style={shadows.md}>...</View>
 */

interface RNShadow {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
  /** Android 전용 (그림자 깊이) */
  elevation: number
}

export const shadows: Record<"none" | "sm" | "md" | "lg" | "xl" | "2xl", RNShadow> = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Tailwind shadow-sm 매칭 */
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  /** Tailwind shadow / shadow-md 매칭 (광장 카드 기본) */
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  /** Tailwind shadow-lg */
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  /** Tailwind shadow-xl — 모달 / 드롭다운 */
  xl: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  /** Tailwind shadow-2xl — 큰 모달 / 플로팅 액션 */
  "2xl": {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
}
