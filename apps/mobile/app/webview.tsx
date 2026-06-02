/**
 * 웹뷰 화면 — RN 으로 아직 마이그레이션 안 된 web 화면 (관리자 페이지 등) 용.
 *
 * 사용:
 *   router.push(`/webview?url=${encodeURIComponent('https://www.gwangjang.app/admin')}&title=관리자`)
 *
 * native (APK): react-native-webview 로 embed
 * web (Expo web): 새 탭 열고 즉시 닫기
 */

import { useEffect } from "react"
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize } from "@gwangjang/tokens"

// WebView 가 열 수 있는 호스트 화이트리스트 — 외부 phishing 사이트가
// deep link (gwangjang://webview?url=https://evil.com) 로 흘러들지 않도록.
// 운영 도메인 + 광장 서브도메인 + 토스/카카오 결제 호스트만 허용.
const ALLOWED_HOSTS = [
  "gwangjang.app",
  "www.gwangjang.app",
  ".gwangjang.app",            // 광장 서브도메인 (chuncheon.gwangjang.app 등)
  "gwangjang.vercel.app",      // Vercel 기본 도메인
  "accounts.kakao.com",
  "kauth.kakao.com",
  "tosspayments.com",
  ".tosspayments.com",
  "toss.im",
  ".toss.im",
]
/** Vercel 미리보기 배포: gwangjang-<hash>.vercel.app 만 허용 (임의 .vercel.app 차단) */
function isGwangjangVercelPreview(host: string): boolean {
  return host.startsWith("gwangjang-") && host.endsWith(".vercel.app")
}
function isAllowedWebViewUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:") return false
    const host = u.hostname.toLowerCase()
    return (
      ALLOWED_HOSTS.some((h) =>
        h.startsWith(".") ? host.endsWith(h) : host === h,
      ) || isGwangjangVercelPreview(host)
    )
  } catch {
    return false
  }
}

export default function WebViewScreen() {
  const router = useRouter()
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>()
  const rawUrl = typeof url === "string" ? url : ""
  const targetUrl = isAllowedWebViewUrl(rawUrl) ? rawUrl : ""
  const headerTitle = typeof title === "string" && title ? title : "광장 웹"

  // web 환경: WebView 대신 새 탭 (CORS / iframe 제약 회피)
  useEffect(() => {
    if (Platform.OS === "web" && targetUrl && typeof window !== "undefined") {
      window.open(targetUrl, "_blank")
      router.back()
    }
  }, [targetUrl, router])

  if (!targetUrl) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}>
          <Text style={styles.errorText}>URL이 없습니다</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (Platform.OS === "web") {
    // 새 탭으로 이동 처리 중
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={lightColors.primary} />
          <Text style={styles.hint}>새 탭에서 여는 중...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // native: WebView (lazy require — web 번들에 포함 방지)
  const WebView = require("react-native-webview").WebView

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={{ width: 36 }} />
      </View>
      <WebView
        source={{ uri: targetUrl }}
        style={{ flex: 1 }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={lightColors.primary} />
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    backgroundColor: "#ffffff",
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loading: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  errorText: { fontSize: fontSize.md, color: lightColors.ink500 },
  hint: { fontSize: fontSize.sm, color: lightColors.ink500, marginTop: 12 },
})
