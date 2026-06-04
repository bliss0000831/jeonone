/**
 * 비밀번호 찾기 — Supabase resetPasswordForEmail.
 * 이메일로 reset 링크 전송 → 사용자가 클릭 → recovery deep link → change-password.
 */

import { useState } from "react"
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"

const REDIRECT_URL = "jeonwondiary://auth/change-password"

export default function ResetPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    if (!email.trim()) {
      Alert.alert("이메일 필요", "이메일을 입력해주세요")
      return
    }
    setLoading(true)
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: REDIRECT_URL,
    })
    setLoading(false)
    if (error) {
      Alert.alert("전송 실패", error.message || "메일 전송에 실패했습니다")
      return
    }
    setSent(true)
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>비밀번호 찾기</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.body}>
          {sent ? (
            <View style={styles.successWrap}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
              </View>
              <Text style={styles.successTitle}>메일을 발송했습니다</Text>
              <Text style={styles.successBody}>
                {email} 으로{"\n"}
                비밀번호 재설정 링크를 보냈습니다.{"\n"}
                메일을 확인해주세요. (스팸함도 확인)
              </Text>
              <Pressable
                onPress={() => router.replace("/auth/login" as any)}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>로그인 페이지로</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.formWrap}>
              <Text style={styles.helperText}>
                가입 시 사용한 이메일을 입력하시면{"\n"}
                비밀번호 재설정 링크를 보내드립니다.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>이메일</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email@example.com"
                  placeholderTextColor={lightColors.ink500}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={loading || !email.trim()}
                style={({ pressed }) => [
                  styles.submitBtn,
                  (loading || !email.trim() || pressed) && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.submitBtnText}>
                  {loading ? "전송 중..." : "재설정 메일 보내기"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                hitSlop={8}
                style={styles.linkBtn}
              >
                <Text style={styles.linkText}>로그인으로 돌아가기</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  headerBtn: { width: 36, padding: 6 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  body: { flex: 1, padding: spacing[4] },
  formWrap: { gap: spacing[4], marginTop: spacing[6] },
  helperText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    lineHeight: 22,
  },
  field: { gap: spacing[2] },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: lightColors.ink900 },
  input: {
    height: 48,
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.md,
    fontSize: fontSize.md,
    color: lightColors.ink900,
    backgroundColor: lightColors.background,
  },
  submitBtn: {
    height: 48,
    backgroundColor: lightColors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[2],
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  linkBtn: { alignItems: "center", paddingVertical: spacing[2] },
  linkText: {
    fontSize: fontSize.sm,
    color: lightColors.primary,
  },
  successWrap: { alignItems: "center", marginTop: spacing[10], gap: spacing[3] },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  successBody: {
    textAlign: "center",
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    lineHeight: 22,
  },
  secondaryBtn: {
    height: 44,
    paddingHorizontal: spacing[5],
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[3],
  },
  secondaryBtnText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
})
