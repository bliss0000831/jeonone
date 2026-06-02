/**
 * 서비스 요청 작성 — 매물 요청 작성(requests/new.tsx) 미러.
 *
 * 모든 사용자가 작성 가능 (공인중개사 차단 없음).
 * service_requests 테이블에 직접 Supabase insert.
 */

import { useState } from "react"
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
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { DatePickerField } from "@/components/DatePickerField"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"

const EMERALD = "#10b981"

const SERVICE_TYPES = [
  { key: "interior", label: "인테리어" },
  { key: "moving", label: "이사" },
  { key: "cleaning", label: "청소" },
  { key: "repair", label: "수리" },
] as const

export default function ServiceRequestNewScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [submitting, setSubmitting] = useState(false)

  const [serviceType, setServiceType] = useState("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [region, setRegion] = useState("")
  const [district, setDistrict] = useState("")
  const [dong, setDong] = useState("")
  const [budgetMin, setBudgetMin] = useState("")
  const [budgetMax, setBudgetMax] = useState("")
  const [desiredDate, setDesiredDate] = useState("")
  const [regionId, setRegionId] = useState<string | null>(null)

  async function handleSubmit() {
    if (submitting) return
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    if (!serviceType) {
      Alert.alert("입력 필요", "서비스 유형을 선택해주세요")
      return
    }
    if (!title.trim() || !content.trim()) {
      Alert.alert("입력 필요", "제목과 상세 내용을 입력해주세요")
      return
    }
    setSubmitting(true)
    try {
      const supabase = getSupabase()
      const payload: Record<string, any> = {
        user_id: user.id,
        service_type: serviceType,
        title: title.trim(),
        content: content.trim(),
        region: region.trim() || null,
        district: district.trim() || null,
        dong: dong.trim() || null,
        budget_min: budgetMin ? Number(budgetMin) * 10000 : null,
        budget_max: budgetMax ? Number(budgetMax) * 10000 : null,
        desired_date: desiredDate || null,
        status: "open",
        views: 0,
      }
      if (plazaId) payload.plaza_id = plazaId

      const { data, error } = await supabase
        .from("service_requests")
        .insert(payload)
        .select("id")
        .single()

      if (error) {
        Alert.alert("등록 실패", error.message)
        return
      }
      if (data?.id) {
        await setPostRegion("service_requests", data.id, regionId)
      }
      Alert.alert("등록 완료", "서비스 요청이 등록되었습니다")
      if (data?.id) {
        router.replace(`/service-requests/${data.id}` as any)
      } else {
        router.back()
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Ionicons name="log-in-outline" size={48} color={lightColors.ink500} />
        <Text style={{ color: lightColors.ink500, marginTop: 12 }}>
          로그인이 필요합니다
        </Text>
        <Pressable
          onPress={() => router.push("/auth/login")}
          style={styles.loginBtn}
        >
          <Text style={styles.loginBtnText}>로그인</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="construct" size={18} color={EMERALD} />
          <Text style={styles.headerTitle}>서비스 요청 작성</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Field label="서비스 유형 *">
            <View style={styles.chipWrap}>
              {SERVICE_TYPES.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setServiceType((cur) => (cur === t.key ? "" : t.key))}
                  style={[
                    styles.chip,
                    serviceType === t.key
                      ? { backgroundColor: EMERALD }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: serviceType === t.key ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="예: 거실 벽지 도배 도와주세요"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
            />
          </Field>

          <Field label="상세 내용 *">
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder={"필요한 서비스를 자세히 적어주세요\n- 작업 범위\n- 원하는 일정\n- 기타 요청사항"}
              placeholderTextColor={lightColors.ink500}
              multiline
              style={[styles.input, styles.textarea]}
            />
          </Field>

          <View style={{ flexDirection: "row", gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Field label="지역">
                <TextInput
                  value={region}
                  onChangeText={setRegion}
                  placeholder="강원"
                  placeholderTextColor={lightColors.ink500}
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="시/군/구">
                <TextInput
                  value={district}
                  onChangeText={setDistrict}
                  placeholder="춘천시"
                  placeholderTextColor={lightColors.ink500}
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="동/읍/면">
                <TextInput
                  value={dong}
                  onChangeText={setDong}
                  placeholder="후평동"
                  placeholderTextColor={lightColors.ink500}
                  style={styles.input}
                />
              </Field>
            </View>
          </View>

          <RegionFormField
            plazaId={plazaId}
            userId={user?.id}
            address={[region, district, dong].filter(Boolean).join(" ")}
            value={regionId}
            onChange={setRegionId}
          />

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="예산 최소 (만원)">
                <TextInput
                  value={budgetMin}
                  onChangeText={(v) => setBudgetMin(v.replace(/[^0-9]/g, ""))}
                  placeholder="50"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="예산 최대 (만원)">
                <TextInput
                  value={budgetMax}
                  onChangeText={(v) => setBudgetMax(v.replace(/[^0-9]/g, ""))}
                  placeholder="200"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
          </View>

          <Field label="희망 서비스 날짜">
            <DatePickerField
              value={desiredDate}
              onChange={setDesiredDate}
              mode="date"
              placeholder="날짜 선택"
              clearable
            />
          </Field>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>서비스 요청 등록</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border,
  },
  headerBtn: { padding: 6 },
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },

  body: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[6] },
  label: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900, marginBottom: spacing[2] },

  input: {
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: lightColors.background, fontSize: fontSize.sm, color: lightColors.ink900,
  },
  textarea: { minHeight: 140, textAlignVertical: "top" },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  loginBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: EMERALD, marginTop: 12 },
  loginBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

  submitBtn: { paddingVertical: 14, borderRadius: radius.md, backgroundColor: EMERALD, alignItems: "center" },
  submitBtnText: { color: "#ffffff", fontWeight: "700", fontSize: fontSize.md },
})
