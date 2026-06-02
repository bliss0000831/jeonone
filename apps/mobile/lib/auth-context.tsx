/**
 * Auth Context — Supabase 세션을 앱 전역에서 사용.
 *
 * 사용:
 *   const { session, user, loading, signIn, signOut } = useAuth()
 *
 * Phase 2D: 카카오 native SDK 통합 시 signIn 의 내부만 교체.
 * 외부 API 변경 X.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { Platform } from "react-native"
import * as WebBrowser from "expo-web-browser"
import * as Linking from "expo-linking"
import type { Session, User } from "@supabase/supabase-js"
import { getSupabase } from "./supabase"

WebBrowser.maybeCompleteAuthSession()

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signInWithKakao: (opts?: { signup?: boolean }) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()

    // 1. 앱 시작 시 저장된 세션 복원 (AsyncStorage)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // 2. 세션 변경 구독 (로그인/로그아웃/토큰 갱신)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async function signIn(email: string, password: string) {
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    if (!data.user) return { error: "로그인에 실패했습니다" }

    // 광장 통합 인증 — plaza_profiles 자동 생성 (account_type: 'user')
    const { getCachedPlaza } = await import("./plaza")
    const plaza = getCachedPlaza().id
    if (plaza) {
      const { ensurePlazaProfile } = await import("@gwangjang/features/profile/ensure-plaza-profile")
      await ensurePlazaProfile(supabase, data.user.id, plaza)
    }
    return {}
  }, [])

  /**
   * 카카오 로그인 — web/native 분기.
   *
   * web (Expo web): supabase.auth.signInWithOAuth + 브라우저 redirect (web 과 동일)
   * native: skipBrowserRedirect + WebBrowser.openAuthSessionAsync 으로
   *         in-app 브라우저 띄우고, callback URL 에서 code 추출 → exchangeCodeForSession
   */
  const signInWithKakao = useCallback(async function signInWithKakao(opts?: { signup?: boolean }): Promise<{ error?: string }> {
    const supabase = getSupabase()
    const signupMarker = opts?.signup ? "?signup=1" : ""

    if (Platform.OS === "web") {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback${signupMarker}`
          : undefined
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo },
      })
      if (error) return { error: error.message }
      return {}
    }

    // native — deep link 기반
    const redirectTo = Linking.createURL("/auth/callback") + signupMarker
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo, skipBrowserRedirect: true },
    })
    if (error || !data?.url) return { error: error?.message ?? "OAuth URL 생성 실패" }

    // openAuthSessionAsync 는 일부 안드로이드 환경에서 deep link 복귀를 못 잡는
    // 경우가 있어, 미리 Linking listener 를 걸어 두고 어느 쪽이 먼저 도착하든 처리.
    const linkPromise = new Promise<string | null>((resolve) => {
      let resolved = false
      const sub = Linking.addEventListener("url", (e) => {
        if (resolved) return
        resolved = true
        sub.remove()
        resolve(e.url || null)
      })
      // 5분 후 타임아웃 (사용자 직접 취소 케이스)
      setTimeout(() => {
        if (resolved) return
        resolved = true
        sub.remove()
        resolve(null)
      }, 5 * 60 * 1000)
    })

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
      showInRecents: true,
    })

    let cbUrl: string | null = null
    if (result.type === "success" && result.url) {
      cbUrl = result.url
    } else {
      // WebBrowser 가 success 를 못 받았어도 deep link 가 도착했을 수 있음
      cbUrl = await Promise.race([linkPromise, new Promise<null>((r) => setTimeout(() => r(null), 1500))])
      if (!cbUrl) {
        return { error: "카카오 로그인이 취소되었습니다" }
      }
    }
    const result2 = { url: cbUrl }

    // callback URL 에서 code 추출 후 세션 교환
    const url = new URL(result2.url)
    const code = url.searchParams.get("code")
    if (!code) return { error: "인증 코드가 없습니다" }
    const { error: exErr, data: sessionData } = await supabase.auth.exchangeCodeForSession(code)
    if (exErr) return { error: exErr.message }
    if (!sessionData.user) return { error: "사용자 정보를 가져오지 못했습니다" }

    // ── A) profiles upsert (web callback/route.ts 1:1) ──
    const meta = sessionData.user.user_metadata || {}
    const kakaoAccount = meta.kakao_account || {}
    const kakaoProfile = kakaoAccount.profile || {}
    const nickname =
      kakaoProfile.nickname || meta.nickname || meta.name || null
    const fullName =
      meta.full_name || meta.name || kakaoProfile.nickname || null
    const avatarUrl =
      kakaoProfile.profile_image_url || meta.avatar_url || null
    const email = kakaoAccount.email || sessionData.user.email || null

    try {
      await supabase.from("profiles").upsert(
        {
          id: sessionData.user.id,
          nickname,
          full_name: fullName,
          phone: meta.phone || null,
          avatar_url: avatarUrl,
          email,
          updated_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
    } catch {}

    // 광장 통합 인증 — plaza_profiles 자동 생성
    const { getCachedPlaza } = await import("./plaza")
    const plaza = getCachedPlaza().id
    if (plaza) {
      const { ensurePlazaProfile } = await import("@gwangjang/features/profile/ensure-plaza-profile")
      await ensurePlazaProfile(supabase, sessionData.user.id, plaza)
    }
    return {}
  }, [])

  const signOut = useCallback(async function signOut() {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    // 🚀 로그아웃 시 메모리 캐시 정리 — stale 데이터 노출 방지
    try {
      const { clearPlazaBusinessInfoCache } = await import("@/lib/plaza-business-info")
      clearPlazaBusinessInfoCache()
    } catch {}
  }, [])

  const user = session?.user ?? null
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      loading,
      signIn,
      signInWithKakao,
      signOut,
    }),
    [session, user, loading, signIn, signInWithKakao, signOut],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
