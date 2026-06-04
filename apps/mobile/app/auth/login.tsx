/**
 * 로그인 — 광장 web auth/login/page.tsx 1:1 RN 미러.
 *
 * 정독 매핑 (apps/web/app/(auth)/auth/login/page.tsx):
 *   - 헤더: ← 로그인
 *   - Card: 로고 박스 + "{plazaName}에 오신 것을 환영합니다" + "이메일로 로그인하세요"
 *   - 이메일 / 비밀번호 (eye toggle) input
 *   - 파란 "로그인" 버튼
 *   - "또는" divider
 *   - 노란 카카오 로그인 버튼 (#FEE500 + bubble icon)
 *   - "계정이 없으신가요? 회원가입" 링크
 */

import { useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { useAuth } from "@/lib/auth-context"

function KakaoLogo({ size = 18 }: { size?: number }) {
  return <Ionicons name="chatbubble" size={size} color="#191919" />
}

export default function LoginScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { signIn, signInWithKakao } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [kakaoLoading, setKakaoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해주세요")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("올바른 이메일 형식이 아닙니다")
      return
    }
    setLoading(true)
    setError(null)
    const result = await signIn(email.trim(), password)
    setLoading(false)
    if (result.error) {
      setError("이메일 또는 비밀번호가 일치하지 않습니다")
      return
    }
    router.replace("/(tabs)")
  }

  async function handleKakaoLogin() {
    setKakaoLoading(true)
    setError(null)
    const result = await signInWithKakao()
    setKakaoLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.replace("/(tabs)")
  }

  function handleBack() {
    if (router.canGoBack()) router.back()
    else router.replace("/hub" as any)
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header — 홈으로 돌아가기 */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={8} style={styles.backLink}>
          <Ionicons name="chevron-back" size={18} color={lightColors.ink500} />
          <Text style={styles.backLinkText}>홈으로 돌아가기</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            {/* Logo box */}
            <View style={styles.logoBox}>
              <Image source={require("../../assets/images/logo-farmer.jpg")} style={styles.logoImg} contentFit="cover" />
            </View>

            <Text style={styles.title}>로그인</Text>
            <Text style={styles.subtitle}>이메일로 로그인하세요</Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 이메일 */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Ionicons name="mail-outline" size={15} color={lightColors.primary} />
                <Text style={styles.label}>이메일</Text>
              </View>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="example@email.com"
                placeholderTextColor="#94a3b8"
                editable={!loading}
                accessibilityLabel="이메일 입력"
              />
            </View>

            {/* 비밀번호 */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Ionicons name="lock-closed-outline" size={15} color={lightColors.primary} />
                <Text style={styles.label}>비밀번호</Text>
              </View>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, { paddingRight: 40, flex: 1 }]}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="비밀번호를 입력하세요"
                  placeholderTextColor="#94a3b8"
                  editable={!loading}
                  onSubmitEditing={handleLogin}
                  accessibilityLabel="비밀번호 입력"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#64748b"
                  />
                </Pressable>
              </View>
            </View>

            {/* 로그인 버튼 */}
            <Pressable
              style={({ pressed }) => [
                styles.loginBtn,
                pressed && { opacity: 0.85 },
                loading && { opacity: 0.6 },
              ]}
              onPress={handleLogin}
              disabled={loading}
              accessibilityLabel="로그인"
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginBtnText}>로그인</Text>
              )}
            </Pressable>

            {/* 또는 divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>또는</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* 카카오 */}
            <Pressable
              style={({ pressed }) => [
                styles.kakaoBtn,
                pressed && { opacity: 0.85 },
                kakaoLoading && { opacity: 0.6 },
              ]}
              onPress={handleKakaoLogin}
              disabled={kakaoLoading}
            >
              {kakaoLoading ? (
                <ActivityIndicator color="#191919" size="small" />
              ) : (
                <KakaoLogo size={18} />
              )}
              <Text style={styles.kakaoBtnText}>카카오로 로그인</Text>
            </Pressable>

            {/* 비밀번호 찾기 */}
            <Pressable
              onPress={() => router.push("/auth/reset-password" as any)}
              style={styles.forgotBtn}
              hitSlop={6}
            >
              <Text style={styles.forgotText}>비밀번호를 잊으셨나요?</Text>
            </Pressable>

            {/* 회원가입 링크 */}
            <View style={styles.signUpRow}>
              <Text style={styles.signUpText}>아직 회원이 아니신가요? </Text>
              <Pressable onPress={() => router.push("/auth/sign-up" as any)}>
                <Text style={styles.signUpLink}>회원가입</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f6f0" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 52,
  },
  backLink: { flexDirection: "row", alignItems: "center", gap: 2, padding: 6 },
  backLinkText: { fontSize: 14, fontWeight: "700", color: colors.ink500 },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing[4],
  },

  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  logoBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(34,90,57,0.2)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  logoImg: { width: "100%", height: "100%" },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.primary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: colors.ink500,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 24,
  },

  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, color: "#dc2626" },

  field: { marginBottom: 16 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink900,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink900,
    backgroundColor: "#f8fafc",
    minHeight: 42,
  },
  passwordWrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  loginBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
    minHeight: 44,
    justifyContent: "center",
  },
  loginBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  dividerText: { fontSize: 11, color: "#94a3b8", fontWeight: "500", textTransform: "uppercase" },

  kakaoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEE500",
    borderRadius: 8,
    paddingVertical: 12,
    minHeight: 44,
  },
  kakaoBtnText: {
    color: "#191919",
    fontSize: 14,
    fontWeight: "600",
  },

  signUpRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  signUpText: { fontSize: 13, color: colors.ink500 },
  signUpLink: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  forgotBtn: { alignItems: "center", paddingVertical: 8 },
  forgotText: { fontSize: 13, color: colors.ink500 },
})
}

const styles = makeStyles(lightColors)
