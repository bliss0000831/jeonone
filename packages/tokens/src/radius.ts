/**
 * 광장 모서리 반경 토큰.
 *
 * 단일 소스: apps/web/app/globals.css L62 (--radius: 0.625rem = 10px)
 *           + @theme inline L164-167 (sm/md/lg/xl 도출)
 *
 * RN 사용 예:
 *   <View style={{ borderRadius: radius.lg }}>
 */
export const radius = {
  none: 0,
  sm: 6, // calc(var(--radius) - 4px)
  md: 8, // calc(var(--radius) - 2px)
  lg: 10, // var(--radius) — 광장 기본
  xl: 14, // calc(var(--radius) + 4px)
  "2xl": 20,
  "3xl": 28,
  full: 9999,
} as const
