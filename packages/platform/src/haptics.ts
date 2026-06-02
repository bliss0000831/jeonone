/**
 * 햅틱 (진동) 추상화.
 *
 *   web:    navigator.vibrate (Android Chrome 만 지원, iOS Safari 미지원)
 *   native: Capacitor Haptics (iOS / Android 모두 정확한 패턴)
 *
 * 사용 패턴:
 *   - light: 카드 탭 / 토글
 *   - medium: 버튼 클릭 / 기본 액션
 *   - heavy: 결제 완료 / 중요 변화
 *   - success/warning/error: 알림 종류별
 *   - selection: 키보드 / 스피너 변경
 */

import { isNativeSync } from "./platform"

export type ImpactStyle = "light" | "medium" | "heavy"
export type NotificationType = "success" | "warning" | "error"

/** 가벼운 탭 / 토글 */
export async function impactLight(): Promise<void> {
  await impact("light")
}

export async function impactMedium(): Promise<void> {
  await impact("medium")
}

export async function impactHeavy(): Promise<void> {
  await impact("heavy")
}

export async function impact(style: ImpactStyle = "medium"): Promise<void> {
  if (isNativeSync()) {
    try {
      const { Haptics, ImpactStyle: CapImpactStyle } = await import("@capacitor/haptics")
      const map = {
        light: CapImpactStyle.Light,
        medium: CapImpactStyle.Medium,
        heavy: CapImpactStyle.Heavy,
      }
      await Haptics.impact({ style: map[style] })
      return
    } catch {}
  }
  // Web fallback (Android Chrome 만 동작)
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    const ms = style === "light" ? 10 : style === "medium" ? 30 : 60
    navigator.vibrate(ms)
  }
}

/** 알림 (성공 / 경고 / 에러) */
export async function notification(type: NotificationType): Promise<void> {
  if (isNativeSync()) {
    try {
      const { Haptics, NotificationType: CapType } = await import("@capacitor/haptics")
      const map = {
        success: CapType.Success,
        warning: CapType.Warning,
        error: CapType.Error,
      }
      await Haptics.notification({ type: map[type] })
      return
    } catch {}
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    const pattern =
      type === "success" ? [10, 50, 10] :
      type === "warning" ? [30, 30, 30] :
      [50, 100, 50]
    navigator.vibrate(pattern)
  }
}

/** 키보드 / 스피너 / 셀렉트 변경 */
export async function selection(): Promise<void> {
  if (isNativeSync()) {
    try {
      const { Haptics } = await import("@capacitor/haptics")
      await Haptics.selectionChanged()
      return
    } catch {}
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(5)
  }
}
