"use client"

/**
 * Capacitor 네이티브 환경에서 앱 부팅 시 처리할 작업 모음.
 *
 * 단계 1 (현재):
 *   - 플랫폼 감지
 *   - StatusBar / Keyboard 기본 설정
 *   - App lifecycle 이벤트 (백그라운드 → 포그라운드 시 데이터 갱신)
 *
 * 단계 2 (다음 PR — 스토어 등록 전):
 *   - 푸시 알림 등록 (FCM/APNs 토큰 → 서버 등록)
 *   - 카카오 native 로그인 (Capacitor 플러그인 추가)
 *   - 인앱결제 (Apple IAP 정책 대응)
 *
 * 웹 환경에선 자동 no-op.
 */

import { useEffect } from "react"
import { isNativeSync } from "@/lib/native/platform"

export function NativeBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isNativeSync()) return

    let unsubscribers: Array<() => void> = []

    ;(async () => {
      try {
        // ★ 1순위 — Splash 즉시 숨김 (체감 속도 핵심).
        // 다른 plugin import 대기 안 함. WebView 가 이 시점이면 이미 콘텐츠 그리는 중.
        import("@capacitor/splash-screen").then(({ SplashScreen }) => {
          SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})
        })

        // StatusBar 설정 — overlay 비활성 + light bg + dark text
        const { StatusBar, Style } = await import("@capacitor/status-bar")
        await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
        await StatusBar.setStyle({ style: Style.Light }).catch(() => {})
        await StatusBar.setBackgroundColor({ color: "#ffffff" }).catch(() => {})

        // Keyboard — 키보드 보일 때 화면 ionic 모드로 reflow
        const keyboardModule = await import("@capacitor/keyboard").catch(() => null)
        if (keyboardModule) {
          // resize 모드는 capacitor.config.ts 에서 이미 'ionic' 으로 설정
        }

        // App lifecycle — 포그라운드 복귀 시 router.refresh 등 트리거 가능
        const { App } = await import("@capacitor/app")
        const stateChange = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            // 포그라운드 복귀 — 필요 시 데이터 갱신 트리거
            // 예: window.dispatchEvent(new Event('app-foreground'))
          }
        })
        unsubscribers.push(() => stateChange.remove())

        // 뒤로가기 처리 (Android)
        const backButton = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back()
          } else {
            // 홈 화면으로 (앱 종료 안 함)
            // App.minimizeApp() 호출 가능
          }
        })
        unsubscribers.push(() => backButton.remove())

        // 푸시 알림 — 단계 2 에서 활성화
        // const { PushNotifications } = await import("@capacitor/push-notifications")
        // const perm = await PushNotifications.requestPermissions()
        // if (perm.receive === "granted") {
        //   await PushNotifications.register()
        //   PushNotifications.addListener("registration", async (token) => {
        //     await fetch("/api/push/register", {
        //       method: "POST",
        //       body: JSON.stringify({ token: token.value, platform: ... }),
        //     })
        //   })
        // }
      } catch (err) {
        console.error("[native-bootstrap]", err)
      }
    })()

    return () => {
      unsubscribers.forEach((u) => u())
    }
  }, [])

  return null
}
