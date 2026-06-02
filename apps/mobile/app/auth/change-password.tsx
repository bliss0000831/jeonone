/**
 * 비밀번호 변경 — 광장 web /auth/change-password 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 비밀번호 변경)
 *   - 새 비밀번호 (6자 이상) + 눈 아이콘 토글
 *   - 비밀번호 확인 + 눈 아이콘 토글
 *   - 에러 메시지
 *   - 변경 버튼 (supabase.auth.updateUser)
 *   - 성공 시 setting 페이지로 자동 이동
 */

import { useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"

export default function ChangePasswordScreen() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  // 강도 검증 — 8자 이상 + 영문 + 숫자 포함 (web 과 동일 톤)
  function validatePassword(pw: string): string | null {
    if (pw.length < 8) return "비밀번호는 8자 이상이어야 합니다."
    if (!/[A-Za-z]/.test(pw)) return "영문을 1자 이상 포함해야 합니다."
    if (!/[0-9]/.test(pw)) return "숫자를 1자 이상 포함해야 합니다."
    return null
  }

  async function handleSubmit() {
    setError("")
    if (!currentPassword) {
      setError("현재 비밀번호를 입력해주세요.")
      return
    }
    const pwErr = validatePassword(newPassword)
    if (pwErr) {
      setError(pwErr)
      return
    }
    if (newPassword !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }
    setLoading(true)
    const supabase = getSupabase()
    // 1) 현재 비밀번호 재인증 — 탈취된 세션으로 비번 교체 차단
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setLoading(false)
      setError("로그인 상태를 확인할 수 없습니다.")
      return
    }
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (reAuthError) {
      setLoading(false)
      setError("현재 비밀번호가 올바르지 않습니다.")
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })
    setLoading(false)
    if (updateError) {
      setError("비밀번호 변경에 실패했습니다. 다시 시도해주세요.")
      return
    }
    setSuccess(true)
    setTimeout(() => router.replace("/mypage/settings" as any), 2000)
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color="#ffffff" />
        </Pressable>
        <Text style={styles.headerTitle}>비밀번호 변경</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.body}>
          {success ? (
            <View style={styles.successBox}>
              <View style={styles.successIcon}>
                <Ionicons name="lock-closed" size={32} color="#16a34a" />
              </View>
              <Text style={styles.successTitle}>비밀번호가 변경되었습니다</Text>
              <Text style={styles.successSub}>잠시 후 설정 페이지로 이동합니다.</Text>
            </View>
          ) : (
            <>
              <View style={{ gap: 8, marginTop: spacing[4] }}>
                <Text style={styles.label}>현재 비밀번호</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="현재 비밀번호 입력"
                    placeholderTextColor={lightColors.ink500}
                    secureTextEntry={!showCurrent}
                    style={styles.input}
                  />
                  <Pressable onPress={() => setShowCurrent((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
                    <Ionicons name={showCurrent ? "eye-off-outline" : "eye-outline"} size={20} color={lightColors.ink500} />
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: 8, marginTop: spacing[4] }}>
                <Text style={styles.label}>새 비밀번호</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="8자 이상, 영문+숫자 포함"
                    placeholderTextColor={lightColors.ink500}
                    secureTextEntry={!showNew}
                    style={styles.input}
                  />
                  <Pressable onPress={() => setShowNew((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
                    <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={20} color={lightColors.ink500} />
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: 8, marginTop: spacing[4] }}>
                <Text style={styles.label}>비밀번호 확인</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="비밀번호를 다시 입력해주세요"
                    placeholderTextColor={lightColors.ink500}
                    secureTextEntry={!showConfirm}
                    style={styles.input}
                  />
                  <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
                    <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={20} color={lightColors.ink500} />
                  </Pressable>
                </View>
              </View>

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <Pressable
                onPress={handleSubmit}
                disabled={loading || !newPassword || !confirmPassword}
                style={[
                  styles.submitBtn,
                  (loading || !newPassword || !confirmPassword) && { opacity: 0.5 },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>비밀번호 변경</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[3],
    backgroundColor: lightColors.primary,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: "#ffffff" },

  body: { padding: spacing[4], maxWidth: 480, alignSelf: "center", width: "100%" },
  label: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900 },

  inputWrap: { position: "relative" },
  input: {
    paddingHorizontal: spacing[4],
    paddingRight: 44,
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },

  errorText: { color: "#ef4444", fontSize: fontSize.sm, marginTop: spacing[2] },

  submitBtn: {
    marginTop: spacing[5],
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: lightColors.primary,
    alignItems: "center",
  },
  submitBtnText: { color: "#ffffff", fontWeight: "700", fontSize: fontSize.md },

  successBox: { alignItems: "center", paddingTop: spacing[6] },
  successIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#dcfce7",
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing[3],
  },
  successTitle: { fontSize: fontSize.lg, fontWeight: "700", color: lightColors.ink900, marginBottom: 4 },
  successSub: { fontSize: fontSize.sm, color: lightColors.ink500 },
})
