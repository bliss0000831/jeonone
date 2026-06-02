/**
 * 인증 신청 — 광장 web /mypage/verify 1:1 미러.
 *
 * 5 타입 (phone / business / agent / producer / service).
 * 단계: type 선택 → 폼 + 문서 업로드 → 신청.
 */

import { useEffect, useMemo, useState } from "react"
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
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createVerifyRequest,
  listVerifyRequests,
  type VerifyRequest,
  type VerifyType,
} from "@gwangjang/features/verify"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"

interface FieldDef {
  key: string
  label: string
  placeholder?: string
  keyboardType?: "default" | "phone-pad" | "number-pad"
  multiline?: boolean
  required?: boolean
}

interface TypeDef {
  id: VerifyType
  label: string
  icon: any
  color: string
  bg: string
  targetRole: string[]
  description: string
  fields: FieldDef[]
  docs: string
}

const TYPES: TypeDef[] = [
  {
    id: "phone",
    label: "휴대폰 인증",
    icon: "call-outline",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.1)",
    targetRole: ["user", "business", "agent", "producer", "interior", "moving", "cleaning", "repair"],
    description: "본인 명의 휴대폰 번호를 인증합니다.",
    fields: [
      { key: "phone", label: "휴대폰 번호", placeholder: "010-0000-0000", keyboardType: "phone-pad", required: true },
      { key: "holder_name", label: "명의자 이름", required: true },
    ],
    docs: "명의자 확인 서류 (선택)",
  },
  {
    id: "business",
    label: "사업자 인증",
    icon: "storefront-outline",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    targetRole: ["business"],
    description: "사업자등록증을 업로드하여 사장님 인증을 받습니다.",
    fields: [
      { key: "company_name", label: "상호명", required: true },
      { key: "representative_name", label: "대표자명", required: true },
      { key: "business_number", label: "사업자등록번호", placeholder: "000-00-00000", required: true },
      { key: "address", label: "사업장 주소", required: true },
    ],
    docs: "사업자등록증",
  },
  {
    id: "agent",
    label: "공인중개사 자격증",
    icon: "business-outline",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.1)",
    targetRole: ["agent"],
    description: "중개사 등록증과 사업자등록증을 업로드합니다.",
    fields: [
      { key: "office_name", label: "중개사무소 상호", required: true },
      { key: "representative_name", label: "대표자명", required: true },
      { key: "license_number", label: "중개사 등록번호", required: true },
      { key: "phone", label: "사무실 연락처", keyboardType: "phone-pad", required: true },
      { key: "address", label: "사무소 주소", required: true },
    ],
    docs: "중개사 등록증",
  },
  {
    id: "producer",
    label: "로컬푸드 생산자 인증",
    icon: "leaf-outline",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    targetRole: ["producer"],
    description: "농장/생산시설 사진 및 관련 서류를 제출합니다.",
    fields: [
      { key: "farm_name", label: "농장/시설명", required: true },
      { key: "representative_name", label: "대표자명", required: true },
      { key: "products", label: "주요 생산물", placeholder: "예: 사과, 배, 토마토" },
      { key: "address", label: "농장 주소", required: true },
    ],
    docs: "생산자 확인 서류 (농지원부, 친환경 인증서 등)",
  },
  {
    id: "service",
    label: "전문가 인증",
    icon: "construct-outline",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    targetRole: ["interior", "moving", "cleaning", "repair"],
    description: "포트폴리오와 경력 서류를 제출하여 전문가 인증을 받습니다.",
    fields: [
      { key: "company_name", label: "상호명", required: true },
      { key: "representative_name", label: "대표자명", required: true },
      { key: "career_years", label: "경력 연차", placeholder: "예: 5년" },
      { key: "description", label: "활동 소개", multiline: true },
    ],
    docs: "사업자등록증 또는 경력 증빙",
  },
]

