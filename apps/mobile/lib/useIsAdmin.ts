/**
 * useIsAdmin — 현재 사용자가 관리자/슈퍼관리자인지 검사.
 *
 * 핵심 로직은 @gwangjang/features/auth 의 checkIsAdmin.
 * 이 파일은 모바일 환경(useAuth, getSupabase, getCachedPlaza)에 맞게 감싸는 thin hook.
 */

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { checkIsAdmin } from "@gwangjang/features/auth"

export function useIsAdmin(): boolean {
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const supabase = getSupabase()
      const result = await checkIsAdmin(supabase, user.id, plazaId)
      if (!cancelled) setIsAdmin(result)
    })()
    return () => {
      cancelled = true
    }
  }, [user, plazaId])

  return isAdmin
}
