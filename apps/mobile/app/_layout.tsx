/**
 * Root layout — AuthProvider + Stack + 첫 진입 라우팅.
 *
 * 라우팅 정책 (web 정독):
 *   - 광장 홈 (/(tabs)) 는 로그인 없이 자유 진입 가능 (허브 제거 → 홈에서 광장 선택)
 *   - 로그인이 필요한 액션 (글쓰기, 댓글, 좋아요 등) 에서만 /auth/login 이동
 *   - 초기 진입: AsyncStorage 에 광장이 저장돼있으면 (tabs), 없으면 /hub
 */

import FontAwesome from "@expo/vector-icons/FontAwesome"
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native"
import { useFonts } from "expo-font"
import { Stack, useRouter, useSegments } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Alert, Animated, BackHandler, InteractionManager, KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native"
// lottie-react-native 는 네이티브 전용 — 웹 번들에서 resolve 실패하므로 플랫폼 분기
const LottieView: any =
  Platform.OS !== "web"
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? require("lottie-react-native").default
    : View
import "react-native-reanimated"

import { useColorScheme } from "@/components/useColorScheme"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { loadSelectedPlaza } from "@/lib/plaza"
import { getSupabase } from "@/lib/supabase"
import { loadPlazaLabels } from "@/lib/constants"
import { startPrefetch } from "@/lib/prefetch"
import { lightColors } from "@gwangjang/tokens"
import Constants from "expo-constants"
import AsyncStorage from "@react-native-async-storage/async-storage"
// Eager preload — Naver Maps 네이티브 모듈 등록을 앱 시작 시 미리 (첫 detail 페이지 진입 가속)
import "@/lib/naver-map-loader"
import { usePushNotifications } from "@/lib/push-notifications"
import { useVisitorTrack } from "@/lib/visitor-tracker"
import { useNetworkStatus } from "@/lib/use-network-status"
import { NaverMapWarmup } from "@/components/NaverMapWarmup"

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router"

export const unstable_settings = {
  initialRouteName: "(tabs)",
}

SplashScreen.preventAutoHideAsync()

// 전역 폰트 — Pretendard 로 통일.
// ⚠️ React 19 + RN 0.81 환경에서 Text/TextInput 의 defaultProps 변경은
// forwardRef 컴포넌트 read-only 속성 throw 로 앱 크래시 발생 가능.
// 따라서 try/catch 로 감싸고, 실패해도 무시 (개별 스타일에서 fontFamily 지정).
let _fontDefaultsApplied = false
function applyGlobalFontDefaults() {
  if (_fontDefaultsApplied) return
  _fontDefaultsApplied = true
  try {
    const baseStyle = { fontFamily: "Pretendard" } as const
    const TextAny = Text as any
    const TextInputAny = TextInput as any
    if (TextAny && typeof TextAny === "object") {
      TextAny.defaultProps = TextAny.defaultProps || {}
      TextAny.defaultProps.style = [baseStyle, TextAny.defaultProps.style]
    }
    if (TextInputAny && typeof TextInputAny === "object") {
      TextInputAny.defaultProps = TextInputAny.defaultProps || {}
      TextInputAny.defaultProps.style = [baseStyle, TextInputAny.defaultProps.style]
    }
  } catch {
    // React 19 에서 forwardRef 컴포넌트의 defaultProps 가 frozen 인 경우 무시
  }
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Pretendard: require("../assets/fonts/PretendardVariable.ttf"),
    ...FontAwesome.font,
  })
  const [showSplash, setShowSplash] = useState(true)
  const [appReady, setAppReady] = useState(false)
  const fadeAnim = useRef(new Animated.Value(1)).current
  const dismissed = useRef(false)

  // 폰트 로딩 실패(특히 Expo 웹은 6000ms 타임아웃 잦음)해도 앱을 크래시시키지 않음.
  // 시스템 폰트로 폴백하고 정상 진행. (이전엔 throw error → 전체 ErrorBoundary 크래시)
  useEffect(() => {
    if (error) console.warn("[fonts] 폰트 로딩 실패 — 시스템 폰트로 진행:", error?.message ?? error)
  }, [error])

  // 마운트 즉시: 네이티브 스플래시 숨기고 스마일 오버레이가 이어받음
  useEffect(() => {
    SplashScreen.hideAsync()
    loadPlazaLabels()
  }, [])

  // 폰트 로드 완료 OR 실패(error) → prefetch 후 앱 준비 (폰트 실패해도 멈추지 않음)
  useEffect(() => {
    if (!loaded && !error) return
    applyGlobalFontDefaults()
    startPrefetch().then(() => setAppReady(true)).catch(() => setAppReady(true))
  }, [loaded, error])

  // 1초 후 dismiss 시도 (스마일 애니메이션 보여준 뒤)
  // appReady 는 설정하지 않음 — 폰트+prefetch useEffect 가 담당
  useEffect(() => {
    const timer = setTimeout(() => {
      tryDismiss()
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  // 안전장치: 2.5초 후 강제 dismiss (흰 화면 갇힘 방지)
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppReady(true)
      tryDismiss()
    }, 2500)
    return () => clearTimeout(timer)
  }, [])

  const tryDismiss = useCallback(() => {
    if (dismissed.current) return
    dismissed.current = true
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowSplash(false))
  }, [fadeAnim])

  return (
    <>
      {appReady && <AppProviders />}
      {showSplash && (
        <Animated.View style={[splashStyles.overlay, { opacity: fadeAnim }]}>
          <LottieView
            source={require("../assets/animations/splash-smile.json")}
            autoPlay
            loop={false}
            speed={1.5}
            style={splashStyles.splashLottie}
          />
        </Animated.View>
      )}
    </>
  )
}

