/**
 * 앱 생명주기 추상화.
 *
 *   web:    Page Visibility API (visibilitychange / focus / blur)
 *   native: Capacitor App (appStateChange / backButton / appUrlOpen)
 *
 * 사용처:
 *   - 백그라운드 → 포그라운드 시 데이터 갱신
 *   - 딥링크 (kakao://, https://gwangjang.app/property/123) 처리
 *   - Android 뒤로가기 버튼
 */

import { isNativeSync } from "./platform"

export type AppStateListener = (isActive: boolean) => void

/**
 * 앱 활성 상태 변경 구독. 포그라운드 → true, 백그라운드 → false.
 */
export async function onAppStateChange(listener: AppStateListener): Promise<() => void> {
  if (isNativeSync()) {
    try {
      const { App } = await import("@capacitor/app")
      const handle = await App.addListener("appStateChange", ({ isActive }) => {
        listener(isActive)
      })
      return () => handle.remove()
    } catch {}
  }
  if (typeof window === "undefined") return () => {}

  const onVisChange = () => {
    listener(!document.hidden)
  }
  document.addEventListener("visibilitychange", onVisChange)
  return () => document.removeEventListener("visibilitychange", onVisChange)
}

/**
 * Android 뒤로가기 버튼 핸들링. native 만 동작.
 *
 * canGoBack 가 true 면 history.back() / false 면 앱 종료 또는 minimize.
 */
export async function onBackButton(
  listener: (event: { canGoBack: boolean }) => void,
): Promise<() => void> {
  if (!isNativeSync()) return () => {}
  try {
    const { App } = await import("@capacitor/app")
    const handle = await App.addListener("backButton", ({ canGoBack }) => {
      listener({ canGoBack })
    })
    return () => handle.remove()
  } catch {
    return () => {}
  }
}

/**
 * 딥링크 (앱이 외부에서 열렸을 때) 핸들링.
 *
 * URL 예: gwangjang://property/abc123 또는 https://gwangjang.app/property/abc123
 */
export async function onDeepLink(
  listener: (url: string) => void,
): Promise<() => void> {
  if (!isNativeSync()) return () => {}
  try {
    const { App } = await import("@capacitor/app")
    const handle = await App.addListener("appUrlOpen", (event) => {
      listener(event.url)
    })
    return () => handle.remove()
  } catch {
    return () => {}
  }
}

/**
 * 앱 종료 (Android — 홈 화면으로 minimize, iOS — 무동작).
 */
export async function minimizeApp(): Promise<void> {
  if (!isNativeSync()) return
  try {
    const { App } = await import("@capacitor/app")
    await App.minimizeApp()
  } catch {}
}
