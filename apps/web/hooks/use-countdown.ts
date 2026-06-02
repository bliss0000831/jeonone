"use client"

import { useEffect, useState } from "react"

/**
 * M19: 마감 시간까지 남은 시간을 "D-N" 또는 "HH:MM:SS" 포맷으로 반환.
 * 24시간 이내면 시:분:초 카운트다운, 그 이상이면 D-N.
 *
 * @param deadline ISO 날짜 문자열 또는 null
 * @returns { label: string; isUrgent: boolean; isExpired: boolean }
 */
export function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!deadline) return
    const target = new Date(deadline).getTime()
    if (target - Date.now() > 24 * 60 * 60 * 1000) return // D-N 은 업데이트 불필요

    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [deadline])

  if (!deadline) return { label: null, isUrgent: false, isExpired: false }

  const target = new Date(deadline).getTime()
  const diff = target - now

  if (diff <= 0) return { label: "마감", isUrgent: true, isExpired: true }

  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (diff > 24 * 60 * 60 * 1000) {
    return { label: `D-${days}`, isUrgent: false, isExpired: false }
  }

  // 24시간 이내 — HH:MM:SS
  const h = Math.floor(diff / (1000 * 60 * 60))
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const s = Math.floor((diff % (1000 * 60)) / 1000)
  const label = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return { label, isUrgent: true, isExpired: false }
}
