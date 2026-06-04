/**
 * 회원가입 — 광장 web auth/sign-up/page.tsx 1:1 RN 미러.
 *
 * 정독 매핑:
 *   - 카카오 간편 가입 (signup=1 마커)
 *   - 또는 이메일 가입: 이름 / 닉네임 / 거주지역 (광장 coverage) /
 *     휴대폰 인증 (임시 dev: alert 로 코드) / 이메일 / 비밀번호+확인
 *   - 광장별 독립 계정 — plaza_profiles row insert
 *   - profiles.sub_region 저장 (뉴스 기본 지역)
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
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
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlazaState, plazaCityName } from "@/lib/plaza"

function KakaoLogo({ size = 18 }: { size?: number }) {
  return <Ionicons name="chatbubble" size={size} color="#191919" />
}

function formatPhone(value: string): string {
  const numbers = value.replace(/[^\d]/g, "")
  if (numbers.length <= 3) return numbers
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
}

export default function SignUpScreen() {
  const router = useRouter()
  const { signIn, signInWithKakao } = useAuth()
  const plaza = useCurrentPlazaState()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [nickname, setNickname] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [coverage, setCoverage] = useState<string[]>([])
  const [subRegion, setSubRegion] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [sentCode, setSentCode] = useState("")
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [isPhoneVerified, setIsPhoneVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [kakaoLoading, setKakaoLoading] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)

  // 광장 coverage 로드
  useEffect(() => {
    if (!plaza.id) return
    const supabase = getSupabase()
    supabase
      .from("plazas")
      .select("coverage")
      .eq("id", plaza.id)
      .maybeSingle()
      .then(({ data }) => {
        const cov = (data as any)?.coverage
        if (Array.isArray(cov)) setCoverage(cov)
      })
  }, [plaza.id])

  function sendVerificationCode() {
    if (!phone || phone.replace(/[^\d]/g, "").length < 10) {
      setError("올바른 휴대폰 번호를 입력하세요")
      return
    }
    setSendingCode(true)
    setError(null)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    setSentCode(code)
    setIsCodeSent(true)
    setSendingCode(false)
    // TODO: SMS 서비스 연동 후 실제 SMS 발송으로 교체
    // 프로덕션에서는 인증번호를 화면에 노출하지 않음 (보안)
    if (__DEV__) {
      Alert.alert("개발 모드", `인증번호: ${code}`)
    } else {
      Alert.alert(
        "휴대폰 자동 인증",
        "현재 SMS 인증 준비 중이라, 입력하신 번호로 자동 인증 처리됩니다.",
      )
      // SMS 미연동 상태에서는 자동 인증 처리
      setVerificationCode(code)
      setIsPhoneVerified(true)
    }
  }

  function verifyCode() {
    if (verificationCode === sentCode) {
      setIsPhoneVerified(true)
      setError(null)
    } else {
      setError("인증번호가 일치하지 않습니다")
    }
  }

  async function handleKakaoSignUp() {
    setKakaoLoading(true)
    setError(null)
    const result = await signInWithKakao({ signup: true })
    setKakaoLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.replace("/(tabs)")
  }

  async function handleSignUp() {
    setError(null)
    if (!fullName.trim()) return setError("이름을 입력하세요")
    if (!nickname.trim()) return setError("닉네임을 입력하세요")
    if (coverage.length > 0 && !subRegion) return setError("거주 지역을 선택하세요")
    if (!isPhoneVerified) return setError("휴대폰 인증을 완료해주세요")
    if (!email.trim()) return setError("이메일을 입력하세요")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError("올바른 이메일 형식이 아닙니다")
    if (password.length < 8) return setError("비밀번호는 8자 이상이어야 합니다")
    if (!/[A-Za-z]/.test(password)) return setError("비밀번호에 영문을 포함해야 합니다")
    if (!/[0-9]/.test(password)) return setError("비밀번호에 숫자를 포함해야 합니다")
    if (password !== passwordConfirm) return setError("비밀번호가 일치하지 않습니다")

    setLoading(true)
    const supabase = getSupabase()
    // emailRedirectTo — Supabase confirm-email 활성화 시 인증 메일 링크 destination
    // web 은 origin/auth/callback 사용. native 는 deep link, web 빌드는 window.location.origin.
    let emailRedirectTo: string | undefined
    if (Platform.OS === "web" && typeof window !== "undefined") {
      emailRedirectTo = `${window.location.origin}/auth/callback`
    }
    // native: jeonwondiary://auth/callback (Supabase 화이트리스트 등록되어 있으면)

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo,
        data: {
          nickname,
          full_name: fullName,
          phone,
        },
      },
    })

    if (signUpErr) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    if (data.user) {
      // 광장 통합 인증 — plaza_profiles 자동 생성 + profiles.sub_region 저장
      try {
        if (plaza.id) {
          const { ensurePlazaProfile } = await import("@gwangjang/features/profile/ensure-plaza-profile")
          await ensurePlazaProfile(supabase, data.user.id, plaza.id)
        }
        if (subRegion) {
          await supabase
            .from("profiles")
            .update({ sub_region: subRegion })
            .eq("id", data.user.id)
        }
      } catch {}

      // 즉시 로그인
      const result = await signIn(email.trim(), password)
      setLoading(false)
      if (result.error) {
        // 이메일 인증이 켜진 환경 — 가입은 됐으나 자동 로그인 불가.
        // 개발 설정 안내 대신 사용자가 행동할 수 있는 다음 단계를 제공.
        Alert.alert(
          "회원가입 완료",
          "가입이 완료되었습니다. 이메일 인증이 필요한 경우 메일함에서 인증한 뒤 로그인해 주세요.",
          [{ text: "로그인하러 가기", onPress: () => router.replace("/auth/login" as any) }],
        )
        return
      }
      router.replace("/(tabs)")
      return
    }
    setLoading(false)
  }

  function handleBack() {
    if (router.canGoBack()) router.back()
    else router.replace("/auth/login")
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>회원가입</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.logoBox}>
              <Image source={require("../../assets/images/logo-farmer.jpg")} style={styles.logoImg} contentFit="cover" />
            </View>
            <Text style={styles.title}>{plaza.name} 회원가입</Text>
            <Text style={styles.subtitle}>더 나은 집, 더 가까운 이웃</Text>

            {/* 카카오 간편 가입 */}
            <Pressable
              style={({ pressed }) => [
                styles.kakaoBtn,
                pressed && { opacity: 0.85 },
                kakaoLoading && { opacity: 0.6 },
              ]}
              onPress={handleKakaoSignUp}
              disabled={kakaoLoading}
            >
              {kakaoLoading ? (
                <ActivityIndicator color="#191919" size="small" />
              ) : (
                <KakaoLogo size={18} />
              )}
              <Text style={styles.kakaoBtnText}>카카오로 간편 가입</Text>
            </Pressable>

            {/* 구분선 */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>또는 이메일로 가입</Text>
              <View style={styles.dividerLine} />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 이름 */}
            <View style={styles.field}>
              <Text style={styles.label}>이름</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="홍길동"
                placeholderTextColor="#94a3b8"
                editable={!loading}
                accessibilityLabel="이름 입력"
              />
            </View>

            {/* 닉네임 */}
            <View style={styles.field}>
              <Text style={styles.label}>닉네임</Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder={`${plazaCityName(plaza.name)}이웃`}
                placeholderTextColor="#94a3b8"
                editable={!loading}
                accessibilityLabel="닉네임 입력"
              />
            </View>

            {/* 거주 지역 (광장 coverage 정의된 경우) */}
            {coverage.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>거주 지역</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {coverage.map((region) => (
                    <Pressable
                      key={region}
                      onPress={() => setSubRegion(region)}
                      style={[styles.regionChip, subRegion === region && styles.regionChipActive]}
                    >
                      <Text
                        style={[
                          styles.regionChipText,
                          subRegion === region && { color: "#ffffff" },
                        ]}
                      >
                        {region}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.hint}>선택한 지역의 뉴스가 기본으로 표시됩니다</Text>
              </View>
            )}

            {/* 휴대폰 + 인증 */}
            <View style={styles.field}>
              <Text style={styles.label}>휴대폰 번호</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={phone}
                  onChangeText={(v) => setPhone(formatPhone(v))}
                  placeholder="010-1234-5678"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  editable={!isPhoneVerified}
                  accessibilityLabel="휴대폰 번호 입력"
                />
                <Pressable
                  style={[styles.verifyBtn, isPhoneVerified && styles.verifyBtnDone]}
                  onPress={sendVerificationCode}
                  disabled={sendingCode || isPhoneVerified}
                  accessibilityLabel="인증번호 요청"
                  accessibilityRole="button"
                >
                  <Text style={styles.verifyBtnText}>
                    {sendingCode
                      ? "..."
                      : isPhoneVerified
                        ? "인증완료"
                        : isCodeSent
                          ? "재전송"
                          : "인증요청"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 인증번호 */}
            {isCodeSent && !isPhoneVerified && (
              <View style={styles.field}>
                <Text style={styles.label}>인증번호</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={verificationCode}
                    onChangeText={(v) => setVerificationCode(v.replace(/[^\d]/g, "").slice(0, 6))}
                    placeholder="6자리"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    maxLength={6}
                    accessibilityLabel="인증번호 입력"
                  />
                  <Pressable
                    style={[styles.verifyBtn, verificationCode.length !== 6 && { opacity: 0.5 }]}
                    onPress={verifyCode}
                    disabled={verificationCode.length !== 6}
                    accessibilityLabel="인증번호 확인"
                    accessibilityRole="button"
                  >
                    <Text style={styles.verifyBtnText}>확인</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* 이메일 */}
            <View style={styles.field}>
              <Text style={styles.label}>이메일</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="example@email.com"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                accessibilityLabel="이메일 입력"
                editable={!loading}
              />
              {email.length > 0 && !email.includes("@") && (
                <Text style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>올바른 이메일 형식을 입력해주세요</Text>
              )}
            </View>

            {/* 비밀번호 */}
            <View style={styles.field}>
              <Text style={styles.label}>비밀번호</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, { flex: 1, paddingRight: 40 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="8자 이상"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  accessibilityLabel="비밀번호 입력"
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#64748b"
                  />
                </Pressable>
              </View>
              {password.length > 0 && password.length < 8 && (
                <Text style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>비밀번호는 8자 이상이어야 합니다</Text>
              )}
            </View>

            {/* 비밀번호 확인 */}
            <View style={styles.field}>
              <Text style={styles.label}>비밀번호 확인</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, { flex: 1, paddingRight: 40 }]}
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="비밀번호 다시 입력"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPasswordConfirm}
                  editable={!loading}
                  accessibilityLabel="비밀번호 확인 입력"
                />
                <Pressable
                  onPress={() => setShowPasswordConfirm((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPasswordConfirm ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#64748b"
                  />
                </Pressable>
              </View>
              {passwordConfirm.length > 0 && password !== passwordConfirm && (
                <Text style={styles.hintError}>비밀번호가 일치하지 않습니다</Text>
              )}
              {passwordConfirm.length > 0 && password === passwordConfirm && (
                <Text style={styles.hintOk}>비밀번호가 일치합니다</Text>
              )}
            </View>

            {/* 이용약관 동의 */}
            <Pressable
              onPress={() => setAgreedTerms((v) => !v)}
              style={styles.termsRow}
              accessibilityLabel={agreedTerms ? "이용약관 동의 해제" : "이용약관 동의"}
              accessibilityRole="checkbox"
            >
              <View style={[styles.termsCheckbox, agreedTerms && styles.termsCheckboxOn]}>
                {agreedTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.termsText}>
                <Text
                  style={styles.termsLink}
                  onPress={() => router.push("/legal/terms")}
                >
                  이용약관
                </Text>
                {" 및 "}
                <Text
                  style={styles.termsLink}
                  onPress={() => router.push("/legal/privacy")}
                >
                  개인정보처리방침
                </Text>
                {"에 동의합니다"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && { opacity: 0.85 },
                (loading || !isPhoneVerified || password !== passwordConfirm || !agreedTerms) && { opacity: 0.5 },
              ]}
              onPress={handleSignUp}
              disabled={loading || !isPhoneVerified || password !== passwordConfirm || !agreedTerms}
              accessibilityLabel="회원가입"
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>회원가입</Text>
              )}
            </Pressable>

            <View style={styles.loginRow}>
              <Text style={styles.loginRowText}>이미 계정이 있으신가요? </Text>
              <Pressable onPress={() => router.replace("/auth/login")}>
                <Text style={styles.loginRowLink}>로그인</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12, height: 56,
    borderBottomWidth: 1, borderBottomColor: "rgba(15,23,42,0.06)",
    backgroundColor: "#ffffff",
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 16, fontWeight: "600", color: lightColors.ink900 },
  scrollContent: {
    flexGrow: 1, padding: spacing[4],
  },
  card: {
    width: "100%", maxWidth: 460, alignSelf: "center",
    backgroundColor: "#ffffff", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(15,23,42,0.06)",
    padding: 24,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  logoBox: {
    width: 88, height: 88, borderRadius: 44, overflow: "hidden",
    borderWidth: 2, borderColor: "rgba(34,90,57,0.2)",
    alignItems: "center", justifyContent: "center",
    alignSelf: "center", marginBottom: 16,
  },
  logoImg: { width: "100%", height: "100%" },
  title: { fontSize: 22, fontWeight: "800", color: lightColors.ink900, textAlign: "center", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: lightColors.ink500, textAlign: "center", marginTop: 6, marginBottom: 20 },

  kakaoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#FEE500", borderRadius: 8, paddingVertical: 12, minHeight: 44,
  },
  kakaoBtnText: { color: "#191919", fontSize: 14, fontWeight: "600" },

  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  dividerText: { fontSize: 11, color: "#94a3b8", fontWeight: "500" },

  errorBox: { backgroundColor: "#fef2f2", borderRadius: 8, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13, color: "#dc2626" },

  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "500", color: lightColors.ink900, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: lightColors.ink900,
    backgroundColor: "#f8fafc", minHeight: 42,
  },
  passwordWrap: { position: "relative", flexDirection: "row", alignItems: "center" },
  eyeBtn: { position: "absolute", right: 10, height: "100%", justifyContent: "center", paddingHorizontal: 4 },
  hint: { fontSize: 11, color: lightColors.ink500, marginTop: 6 },
  hintError: { fontSize: 11, color: "#dc2626", marginTop: 6 },
  hintOk: { fontSize: 11, color: lightColors.primary, marginTop: 6 },

  regionChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc",
  },
  regionChipActive: {
    borderColor: lightColors.primary, backgroundColor: lightColors.primary,
  },
  regionChipText: { fontSize: 13, color: lightColors.ink900, fontWeight: "500" },

  verifyBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    backgroundColor: "#f1f5f9", justifyContent: "center", minHeight: 42,
  },
  verifyBtnDone: { backgroundColor: lightColors.primary + "15" },
  verifyBtnText: { fontSize: 13, fontWeight: "600", color: lightColors.ink900 },

  submitBtn: {
    backgroundColor: lightColors.primary, borderRadius: 8,
    paddingVertical: 12, alignItems: "center", marginTop: 8, minHeight: 44,
    justifyContent: "center",
  },
  submitBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },

  termsRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginTop: 14, marginBottom: 4,
  },
  termsCheckbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center", justifyContent: "center",
    marginTop: 1,
  },
  termsCheckboxOn: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  termsText: { flex: 1, fontSize: 13, color: lightColors.ink700, lineHeight: 20 },
  termsLink: { color: lightColors.primary, fontWeight: "600", textDecorationLine: "underline" },

  loginRow: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  loginRowText: { fontSize: 13, color: lightColors.ink500 },
  loginRowLink: { fontSize: 13, color: lightColors.primary, fontWeight: "600" },
})
