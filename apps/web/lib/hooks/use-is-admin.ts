"use client"

/**
 * useIsAdmin — Client-side admin 판별.
 *
 * 핵심 로직은 @gwangjang/features/auth 의 checkIsAdmin.
 * 이 파일은 웹 환경(createClient, supabase.auth.getUser)에 맞게 감싸는 thin hook.
 *
 * 사용:
 *   const isAdmin = useIsAdmin()
 *   {(isOwner || isAdmin) && <DeleteButton/>}
 */
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { checkIsAdmin } from "@gwangjang/features/auth"

export function useIsAdmin(currentPlazaId?: string | null): boolean {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const result = await checkIsAdmin(supabase, user.id, currentPlazaId ?? null)
      if (!cancelled) setIsAdmin(result)
    })()
    return () => {
      cancelled = true
    }
  }, [currentPlazaId])

  return isAdmin
}