function AppProviders() {
  // QueryClient 인스턴스는 앱 라이프타임 동안 한 번만 생성
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </QueryClientProvider>
  )
}

/** 도메인 리스트 라우트 — DomainTabBar 탭 전환 시 animation: "none" 적용 대상 */
const DOMAIN_ROUTES = new Set([
  "property", "requests", "interior", "moving", "cleaning", "repair",
  "service-requests", "secondhand", "sharing", "group-buying",
  "local-food", "new-store", "jobs", "clubs",
])

function RootLayoutNav() {
  const colorScheme = useColorScheme()
  const { session, loading } = useAuth()
  // 푸시 알림 등록 — 로그인된 사용자만 (expo-notifications 미설치 시 silent)
  usePushNotifications(session?.user?.id ?? null)
  // 방문자 추적 — 앱 시작 시 1회 (5분 dedupe)
  useVisitorTrack("/app")
  // H14: 오프라인 배너
  const isOffline = useNetworkStatus()
  const router = useRouter()
  const segments = useSegments()
  // 🚀 cold start 최적화 — 기본 false 로 시작해 첫 paint 차단 안 함.
  // 점검 모드는 드물게 발생하므로, 잠시 일반 화면 노출 후 flip 되는 게 모든 사용자가
  // 매번 ActivityIndicator 200~500ms 보는 것보다 ROI 가 큼.
  const [maintenance, setMaintenance] = useState<boolean>(false)

  // 앱 cold start 때 1회만 허브(지역 선택)로 보내기 위한 가드
  const didColdStartRef = useRef(false)

  // H13: Android 뒤로가기 — 홈 탭에서 뒤로가면 2번 탭 시 종료, 그 외엔 뒤로 이동
  const backPressRef = useRef(false)
  useEffect(() => {
    if (Platform.OS !== "android") return
    const handler = () => {
      // 홈 탭(첫 화면)에서 뒤로가기 → "한 번 더 누르면 종료" 토스트
      const isHome = segments[0] === "(tabs)" && (segments.length <= 1 || segments[1] === "index")
      if (isHome) {
        if (backPressRef.current) {
          BackHandler.exitApp()
          return true
        }
        backPressRef.current = true
        ToastAndroid.show("뒤로 한번 더 누르면 종료됩니다", ToastAndroid.SHORT)
        setTimeout(() => { backPressRef.current = false }, 2000)
        return true
      }
      // 다른 화면 — expo-router 기본 동작 (뒤로가기)
      return false
    }
    const sub = BackHandler.addEventListener("hardwareBackPress", handler)
    return () => sub.remove()
  }, [segments])

  // 유지보수 모드 — site_settings.maintenance_mode (web middleware 와 동일).
  // 백그라운드 fetch — 결과가 true 일 때만 화면 전환.
  // ⚡ cold start 최적화: 첫 인터랙션 이후 실행 (점검 모드는 드물어 지연 OK)
  useEffect(() => {
    let alive = true
    const task = InteractionManager.runAfterInteractions(() => {
      ;(async () => {
        try {
          const { data } = await getSupabase()
            .from("site_settings")
            .select("value")
            .eq("key", "maintenance_mode")
            .maybeSingle()
          const v = (data as any)?.value
          const on = v === true || v === "true" || (v && (v as any).enabled === true)
          if (alive && on) setMaintenance(true)
        } catch {
          // 네트워크 실패 시 그대로 false — 앱 정상 동작
        }
      })()
    })
    return () => { alive = false; task.cancel() }
  }, [])

  // ── 앱 버전 강제 업데이트 체크 (plaza_settings.app_version) ──
  // 스플래시 이후, 한 번만 실행. 개발 빌드(__DEV__)에서는 건너뜀.
  // ⚡ cold start 최적화: 첫 인터랙션 이후 실행 (업데이트 체크는 몇 초 늦어도 무방)
  useEffect(() => {
    if (__DEV__) return
    let alive = true
    const task = InteractionManager.runAfterInteractions(() => {
      ;(async () => {
        try {
          const plaza = await AsyncStorage.getItem("selected.plaza")
          if (!plaza) return
          const { data } = await getSupabase()
            .from("plaza_settings")
            .select("value")
            .eq("plaza_id", plaza)
            .eq("key", "app_version")
            .maybeSingle()
          if (!alive || !data?.value) return
          const config = typeof data.value === "string" ? JSON.parse(data.value) : data.value
          if (!config.force_update || !config.minimum_version) return

          const appVersion =
            Constants.expoConfig?.version ?? Constants.manifest?.version ?? "0.0.0"

          // Semver comparison: returns true if current < minimum
          const isOlder = (current: string, minimum: string): boolean => {
            const cur = current.split(".").map(Number)
            const min = minimum.split(".").map(Number)
            for (let i = 0; i < Math.max(cur.length, min.length); i++) {
              const c = cur[i] ?? 0
              const m = min[i] ?? 0
              if (c < m) return true
              if (c > m) return false
            }
            return false
          }

          if (isOlder(appVersion, config.minimum_version)) {
            const message =
              config.update_message || "새로운 버전이 출시되었습니다. 업데이트해주세요."
            const showUpdateAlert = () => {
              Alert.alert("업데이트 필요", message, [
                {
                  text: "업데이트",
                  onPress: () => {
                    const iosUrl = process.env.EXPO_PUBLIC_IOS_APP_STORE_URL || ""
                    const androidUrl = "https://play.google.com/store/apps/details?id=app.jeonwondiary.mobile"
                    const storeUrl = Platform.OS === "ios" ? iosUrl : androidUrl
                    if (storeUrl) {
                      Linking.openURL(storeUrl).catch(() => {})
                    } else {
                      Alert.alert("안내", "앱 스토어 등록 준비 중입니다. 잠시 후 다시 시도해주세요.")
                    }
                    // 스토어에서 돌아온 뒤에도 업데이트 안 했으면 재표시
                    setTimeout(showUpdateAlert, 3000)
                  },
                },
              ],
              // 뒤로가기/배경 터치로 닫기 방지
              { cancelable: false })
            }
            showUpdateAlert()
          }
        } catch {
          // 네트워크 실패 시 무시 — 앱 정상 동작
        }
      })()
    })
    return () => { alive = false; task.cancel() }
  }, [])

  // 첫 진입: 항상 (tabs) — 배민스타일 홈에서 광장 선택 가능.
  // 자동 로그인 강제 redirect 는 제거 (web 처럼 비로그인 브라우징 허용).
  useEffect(() => {
    if (loading) return

    // 앱 첫 진입(cold start): 항상 허브(지역 선택) 화면으로.
    // 단, 로그인 흐름/딥링크(특정 화면 직접 진입)는 예외.
    if (!didColdStartRef.current) {
      didColdStartRef.current = true
      const onAuthCold = segments[0] === "auth"
      const isLandingRoute = !segments[0] || segments[0] === "(tabs)"
      if (!onAuthCold && isLandingRoute) {
        router.replace("/hub")
        return
      }
    }

    let cancelled = false
    const cleanupTimers: ReturnType<typeof setTimeout>[] = []
    ;(async () => {
      const stored = await AsyncStorage.getItem("selected.plaza")
      if (cancelled) return
      const onAuth = segments[0] === "auth"
      // 비밀번호 변경/찾기 페이지 — 로그인 상태에서도 머물러야 함 (마이페이지 → 설정에서 진입)
      const onPasswordFlow =
        onAuth &&
        (segments[1] === "change-password" || segments[1] === "reset-password")

      // 로그인 직후 → 광장 통합 인증: plaza_profiles 자동 생성 후 tabs 이동
      if (session && onAuth && !onPasswordFlow) {
        const userId = session.user?.id
        const cachedPlaza = stored
        if (userId && cachedPlaza) {
          try {
            const supabase = getSupabase()
            // plaza_profiles 자동 생성 + profiles.location 병렬 조회
            const { ensurePlazaProfile } = await import("@gwangjang/features/profile/ensure-plaza-profile")
            const [, profRes] = await Promise.all([
              ensurePlazaProfile(supabase, userId, cachedPlaza),
              supabase
                .from("profiles")
                .select("location")
                .eq("id", userId)
                .maybeSingle(),
            ])
            if (cancelled) return
            router.replace("/(tabs)")
            const loc = ((profRes as any)?.data as any)?.location as string | undefined
            if (!loc || !loc.trim()) {
              const t = setTimeout(() => {
                if (!cancelled) router.push("/onboarding/region" as any)
              }, 100)
              cleanupTimers.push(t)
            }
          } catch {
            router.replace("/(tabs)")
          }
        } else {
          router.replace("/(tabs)")
        }
        return
      }
      // 배민스타일 홈 — 광장 미선택이어도 (tabs) 유지 (홈에서 직접 광장 선택)
      // 기본 광장(chuncheon) 이 plaza.ts DEFAULT_PLAZA_FALLBACK 으로 자동 설정됨
    })()
    return () => {
      cancelled = true
      cleanupTimers.forEach(clearTimeout)
    }
  }, [session, loading, segments, router])

  // plaza listener 워밍업 — startPrefetch() 에서 이미 loadSelectedPlaza() 호출됨.
  // 여기서는 prefetch 완료 후 listener 만 보장하는 역할.
  // (loadSelectedPlaza 는 내부 캐시가 있으므로 중복 호출 시 즉시 반환)
  useEffect(() => { loadSelectedPlaza() }, [])

  if (maintenance) {
    return (
      <View style={maintStyles.wrap}>
        <Text style={maintStyles.title}>점검 중입니다</Text>
        <Text style={maintStyles.body}>
          서비스 점검 중입니다.{"\n"}잠시 후 다시 시도해주세요.
        </Text>
      </View>
    )
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      {/* 상단 상태바: 테마에 맞춰 아이콘 색 동적 — light=다크 아이콘, dark=라이트 아이콘 */}
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      {/* H14: 오프라인 배너 — 상태바 높이만큼 상단 패딩 (노치/상태바 가림 방지) */}
      {isOffline && (
        <View style={{ backgroundColor: "#ef4444", paddingTop: (Constants.statusBarHeight || 0) + 6, paddingBottom: 6, paddingHorizontal: 16, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
            인터넷 연결이 불안정합니다
          </Text>
        </View>
      )}
      {/* NaverMapView 워밍업 — 광장 중심 좌표 타일 미리 SDK 캐시에 적재.
          매물 상세 진입 시 타일 fetch 자체가 발생 안 함 = "그리드" 시간 단축. */}
      <NaverMapWarmup />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={kbAvoidStyle}
      >
      <Stack screenOptions={({ route }) => ({
        headerShown: false,
        // 도메인 탭 전환(DomainTabBar) 시 애니메이션 제거 — 즉시 교체 느낌
        ...(DOMAIN_ROUTES.has(route.name.split("/")[0]) ? { animation: "none" as const } : {}),
      })}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="auth/change-password" options={{ headerShown: false }} />
        <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="support/faq" options={{ headerShown: false }} />
        <Stack.Screen name="support/notice" options={{ headerShown: false }} />
        <Stack.Screen name="support/notice-detail" options={{ headerShown: false }} />
        <Stack.Screen name="support/support" options={{ headerShown: false }} />
        <Stack.Screen name="support/points-guide" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="news" options={{ headerShown: false }} />
        <Stack.Screen name="hub" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding/region"
          options={{
            headerShown: false,
            gestureEnabled: false,
            presentation: "transparentModal",
            animation: "fade",
          }}
        />
        <Stack.Screen name="webview" options={{ headerShown: false }} />
        {/*
          mypage/* 라우트들은 mypage/_layout.tsx 가 자동 등록하므로
          여기에 다시 등록하면 expo-router 가 워닝. 절대 추가하지 말 것.
          (subscription/settlement/credits/verify/account-upgrade/edit/...)
        */}
        <Stack.Screen
          name="chat/[roomId]/invite-expert"
          options={{
            headerShown: false,
            presentation: "transparentModal",
            animation: "fade",
          }}
        />
        <Stack.Screen name="bump-tickets" options={{ headerShown: false }} />
        <Stack.Screen name="invitations" options={{ headerShown: false }} />
        <Stack.Screen name="gas-stations" options={{ headerShown: false }} />
        <Stack.Screen name="toilets" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
      </KeyboardAvoidingView>
    </ThemeProvider>
  )
}

/** KeyboardAvoidingView 에 인라인 객체 대신 안정 참조 사용 — 불필요한 리렌더 방지 */
const kbAvoidStyle = { flex: 1 } as const

const splashStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  splashLottie: {
    width: 360,
    height: 360,
    marginBottom: 100,
  },
})

const maintStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: lightColors.ink900,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: lightColors.ink500,
    textAlign: "center",
    lineHeight: 20,
  },
})
