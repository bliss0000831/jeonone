"use client"

/**
 * "홈 화면에 추가" 안내 배너 (모바일).
 *
 * 표시 조건:
 *   - 모바일 브라우저
 *   - PWARegister 가 beforeinstallprompt 이벤트 받음 (Android Chrome)
 *   - 또는 iOS Safari (manual instruction)
 *   - localStorage 'pwa-install-dismissed' 비어있을 때
 *
 * 사용자 액션:
 *   - "설치" → prompt() 호출 → 사용자 승인 시 install
 *   - "나중에" → 7일간 표시 안 함
 *   - "다시 보지 않기" → 영구 dismiss
 */

import { useEffect, useState } from "react"
import { X, Smartphone, Share, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isNativeSync } from "@/lib/native/platform"

const STORAGE_KEY = "pwa-install-dismissed"

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
  prompt(): Promise<void>
}

declare global {
  interface Window {
    __pwaInstallPromptEvent?: BeforeInstallPromptEvent | null
  }
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  )
}

function isDismissed(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (!v) return false
    if (v === "permanent") return true
    const ts = Number(v)
    if (!Number.isFinite(ts)) return false
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    return Date.now() - ts < sevenDaysMs
  } catch {
    return false
  }
}

export function PWAInstallBanner() {
  const [show, setShow] = useState(false)
  const [variant, setVariant] = useState<"android" | "ios" | null>(null)

  useEffect(() => {
    if (isNativeSync()) return  // Capacitor 앱 안에선 PWA 배너 의미 없음
    if (isStandalone()) return  // 이미 설치됨 (또는 전체화면)
    if (isDismissed()) return

    if (isIOS()) {
      setVariant("ios")
      setShow(true)
      return
    }

    // Android — beforeinstallprompt 이벤트 대기
    const onAvailable = () => {
      if (window.__pwaInstallPromptEvent) {
        setVariant("android")
        setShow(true)
      }
    }
    if (window.__pwaInstallPromptEvent) onAvailable()
    window.addEventListener("pwa-install-available", onAvailable)
    return () => window.removeEventListener("pwa-install-available", onAvailable)
  }, [])

  const dismissTemp = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch {}
    setShow(false)
  }

  const dismissPermanent = () => {
    try { localStorage.setItem(STORAGE_KEY, "permanent") } catch {}
    setShow(false)
  }

  const install = async () => {
    const evt = window.__pwaInstallPromptEvent
    if (!evt) return
    await evt.prompt()
    const { outcome } = await evt.userChoice
    window.__pwaInstallPromptEvent = null
    if (outcome === "accepted") {
      setShow(false)
    } else {
      dismissTemp()
    }
  }

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-label="앱 설치 안내"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[90] rounded-2xl border bg-card shadow-xl"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm">
              전원일기 앱으로 더 편하게
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {variant === "ios"
                ? "Safari 하단의 공유 → \"홈 화면에 추가\"를 눌러주세요."
                : "홈 화면에 추가하면 앱처럼 빠르게 사용할 수 있어요."}
            </p>
            {variant === "ios" && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Share className="w-4 h-4" />
                <span>→</span>
                <Plus className="w-4 h-4" />
                <span>"홈 화면에 추가"</span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {variant === "android" && (
                <Button size="sm" onClick={install} className="h-8 text-xs">
                  설치
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={dismissTemp} className="h-8 text-xs">
                나중에
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissPermanent} className="h-8 text-xs">
                다시 보지 않기
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissTemp}
            aria-label="닫기"
            className="p-1 hover:bg-secondary rounded-md shrink-0 self-start"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
