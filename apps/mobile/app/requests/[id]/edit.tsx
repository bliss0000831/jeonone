/**
 * 매물 요청 수정 — 광장 web /requests/[id]/edit 미러.
 * new.tsx form + prefill + PATCH /api/property-requests/[id].
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
import {
  getPropertyRequest,
  updatePropertyRequest,
  REQUEST_PROPERTY_TYPES,
  REQUEST_TRANSACTION_TYPES,
} from "@gwangjang/features/requests"
import { gwangjangFetch } from "@/lib/supabase"
import { DatePickerField } from "@/components/DatePickerField"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const ROSE = "#e11d48"

export default function PropertyRequestEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const loadedRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [region, setRegion] = useState("강원")
  const [district, setDistrict] = useState("춘천시")
  const [dong, setDong] = useState("")
  const [propertyType, setPropertyType] = useState("")
  const [transactionType, setTransactionType] = useState("")
  const [budgetMin, setBudgetMin] = useState("")
  const [budgetMax, setBudgetMax] = useState("")
  const [moveInDate, setMoveInDate] = useState("")

  useEffect(() => {
    if (!id) return
    getPropertyRequest((u, init) => gwangjangFetch(u, init as any), id).then(({ request }) => {
      if (request) {
        setTitle(request.title || "")
        setContent(request.content || "")
        setRegion(request.region || "강원")
        setDistrict(request.district || "춘천시")
        setDong(request.dong || "")
        setPropertyType(request.property_type || "")
        setTransactionType(request.transaction_type || "")
        // 원 → 만원
        setBudgetMin(request.budget_min ? String(Math.round(request.budget_min / 10000)) : "")
        setBudgetMax(request.budget_max ? String(Math.round(request.budget_max / 10000)) : "")
        setMoveInDate(request.move_in_date || "")
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
    if (!title.trim() || !content.trim()) {
      Alert.alert("입력 필요", "제목과 내용을 입력해주세요")
      return
    }
    setSubmitting(true)
    try {
      const r = await updatePropertyRequest(
        (u, init) => gwangjangFetch(u, init as any),
        id,
        {
          title: title.trim(),
          content: content.trim(),
          region: region || null,
          district: district || null,
          dong: dong || null,
          propertyType: propertyType || null,
          transactionType: transactionType || null,
          budgetMin: budgetMin ? Number(budgetMin) * 10000 : null,
          budgetMax: budgetMax ? Number(budgetMax) * 10000 : null,
          moveInDate: moveInDate || null,
        },
      )
      if (!r.ok) {
        Alert.alert("수정 실패", r.error ?? "")
        return
      }
      Alert.alert("수정 완료", "매물 요청이 수정되었습니다")
      setFormDirty(false)
      router.replace(`/requests/${id}` as any)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>매물 요청 수정</Text>
        <Pressable onPress={handleSubmit} disabled={submitting} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.saveBtnText}>저장</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Field label="제목 *">
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="거래 유형">
            <View style={styles.chipWrap}>
              {REQUEST_TRANSACTION_TYPES.map((t) => (
                <Pressable key={t} onPress={() => setTransactionType((cur) => (cur === t ? "" : t))} style={[styles.chip, transactionType === t ? { backgroundColor: ROSE } : { backgroundColor: lightColors.muted }]}>
                  <Text style={[styles.chipText, { color: transactionType === t ? "#ffffff" : lightColors.ink900 }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="매물 유형">
            <View style={styles.chipWrap}>
              {REQUEST_PROPERTY_TYPES.map((t) => (
                <Pressable key={t} onPress={() => setPropertyType((cur) => (cur === t ? "" : t))} style={[styles.chip, propertyType === t ? { backgroundColor: ROSE } : { backgroundColor: lightColors.muted }]}>
                  <Text style={[styles.chipText, { color: propertyType === t ? "#ffffff" : lightColors.ink900 }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <View style={{ flexDirection: "row", gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Field label="지역">
                <TextInput value={region} onChangeText={setRegion} style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="시/군/구">
                <TextInput value={district} onChangeText={setDistrict} style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="동/읍/면">
                <TextInput value={dong} onChangeText={setDong} style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="예산 최소 (만원)">
                <TextInput value={budgetMin} onChangeText={(v) => setBudgetMin(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="예산 최대 (만원)">
                <TextInput value={budgetMax} onChangeText={(v) => setBudgetMax(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
          </View>

          <Field label="입주 희망일">
            <DatePickerField value={moveInDate} onChange={setMoveInDate} mode="date" placeholder="날짜 선택" clearable />
          </Field>

          <Field label="상세 내용 *">
            <TextInput value={content} onChangeText={setContent} multiline style={[styles.input, styles.textarea]} placeholderTextColor={lightColors.ink500} />
          </Field>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View><Text style={styles.label}>{label}</Text>{children}</View>
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: ROSE, minWidth: 60, alignItems: "center" },
  saveBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

  body: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[6] },
  label: { fontSize: 15, fontWeight: "600", color: lightColors.ink900, marginBottom: 8, letterSpacing: -0.1 },

  input: {
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: lightColors.background, fontSize: 15, color: lightColors.ink900,
  },
  textarea: { minHeight: 140, textAlignVertical: "top" },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },
})
