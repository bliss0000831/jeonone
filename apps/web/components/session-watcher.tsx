'use client'

/**
 * SessionWatcher — 세션 만료 감지.
 *
 * 사용자가 페이지에 머무는 동안 세션이 만료(SIGNED_OUT / 토큰 갱신 실패)되면
 * 토스트로 알리고 로그인 페이지로 유도. 글 작성 중 세션 만료 시
 * 알 수 없는 에러 대신 명확한 안내 제공.
 */

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// 로그인/회원가입 등 인증 경로에서는 SIGNED_OUT 이 정상 흐름이므로 무시
const AUTH_PATHS = ['/auth/', '/login']

export function SessionWatcher() {
  const router = useRouter()
  const pathname = usePathname()
  // 최초 1회 마운트 시 발생하는 INITIAL_SESSION 이벤트는 무시
  const initializedRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!initializedRef.current) {
        initializedRef.current = true
        return
      }
      if (event === 'SIGNED_OUT') {
        const onAuthPage = AUTH_PATHS.some((p) => pathname?.startsWith(p))
        if (onAuthPage) return
        toast.error('로그인이 만료되었습니다. 다시 로그인해주세요.')
        const redirect = encodeURIComponent(pathname || '/')
        router.push(`/auth/login?redirect=${redirect}`)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [router, pathname])

  return null
}
