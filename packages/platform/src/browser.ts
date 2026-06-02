/**
 * 외부 링크 열기 추상화.
 *
 *   web:    window.open(url, '_blank')
 *   native: Capacitor Browser (in-app browser, 앱 안에서 열림 — 사용자 이탈 X)
 *
 * Apple App Store 정책: 외부 링크는 SFSafariViewController (Capacitor Browser 가 사용)
 * 으로 열어야 하는 경우가 많음. 일반 window.open 은 외부 Safari 이탈.
 */

import { isNativeSync } from "./platform"

export interface OpenOptions {
  url: string
  /** native: 'popover' = 팝오버 (iOS) / undefined = 전체화면 */
  presentationStyle?: "popover" | "fullscreen"
  /** native: in-app browser 의 toolbar 색 */
  toolbarColor?: string
  /** web: 새 탭 vs 같은 탭 */
  target?: "_blank" | "_self"
}

/**
 * 외부 URL 열기. native 면 in-app browser, web 이면 새 탭.
 */
export async function openExternal(opts: OpenOptions | string): Promise<void> {
  const options: OpenOptions = typeof opts === "string" ? { url: opts } : opts

  if (isNativeSync()) {
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({
        url: options.url,
        presentationStyle: options.presentationStyle || "fullscreen",
        toolbarColor: options.toolbarColor || "#ffffff",
      })
      return
    } catch {
      // fallback to window.open
    }
  }

  if (typeof window === "undefined") return
  window.open(options.url, options.target || "_blank", "noopener,noreferrer")
}

/**
 * In-app browser 닫기 (native 만 동작).
 */
export async function closeBrowser(): Promise<void> {
  if (!isNativeSync()) return
  try {
    const { Browser } = await import("@capacitor/browser")
    await Browser.close()
  } catch {}
}
