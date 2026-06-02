/**
 * H14: 경량 네트워크 상태 감지 훅
 *
 * @react-native-community/netinfo 없이 동작.
 * 앱 포그라운드 전환 시 + 주기적(30초) 으로 Supabase health check → offline 판정.
 */

import { useEffect, useRef, useState } from "react"
import { AppState, type AppStateStatus } from "react-native"
import { getSupabase } from "./supabase"

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false)
  const checking = useRef(false)

  useEffect(() => {
    let alive = true

    const check = async () => {
      if (checking.current) return
      checking.current = true
      try {
        // 가벼운 health check — 1개 행 조회.
        // 응답이 오면(에러 객체 포함) 서버 연결됨 = 온라인.
        // RLS/쿼리 에러는 네트워크 문제가 아니므로 offline 판정에서 제외.
        // 실제 네트워크 단절만 throw → catch 에서 offline 처리.
        await getSupabase()
          .from("site_settings")
          .select("key")
          .limit(1)
          .maybeSingle()
        if (alive) setIsOffline(false)
      } catch {
        if (alive) setIsOffline(true)
      } finally {
        checking.current = false
      }
    }

    // 초기 체크
    check()

    // 30초 주기
    const id = setInterval(check, 30_000)

    // 앱 포그라운드 전환 시 체크
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") check()
    })

    return () => {
      alive = false
      clearInterval(id)
      sub.remove()
    }
  }, [])

  return isOffline
}
