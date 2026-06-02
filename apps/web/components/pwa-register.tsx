"use client"

/**
 * Service Worker 등록 + 설치 프롬프트 핸들링
 *
 * 동작:
 *   - production 에서만 SW 등록 (dev 에선 캐시 stale 위험 회피)
 *   - 브라우저가 install 가능하다고 알리면 prompt 보관 (PWAInstallBanner 가 사용)
 */

import { useEffect } from "react"

declare global {
  interface Window {
    __pwaInstallPromptEvent?: BeforeInstallPromptEvent | null
  }
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
  prompt(): Promise<void>
}

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    // SW 등록
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // 새 버전 발견 시 자동 reload 트리거 (선택 — 너무 공격적이면 제거)
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing
          if (!sw) return
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              // 새 SW 설치 완료. 다음 navigation 에 활성화
              // 자동 reload 는 안 함 (UX 방해)
            }
          })
        })
      })
      .catch(() => {
        // SW 등록 실패는 무시 (앱 동작에 치명적이지 않음)
      })

    // Install prompt 이벤트 보관
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      window.__pwaInstallPromptEvent = e as BeforeInstallPromptEvent
      // 배너 컴포넌트가 다시 렌더하도록 custom event 발송
      window.dispatchEvent(new CustomEvent("pwa-install-available"))
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
    }
  }, [])

  return null
}
