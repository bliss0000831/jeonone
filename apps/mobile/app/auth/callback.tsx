/**
 * OAuth 콜백 — Expo web 에서 카카오 로그인 redirect 처리.
 *
 * 흐름:
 *   카카오 → supabase callback → /auth/callback?code=... 로 돌아옴
 *   → exchangeCodeForSession 으로 세션 교환 → (tabs) 로 이동
 *
 * native (APK) 는 expo-web-browser 의 openAuthSessionAsync 가
 * 같은 흐름을 in-app 으로 처리하므로 이 라우트는 web 한정.
 */

import { useEffect, useState } from "react"
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"

export default function OAuthCallback() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  // native(앱)에선 이 라우트가 deep link 로 진입되더라도 실제 처리는 signInWithKakao
  // (in-app browser flow) 가 담당. 여기서 아무 일도 하지 않고 즉시 tabs 로 보냄.
  // (이전엔 window.location 접근 → 예외 → '로그인 실패' 잠깐 표시됐었음)
  useEffect(() => {
    if (Platform.OS !== "web") {
      router.replace("/(tabs)")
    }
  }, [router])

  useEffect(() => {
    if (Platform.OS !== "web") return  // native 는 위 effect 가 처리
    let cancelled = false
    ;(async () => {
      try {
        if (typeof window === "undefined") return
        const supabase = getSupabase()
        const url = new URL(window.location.href)

        // ── 1) 에러 먼저 체크 ────────────────────────
        const errDesc =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error")
        if (errDesc) {
          setError(decodeURIComponent(errDesc))
          return
        }

        // ── 2) PKCE flow: ?code= ─────────────────────
        const code = url.searchParams.get("code")
        const isSignup = url.searchParams.get("signup") === "1"
        if (code) {
          const { error: exErr, data } = await supabase.auth.exchangeCodeForSession(code)
          if (cancelled) return
          if (exErr) {
            setError(exErr.message)
            return
          }
          if (data.user) {
            const meta = data.user.user_metadata || {}
            const kakaoAccount = meta.kakao_account || {}
            const kakaoProfile = kakaoAccount.profile || {}
            const nickname =
              kakaoProfile.nickname || meta.nickname || meta.name || null
            const fullName =
              meta.full_name || meta.name || kakaoProfile.nickname || null
            const avatarUrl =
              kakaoProfile.profile_image_url || meta.avatar_url || null
            const email = kakaoAccount.email || data.user.email || null

            // ── A) profiles upsert (web callback/route.ts 1:1) ──
            const phoneVal = meta.phone || null
            try {
              await supabase.from("profiles").upsert(
                {
                  id: data.user.id,
                  nickname,
                  full_name: fullName,
                  phone: phoneVal,
                  avatar_url: avatarUrl,
                  email,
                  ...(phoneVal ? { is_verified_phone: true } : {}),
                  updated_at: new Date().toISOString(),
                  last_seen: new Date().toISOString(),
                },
                { onConflict: "id" },
              )
            } catch {}

            // 광장 통합 인증 — plaza_profiles 자동 생성
            const { getCachedPlaza } = await import("@/lib/plaza")
            const plaza = getCachedPlaza().id
            if (plaza) {
              const { ensurePlazaProfile } = await import("@gwangjang/features/profile/ensure-plaza-profile")
              await ensurePlazaProfile(supabase, data.user.id, plaza)
            }
          }
          router.replace("/(tabs)")
          return
        }

        // ── 3) Implicit flow: #access_token= (hash) ──
        const hash = (url.hash || "").replace(/^#/, "")
        if (hash) {
          const params = new URLSearchParams(hash)
          const access_token = params.get("access_token")
          const refresh_token = params.get("refresh_token")
          if (access_token && refresh_token) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            })
            if (cancelled) return
            if (setErr) {
              setError(setErr.message)
              return
            }
            router.replace("/(tabs)")
            return
          }
        }

        // ── 4) 이미 세션이 있는지 (onAuthStateChange 가 잡았을 수 있음) ──
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace("/(tabs)")
          return
        }

        console.error("인증 코드를 찾을 수 없습니다 (URL: " + url.search + url.hash + ")")
        setError("인증 코드를 찾을 수 없습니다")
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "로그인 실패")
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // native 에서는 '로그인 실패' 깜빡임을 피하기 위해 빈 로딩 스피너만 표시
  if (Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.errorTitle}>로그인 실패</Text>
          <Text style={styles.errorText}>{error}</Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={lightColors.primary} />
          <Text style={styles.loadingText}>로그인 처리 중...</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: lightColors.background,
    padding: spacing[4],
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    marginTop: 12,
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 8,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: "#dc2626",
    textAlign: "center",
  },
})
