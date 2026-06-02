/**
 * 공유 추상화.
 *
 *   web:    Web Share API (지원 안 하면 fallback URL 복사)
 *   native: Capacitor Share (iOS / Android 시스템 공유 시트)
 */

import { isNativeSync } from "./platform"

export interface ShareOptions {
  title?: string
  text?: string
  url?: string
  /** dialog 제목 (Android 에서만 보임) */
  dialogTitle?: string
}

/**
 * 공유 시트 띄우기. 성공/실패 boolean 반환.
 * 사용자 취소 = false.
 */
export async function share(opts: ShareOptions): Promise<boolean> {
  if (isNativeSync()) {
    try {
      const { Share } = await import("@capacitor/share")
      const can = await Share.canShare()
      if (!can.value) return false
      await Share.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
        dialogTitle: opts.dialogTitle,
      })
      return true
    } catch (err: any) {
      // 사용자 취소
      if (err?.message?.includes("cancel")) return false
      // 공유 자체 실패
      return false
    }
  }

  // Web Share API
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      })
      return true
    } catch {
      return false
    }
  }

  // Fallback — URL 클립보드 복사
  if (opts.url && typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(opts.url)
      return true
    } catch {
      return false
    }
  }

  return false
}

/**
 * 클립보드 복사 (편의).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined") return false
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // 옛 fallback (deprecated 이지만 호환)
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