export default function VerifyScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [accountType, setAccountType] = useState("user")
  const [existing, setExisting] = useState<VerifyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<VerifyType | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [docs, setDocs] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        // 🅲 광장 격리 — account_type 은 plaza_profiles 우선 → profiles fallback
        const [profileRes, ppRes, reqs] = await Promise.all([
          supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle(),
          plazaId
            ? supabase.from("plaza_profiles").select("account_type")
                .eq("user_id", user.id).eq("plaza_id", plazaId).maybeSingle()
            : Promise.resolve({ data: null } as any),
          listVerifyRequests(supabase, user.id),
        ])
        if (cancelled) return
        const pp: any = ppRes?.data
        setAccountType(pp?.account_type ?? profileRes.data?.account_type ?? "user")
        setExisting(reqs)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, plazaId])

  const availableTypes = useMemo(
    () => TYPES.filter((t) => t.targetRole.includes(accountType)),
    [accountType],
  )
  const selectedDef = selected ? TYPES.find((t) => t.id === selected) : null

  async function pickDoc() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다")
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
    })
    if (res.canceled || !res.assets) return
    setUploading(true)
    try {
      const newUrls: string[] = []
      for (const asset of res.assets) {
        const fd = new FormData()
        fd.append("file", { uri: asset.uri, name: "doc.jpg", type: "image/jpeg" } as any)
        const upRes = await gwangjangFetch("/api/board/upload", {
          method: "POST",
          body: fd,
        })
        if (!upRes.ok) throw new Error("업로드 실패")
        const { url } = await upRes.json()
        newUrls.push(url)
      }
      setDocs((arr) => [...arr, ...newUrls])
    } catch (e: any) {
      Alert.alert("실패", e?.message || "업로드 실패")
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    if (!selectedDef || !user) return
    for (const f of selectedDef.fields) {
      if (f.required && !form[f.key]?.trim()) {
        Alert.alert("입력 필요", `${f.label}을(를) 입력해주세요`)
        return
      }
    }
    if (docs.length === 0) {
      Alert.alert("필요", `${selectedDef.docs}을(를) 업로드해주세요`)
      return
    }
    setSubmitting(true)
    try {
      await createVerifyRequest(getSupabase(), {
        userId: user.id,
        type: selectedDef.id,
        data: form,
        documents: docs,
      })
      // 신청 이력 재로드 — 사용자가 뒤로가기 전에 이미 반영됨
      try {
        const list = await listVerifyRequests(getSupabase(), user.id)
        setExisting(list ?? [])
      } catch {}
      Alert.alert("접수", "인증 요청이 접수되었습니다. 심사 결과를 기다려주세요.", [
        { text: "확인", onPress: () => router.back() },
      ])
    } catch (e: any) {
      Alert.alert("실패", e?.message || "신청 실패")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={lightColors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (selected ? setSelected(null) : router.back())}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>{selectedDef ? selectedDef.label : "인증 신청"}</Text>
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
          {!selected ? (
            <>
              {/* 안내 */}
              <View style={styles.hintCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={lightColors.primary} />
                  <Text style={styles.hintTitle}>인증은 신뢰를 만듭니다</Text>
                </View>
                <Text style={styles.hintBody}>
                  인증 심사는 영업일 기준 1~3일 이내 처리됩니다. 신청 후 결과는 이 페이지에서 확인할 수 있습니다.
                </Text>
              </View>

              <Text style={styles.sectionTitle}>신청 가능한 인증</Text>
              {availableTypes.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    현재 계정 타입({accountType})에서 신청 가능한 인증이 없습니다
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {availableTypes.map((t) => {
                    const latest = existing.find((r) => r.type === t.id)
                    const status = latest?.status
                    const disabled = status === "pending" || status === "approved"
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => {
                          if (status === "approved") {
                            Alert.alert("이미 승인됨", "이미 승인된 인증입니다")
                            return
                          }
                          if (status === "pending") {
                            Alert.alert("심사 중", "심사 대기 중입니다. 결과를 기다려주세요")
                            return
                          }
                          setSelected(t.id)
                          setForm({})
                          setDocs([])
                        }}
                        disabled={disabled}
                        style={({ pressed }) => [
                          styles.typeCard,
                          status === "approved" && {
                            borderColor: "rgba(34,197,94,0.3)",
                            backgroundColor: "rgba(34,197,94,0.05)",
                          },
                          status === "pending" && {
                            borderColor: "rgba(245,158,11,0.3)",
                            backgroundColor: "rgba(245,158,11,0.05)",
                          },
                          pressed && !disabled && { backgroundColor: lightColors.muted },
                        ]}
                      >
                        <View
                          style={[
                            styles.typeIcon,
                            { backgroundColor: t.bg },
                            status === "approved" && { backgroundColor: "rgba(34,197,94,0.15)" },
                            status === "pending" && { backgroundColor: "rgba(245,158,11,0.15)" },
                          ]}
                        >
                          <Ionicons
                            name={t.icon}
                            size={22}
                            color={
                              status === "approved"
                                ? "#16a34a"
                                : status === "pending"
                                ? "#d97706"
                                : t.color
                            }
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.typeLabelRow}>
                            <Text style={styles.typeLabel}>{t.label}</Text>
                            {status === "approved" && (
                              <View style={[styles.statusBadge, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                                <Ionicons name="checkmark-circle" size={11} color="#16a34a" />
                                <Text style={[styles.statusBadgeText, { color: "#16a34a" }]}>승인됨</Text>
                              </View>
                            )}
                            {status === "pending" && (
                              <View style={[styles.statusBadge, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
                                <Ionicons name="time-outline" size={11} color="#d97706" />
                                <Text style={[styles.statusBadgeText, { color: "#d97706" }]}>심사중</Text>
                              </View>
                            )}
                            {status === "rejected" && (
                              <View style={[styles.statusBadge, { backgroundColor: "rgba(244,63,94,0.15)" }]}>
                                <Ionicons name="close-circle" size={11} color="#e11d48" />
                                <Text style={[styles.statusBadgeText, { color: "#e11d48" }]}>반려 · 재신청</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.typeDesc} numberOfLines={2}>
                            {t.description}
                          </Text>
                          {status === "rejected" && latest?.reject_reason && (
                            <Text style={styles.rejectReason}>사유: {latest.reject_reason}</Text>
                          )}
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              )}

              {existing.length > 0 && (
                <View style={{ marginTop: spacing[5] }}>
                  <Text style={styles.sectionTitle}>신청 이력</Text>
                  <View style={styles.historyCard}>
                    {existing.map((r, i) => {
                      const def = TYPES.find((t) => t.id === r.type)
                      return (
                        <View
                          key={r.id}
                          style={[
                            styles.historyRow,
                            i > 0 && { borderTopWidth: 1, borderTopColor: lightColors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyLabel}>{def?.label || r.type}</Text>
                            <Text style={styles.historyDate}>
                              {new Date(r.created_at).toLocaleDateString("ko-KR")}
                            </Text>
                          </View>
                          {r.status === "pending" && (
                            <View style={[styles.statusBadge, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
                              <Ionicons name="time-outline" size={11} color="#d97706" />
                              <Text style={[styles.statusBadgeText, { color: "#d97706" }]}>심사중</Text>
                            </View>
                          )}
                          {r.status === "approved" && (
                            <View style={[styles.statusBadge, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
                              <Ionicons name="checkmark-circle" size={11} color="#16a34a" />
                              <Text style={[styles.statusBadgeText, { color: "#16a34a" }]}>승인</Text>
                            </View>
                          )}
                          {r.status === "rejected" && (
                            <View style={[styles.statusBadge, { backgroundColor: "rgba(244,63,94,0.15)" }]}>
                              <Ionicons name="close-circle" size={11} color="#e11d48" />
                              <Text style={[styles.statusBadgeText, { color: "#e11d48" }]}>반려</Text>
                            </View>
                          )}
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}
            </>
          ) : (
            selectedDef && (
              <>
                <View style={styles.hintCard}>
                  <Text style={styles.hintBody}>{selectedDef.description}</Text>
                </View>

                {/* 폼 */}
                <View style={styles.formCard}>
                  {selectedDef.fields.map((f) => (
                    <View key={f.key} style={{ marginBottom: spacing[3] }}>
                      <Text style={styles.fieldLabel}>
                        {f.label}
                        {f.required && <Text style={{ color: "#dc2626" }}> *</Text>}
                      </Text>
                      <TextInput
                        style={[styles.input, f.multiline && styles.textarea]}
                        value={form[f.key] || ""}
                        onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                        placeholder={f.placeholder}
                        placeholderTextColor={lightColors.ink500}
                        keyboardType={f.keyboardType}
                        multiline={f.multiline}
                        numberOfLines={f.multiline ? 3 : 1}
                        textAlignVertical={f.multiline ? "top" : "auto"}
                      />
                    </View>
                  ))}
                </View>

                {/* 문서 업로드 */}
                <View style={styles.formCard}>
                  <Text style={styles.fieldLabel}>
                    첨부 서류 <Text style={{ color: "#dc2626" }}>*</Text>
                  </Text>
                  <Text style={styles.helper}>{selectedDef.docs} (이미지 10MB 이하)</Text>

                  {docs.length > 0 && (
                    <View style={styles.docGrid}>
                      {docs.map((url, i) => (
                        <View key={i} style={styles.docTile}>
                          <Image source={{ uri: url }} cachePolicy="memory-disk" style={styles.docImg} />
                          <Pressable
                            onPress={() => setDocs((arr) => arr.filter((_, idx) => idx !== i))}
                            style={styles.docRemove}
                            hitSlop={6}
                          >
                            <Ionicons name="close" size={12} color="#ffffff" />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}

                  <Pressable
                    onPress={pickDoc}
                    disabled={uploading}
                    style={({ pressed }) => [
                      styles.uploadBtn,
                      uploading && { opacity: 0.5 },
                      pressed && { backgroundColor: lightColors.muted },
                    ]}
                  >
                    {uploading ? (
                      <>
                        <ActivityIndicator size="small" color={lightColors.ink500} />
                        <Text style={styles.uploadText}>업로드 중...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={18} color={lightColors.ink500} />
                        <Text style={styles.uploadText}>이미지 선택 (여러 장 가능)</Text>
                      </>
                    )}
                  </Pressable>
                </View>

                <Pressable
                  onPress={submit}
                  disabled={submitting || uploading}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    (submitting || uploading || pressed) && { opacity: 0.85 },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitText}>인증 신청</Text>
                  )}
                </Pressable>
              </>
            )
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  headerBtn: { width: 36, padding: 6 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  hintCard: {
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    marginBottom: spacing[3],
  },
  hintTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.primary,
  },
  hintBody: {
    fontSize: 12,
    lineHeight: 18,
    color: lightColors.ink500,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
    paddingHorizontal: 4,
  },
  emptyCard: {
    padding: spacing[5],
    backgroundColor: lightColors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: "center",
  },
  emptyText: { fontSize: 13, color: lightColors.ink500 },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  typeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  typeLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  typeDesc: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 4,
  },
  rejectReason: {
    fontSize: 11,
    color: "#dc2626",
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  historyCard: {
    backgroundColor: lightColors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    overflow: "hidden",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  historyLabel: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  historyDate: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 2,
  },
  formCard: {
    padding: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    marginBottom: spacing[3],
  },
  fieldLabel: {
    fontSize: 13,
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
  textarea: { minHeight: 80, paddingTop: 10 },
  helper: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 4,
    marginBottom: spacing[3],
  },
  docGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: spacing[3],
  },
  docTile: {
    width: 96,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: lightColors.muted,
    overflow: "hidden",
    position: "relative",
  },
  docImg: { width: "100%", height: "100%" },
  docRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: lightColors.border,
  },
  uploadText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
  },
  submitBtn: {
    height: 48,
    backgroundColor: lightColors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[3],
  },
  submitText: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: "#ffffff",
  },
})
