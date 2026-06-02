/**
 * 정산 계좌 — 광장 web /mypage/settlement 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 + 뒤로가기 (← 판매 관리)
 *   - amber 안내 callout (본인 명의 계좌)
 *   - 폼: 은행 select / 계좌번호 / 예금주 / 사업자등록번호 (선택)
 *   - 인증 상태 표시
 *   - 저장 버튼 (sticky)
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { BANK_CODES } from "@gwangjang/features/billing"
import { gwangjangFetch } from "@/lib/supabase"

export default function SettlementScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verified, setVerified] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [form, setForm] = useState({
    bank_code: "",
    bank_account: "",
    account_holder: "",
    business_number: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await gwangjangFetch("/api/producer-settlement", {
          method: "GET",
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled || !data.settlement) return
        setForm({
          bank_code: data.settlement.bank_code || "",
          bank_account: data.settlement.bank_account || "",
          account_holder: data.settlement.account_holder || "",
          business_number: data.settlement.business_number || "",
        })
        setVerified(!!data.settlement.is_verified)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function submit() {
    setError(null)
    if (!form.bank_code || !form.bank_account || !form.account_holder) {
      setError("은행/계좌번호/예금주는 필수입니다")
      return
    }
    setSaving(true)
    try {
      const bank_name = BANK_CODES.find((b) => b.code === form.bank_code)?.name || ""
      const res = await gwangjangFetch("/api/producer-settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, bank_name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "저장 실패")
        return
      }
      setSavedAt(new Date().toLocaleTimeString("ko-KR"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  const selectedBank = BANK_CODES.find((b) => b.code === form.bank_code)

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>정산 계좌</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing[4], paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroRow}>
            <Ionicons name="cash-outline" size={24} color="#059669" />
            <Text style={styles.heroTitle}>정산 계좌</Text>
          </View>

          <View style={styles.callout}>
            <Ionicons name="shield-outline" size={16} color="#b45309" style={{ marginTop: 2 }} />
            <Text style={styles.calloutText}>
              구매확정된 주문의 정산금이 입금될 계좌입니다. 본인 명의 계좌만 등록 가능하며, 실제 입금은 PortOne·은행 인증 도입 후 시작됩니다.
            </Text>
          </View>

          {/* 은행 */}
          <Field label="은행 *">
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={styles.select}
            >
              <Text
                style={[
                  styles.selectText,
                  !selectedBank && { color: lightColors.ink500 },
                ]}
              >
                {selectedBank ? selectedBank.name : "선택"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={lightColors.ink500} />
            </Pressable>
          </Field>

          {/* 계좌번호 */}
          <Field label="계좌번호 * (숫자만)">
            <TextInput
              style={[styles.input, { fontFamily: "monospace" }]}
              value={form.bank_account}
              onChangeText={(v) =>
                setForm((f) => ({ ...f, bank_account: v.replace(/[^0-9]/g, "") }))
              }
              placeholder="-없이 숫자만"
              placeholderTextColor={lightColors.ink500}
              keyboardType="numeric"
            />
          </Field>

          <Field label="예금주 *">
            <TextInput
              style={styles.input}
              value={form.account_holder}
              onChangeText={(v) => setForm((f) => ({ ...f, account_holder: v }))}
              placeholder="본인 명의"
              placeholderTextColor={lightColors.ink500}
            />
          </Field>

          <Field label="사업자등록번호 (선택)" helper="미등록 시 연 매출 한도가 적용될 수 있습니다.">
            <TextInput
              style={[styles.input, { fontFamily: "monospace" }]}
              value={form.business_number}
              onChangeText={(v) =>
                setForm((f) => ({ ...f, business_number: v.replace(/[^0-9]/g, "") }))
              }
              placeholder="없으면 비워둠"
              placeholderTextColor={lightColors.ink500}
              keyboardType="numeric"
            />
          </Field>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {savedAt && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✅ {savedAt} 에 저장되었습니다</Text>
            </View>
          )}

          <View style={styles.statusRow}>
            <Text style={styles.muted}>인증 상태:</Text>
            {verified ? (
              <Text style={[styles.muted, { color: "#059669", fontWeight: "700" }]}>인증됨</Text>
            ) : (
              <Text style={styles.muted}>미인증 (인증 도입 후 자동 처리)</Text>
            )}
          </View>
        </ScrollView>

        <View style={styles.saveBar}>
          <Pressable
            onPress={submit}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              (saving || pressed) && { opacity: 0.85 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveText}>저장</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* 은행 선택 모달 */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>은행 선택</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {BANK_CODES.map((b) => {
                const active = b.code === form.bank_code
                return (
                  <Pressable
                    key={b.code}
                    onPress={() => {
                      setForm((f) => ({ ...f, bank_code: b.code }))
                      setPickerOpen(false)
                    }}
                    style={({ pressed }) => [
                      styles.bankItem,
                      active && { backgroundColor: "rgba(59,130,246,0.08)" },
                      pressed && !active && { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.bankItemText,
                        active && { color: lightColors.primary, fontWeight: "700" },
                      ]}
                    >
                      {b.name}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={lightColors.primary} />}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function Field({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: React.ReactNode
}) {
  return (
    <View style={{ marginBottom: spacing[4] }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: {
    flex: 1,
    backgroundColor: lightColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  back: { padding: 6, width: 36 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing[3] },
  heroTitle: { fontSize: fontSize.xl, fontWeight: "700", color: lightColors.ink900 },
  callout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    marginBottom: spacing[5],
  },
  calloutText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#b45309",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: lightColors.ink900,
    marginBottom: 6,
  },
  input: {
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  selectText: { fontSize: fontSize.sm, color: lightColors.ink900 },
  helper: { fontSize: 11, color: lightColors.ink500, marginTop: 4 },
  errorBox: {
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    backgroundColor: "rgba(244,63,94,0.08)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.3)",
    marginBottom: spacing[3],
  },
  errorText: { fontSize: fontSize.sm, color: "#e11d48" },
  successBox: {
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
    marginBottom: spacing[3],
  },
  successText: { fontSize: fontSize.sm, color: "#059669" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing[3],
  },
  muted: { fontSize: 12, color: lightColors.ink500 },
  saveBar: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    backgroundColor: lightColors.background,
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
  },
  saveBtn: {
    height: 48,
    backgroundColor: lightColors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { fontSize: fontSize.md, fontWeight: "700", color: "#ffffff" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing[4],
  },
  modalHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightColors.border,
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  bankItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  bankItemText: { fontSize: fontSize.sm, color: lightColors.ink900 },
})
