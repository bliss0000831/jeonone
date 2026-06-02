/**
 * 서비스 요청(도와주세요) 수정 — new.tsx 폼 동일 + prefill + UPDATE.
 */

import { useEffect, useRef, useState } from "react"
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
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { DatePickerField } from "@/components/DatePickerField"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const EMERALD = "#10b981"

const SERVICE_TYPES = [
  { key: "interior", label: "인테리어" },
  { key: "moving", label: "이사" },
  { key: "cleaning", label: "청소" },
  { key: "repair", label: "수리" },
] as const

export default function ServiceRequestEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const loadedRef = useRef(false)
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    if (!id) return
    const supabase = getSupabase()
    supabase
      .from("service_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setServiceType(data.service_type || "")
          setTitle(data.title || "")
          setContent(data.content || "")
          setRegion(data.region || "")
          setDistrict(data.district || "")
          setDong(data.dong || "")
          setBudgetMin(data.budget_min ? String(data.budget_min / 10000) : "")
          setBudgetMax(data.budget_max ? String(data.budget_max / 10000) : "")
          setDesiredDate(data.desired_date || "")
          setRegionId((data as any).region_id ?? null)
        }
        setLoading(false)
        loadedRef.current = true
      })
  }, [id])

  useEffect(() => {
    if (loadedRef.current) setFormDirty(true)
  }, [title, content])

  async function handleSubmit() {
    if (submitting || !id) return
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
        service_type: serviceType,
        title: title.trim(),
        content: content.trim(),
        region: region.trim() || null,
        district: district.trim() || null,
        dong: dong.trim() || null,
        budget_min: budgetMin ? Number(budgetMin) * 10000 : null,
        budget_max: budgetMax ? Number(budgetMax) * 10000 : null,
        desired_date: desiredDate || null,
      }

      const { error } = await supabase
        .from("service_requests")
        .update(payload)
        .eq("id", id)

      if (error) {
        Alert.alert("수정 실패", error.message)
        return
      }
      await setPostRegion("service_requests", id, regionId)
      Alert.alert("수정 완료", "서비스 요청이 수정되었습니다")
      setFormDirty(false)
      router.replace(`/service-requests/${id}` as any)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={EMERALD} />
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
          <Text style={styles.headerTitle}>서비스 요청 수정</Text>
        </View>
        <Pressable onPress={handleSubmit} disabled={submitting} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>저장</Text>
          )}
        </Pressable>
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
            skipAutoDefault
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
  saveBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md,
    backgroundColor: EMERALD, minWidth: 60, alignItems: "center",
  },
  saveBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

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
})
