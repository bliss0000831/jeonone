"use client"

/**
 * 쿠키 동의 배너 (PIPA 기본 요건 충족용 v1)
 *
 * 표시 조건:
 *   - localStorage 'cookie-consent' 가 비어있을 때
 *
 * 사용자 액션:
 *   - "동의" → 'accepted' 저장 후 배너 숨김
 *   - "선택 거부" → 'minimal' 저장. 분석 쿠키 사용 시 이 값을 체크해 비활성화 가능
 *   - "자세히" → /privacy 로 이동
 *
 * 추후 v2: 카테고리별 토글 (필수/분석/광고). 현재는 v1 단순 형태.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Cookie, X } from "lucide-react"
import { isNativeSync } from "@/lib/native/platform"

const STORAGE_KEY = "cookie-consent"

export function CookieConsent() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Native 앱 (Capacitor) 에선 쿠키 배너 표시 안 함.
    //   - 앱 자체가 PIPA 의 별도 동의 흐름 (앱 첫 실행 동의 / 약관 화면) 으로 처리 가능
    //   - 모바일 웹과 분리하기 위해 native 환경에선 자동 'accepted' 처리
    if (isNativeSync()) {
      try { localStorage.setItem(STORAGE_KEY, "accepted") } catch {}
      return
    }
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (!v) setShow(true)
    } catch {
      // private mode 등 localStorage 막힌 경우 — 배너 안 띄움 (반복 노출 방지)
    }
  }, [])

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, "accepted") } catch {}
    setShow(false)
  }

  const declineOptional = () => {
    try { localStorage.setItem(STORAGE_KEY, "minimal") } catch {}
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-label="쿠키 사용 안내"
      className="fixed left-0 right-0 z-[100] border-t bg-card/95 backdrop-blur-sm shadow-lg bottom-16 md:bottom-0"
    >
      <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex items-start gap-3">
        <div className="hidden sm:flex w-9 h-9 rounded-full bg-primary/10 items-center justify-center shrink-0">
          <Cookie className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed text-foreground">
            본 사이트는 서비스 제공을 위해 <strong className="font-semibold">필수 쿠키</strong>를
            사용하며, 서비스 개선을 위한 <strong className="font-semibold">분석 쿠키</strong>를
            함께 사용할 수 있습니다.{" "}
            <Link href="/privacy" className="underline hover:text-primary">
              자세히 보기
            </Link>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={accept} className="h-8 text-xs">
              모두 동의
            </Button>
            <Button size="sm" variant="outline" onClick={declineOptional} className="h-8 text-xs">
              필수만 사용
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={declineOptional}
          aria-label="닫기"
          className="p-1 hover:bg-secondary rounded-md shrink-0 self-start"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

/**
 * 분석/광고 쿠키 사용 가능 여부 헬퍼.
 * - 'accepted' 면 OK
 * - 'minimal' 또는 미동의면 false
 */
export function canUseAnalyticsCookies(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(STORAGE_KEY) === "accepted"
  } catch {
    return false
  }
}
