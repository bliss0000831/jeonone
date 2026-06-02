/**
 * 매물 요청 작성 — 광장 web /requests/new 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 매물 요청 작성)
 *   - 공인중개사(account_type='agent') 면 안내 + 작성 차단
 *   - 제목 *
 *   - 거래 유형 (매매/전세/월세 칩)
 *   - 매물 유형 (REQUEST_PROPERTY_TYPES 칩)
 *   - 지역 (region/district/dong) — 기본값 강원/춘천시
 *   - 예산 범위 (만원 단위 입력 → 원으로 변환 후 전송)
 *   - 입주 희망일 (YYYY-MM-DD)
 *   - 상세 내용 *
 *   - 등록 버튼 (createPropertyRequest)
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
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createPropertyRequest,
  REQUEST_PROPERTY_TYPES,
  REQUEST_TRANSACTION_TYPES,
} from "@gwangjang/features/requests"
import { useAuth } from "@/lib/auth-context"
import { gwangjangFetch, getSupabase } from "@/lib/supabase"
import { DatePickerField } from "@/components/DatePickerField"
import { useCurrentPlaza } from "@/lib/plaza"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"

const ROSE = "#e11d48"

export default function PropertyRequestNewScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [regionId, setRegionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [accountType, setAccountType] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [region, setRegion] = useState("")
  const [district, setDistrict] = useState("")
  const [dong, setDong] = useState("")
  const [propertyType, setPropertyType] = useState("")
  const [transactionType, setTransactionType] = useState("")
  const [budgetMin, setBudgetMin] = useState("")
  const [budgetMax, setBudgetMax] = useState("")
  const [moveInDate, setMoveInDate] = useState("")

  useEffect(() => {
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      router.back()
      return
    }
    // 🅲 광장 격리 — account_type 은 plaza_profiles 우선 → profiles fallback
    const supabase = getSupabase()
    Promise.all([
      supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle(),
      plazaId
        ? supabase.from("plaza_profiles").select("account_type")
            .eq("user_id", user.id).eq("plaza_id", plazaId).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]).then(([profRes, ppRes]) => {
      const pp: any = ppRes?.data
      const at = pp?.account_type ?? (profRes.data as any)?.account_type ?? null
      setAccountType(at)
      setChecking(false)
    })
  }, [user, router, plazaId])

  async function handleSubmit() {
    if (submitting) return
    const errors: string[] = []
    if (!title.trim()) errors.push("제목을 입력해주세요")
    if (!content.trim()) errors.push("상세 내용을 입력해주세요")
    if (errors.length > 0) {
      Alert.alert("입력을 확인해주세요", errors.join("\n"))
      return
    }
    setSubmitting(true)
    try {
      const r = await createPropertyRequest(
        (u, init) => gwangjangFetch(u, init as any),
        {
          title: title.trim(),
          content: content.trim(),
          region: region || null,
          district: district || null,
          dong: dong || null,
          propertyType: propertyType || null,
          transactionType: transactionType || null,
          // 만원 단위 → 원 (web 와 동일)
          budgetMin: budgetMin ? Number(budgetMin) * 10000 : null,
          budgetMax: budgetMax ? Number(budgetMax) * 10000 : null,
          moveInDate: moveInDate || null,
        },
      )
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      if (r.postId) await setPostRegion("property_requests", r.postId, regionId)
      Alert.alert("등록 완료", "매물 요청이 등록되었습니다")
      if (r.postId) router.replace(`/requests/${r.postId}` as any)
      else router.back()
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  // 공인중개사 차단 페이지
  if (accountType === "agent") {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
          </Pressable>
          <Text style={styles.headerTitle}>매물 요청</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={[styles.center, { padding: spacing[4] }]}>
          <View style={styles.agentIcon}>
            <Ionicons name="hand-left-outline" size={32} color={lightColors.ink500} />
          </View>
          <Text style={styles.agentTitle}>
            공인중개사 계정은 요청글을 작성할 수 없습니다
          </Text>
          <Text style={styles.agentSub}>
            대신 다른 이웃의 요청에 매물을 추천해보세요
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={styles.agentBtn}
          >
            <Text style={styles.agentBtnText}>요청 목록 보기</Text>
          </Pressable>
        </View>
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
          <Ionicons name="hand-left" size={18} color={ROSE} />
          <Text style={styles.headerTitle}>매물 요청 작성</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Field label="제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="예: 후평동 25평 아파트 전세 구합니다"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
            />
          </Field>

          <Field label="거래 유형">
            <View style={styles.chipWrap}>
              {REQUEST_TRANSACTION_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTransactionType((cur) => (cur === t ? "" : t))}
                  style={[
                    styles.chip,
                    transactionType === t
                      ? { backgroundColor: ROSE }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: transactionType === t ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="매물 유형">
            <View style={styles.chipWrap}>
              {REQUEST_PROPERTY_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setPropertyType((cur) => (cur === t ? "" : t))}
                  style={[
                    styles.chip,
                    propertyType === t
                      ? { backgroundColor: ROSE }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: propertyType === t ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
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

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="예산 최소 (만원)">
                <TextInput
                  value={budgetMin}
                  onChangeText={(v) => setBudgetMin(v.replace(/[^0-9]/g, ""))}
                  placeholder="10000"
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
                  placeholder="20000"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
          </View>

          <Field label="입주 희망일">
            <DatePickerField
              value={moveInDate}
              onChange={setMoveInDate}
              mode="date"
              placeholder="날짜 선택"
              clearable
            />
          </Field>

          <Field label="상세 내용 *">
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="원하시는 매물 조건을 자세히 적어주세요&#10;- 평수, 방 개수, 층수&#10;- 입주 시기&#10;- 우선순위 등"
              placeholderTextColor={lightColors.ink500}
              multiline
              style={[styles.input, styles.textarea]}
            />
          </Field>

          <RegionFormField
            plazaId={plazaId}
            userId={user?.id}
            address={[region, district, dong].filter(Boolean).join(" ")}
            value={regionId}
            onChange={setRegionId}
          />

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>매물 요청 등록</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

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

  agentIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: lightColors.muted,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  agentTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900, textAlign: "center" },
  agentSub: { fontSize: fontSize.sm, color: lightColors.ink500, marginTop: 8, marginBottom: 24, textAlign: "center" },
  agentBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: ROSE },
  agentBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

  submitBtn: { paddingVertical: 14, borderRadius: radius.md, backgroundColor: ROSE, alignItems: "center" },
  submitBtnText: { color: "#ffffff", fontWeight: "700", fontSize: fontSize.md },
})
