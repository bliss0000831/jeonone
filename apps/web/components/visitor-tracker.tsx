'use client'

/**
 * 방문자 트래커 — 2026-04 audit 후 sendBeacon 방식으로 전환.
 *
 * 변경 전: client supabase.auth.getUser() + insert (페이지 전환 블록 + auth round-trip)
 * 변경 후: sendBeacon → /api/visitor-track (fire-and-forget, auth는 쿠키 기반)
 */

import { useEffect } from 'react'

function getDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet'
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile'
  return 'desktop'
}

function getBrowser(): string {
  if (typeof window === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('SamsungBrowser')) return 'Samsung'
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera'
  if (ua.includes('Trident')) return 'IE'
  if (ua.includes('Edge')) return 'Edge'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Safari')) return 'Safari'
  return 'unknown'
}

function getOS(): string {
  if (typeof window === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (ua.includes('Win')) return 'Windows'
  if (ua.includes('Mac')) return 'MacOS'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  return 'unknown'
}

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let sessionId = sessionStorage.getItem('visitor_session_id')
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    sessionStorage.setItem('visitor_session_id', sessionId)
  }
  return sessionId
}

export function VisitorTracker() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const sessionId = getSessionId()
    const pageUrl = window.location.pathname

    // 같은 세션 + 같은 페이지 5분 dedupe — 클라에서 1차 차단해 서버 INSERT 자체를 줄임.
    const lastVisit = sessionStorage.getItem(`last_visit_${pageUrl}`)
    const nowMs = Date.now()
    if (lastVisit && nowMs - parseInt(lastVisit) < 5 * 60 * 1000) {
      return
    }
    sessionStorage.setItem(`last_visit_${pageUrl}`, nowMs.toString())

    const payload = {
      session_id: sessionId,
      page_url: pageUrl,
      user_agent: navigator.userAgent,
      referer: document.referrer || null,
      device_type: getDeviceType(),
      browser: getBrowser(),
      os: getOS(),
    }

    // sendBeacon: fire-and-forget, 페이지 전환 차단 없음.
    // 실패 또는 미지원 시 fetch keepalive 로 폴백.
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      const ok = navigator.sendBeacon?.('/api/visitor-track', blob)
      if (!ok) {
        fetch('/api/visitor-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      // 무시
    }
  }, [])

  return null
}
