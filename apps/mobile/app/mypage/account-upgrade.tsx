/**
 * 계정 유형 신청 — 광장 web /mypage/account-upgrade 1:1 미러.
 * 7개 역할 (agent / business / producer / interior / moving / cleaning / repair).
 *
 * 보안 강화: 모바일에서도 웹 API (/api/account-upgrade) 를 사용하여
 * R2 URL 소유권 검증, rate limit, ban guard 등 서버사이드 보안 로직 적용.
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
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  listAccountTypeRequests,
  type AccountTypeRequest,
  type RequestedType,
} from "@gwangjang/features/verify"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"

interface RoleMeta {
  type: RequestedType
  label: string
  description: string
  icon: any
  color: string
  bg: string
  benefits: string[]
  requiresLicense?: boolean
  licenseLabel?: string
}

const ROLES: RoleMeta[] = [
  {
    type: "agent", label: "공인중개사",
    description: "전문 매물 등록 및 부동산 중개 업무",
    icon: "business-outline", color: "#2563eb", bg: "rgba(59,130,246,0.1)",
    benefits: ["전문 매물 등록", "중개사 뱃지", "신뢰 지수 가점"],
    requiresLicense: true, licenseLabel: "공인중개사 자격증",
  },
  {
    type: "business", label: "사장님",
    description: "메뉴·상품 등록, 공동구매 운영",
    icon: "storefront-outline", color: "#f97316", bg: "rgba(249,115,22,0.1)",
    benefits: ["메뉴·상품 등록", "공동구매 운영", "영업시간·위치 노출"],
  },
  {
    type: "producer", label: "로컬푸드 생산자",
    description: "농수산물·가공품 직거래 판매",
    icon: "leaf-outline", color: "#22c55e", bg: "rgba(34,197,94,0.1)",
    benefits: ["로컬푸드 등록", "제철 예약주문", "농장일지 기능"],
  },
  {
    type: "interior", label: "인테리어",
    description: "인테리어·리모델링 포트폴리오",
    icon: "color-palette-outline", color: "#a855f7", bg: "rgba(168,85,247,0.1)",
    benefits: ["포트폴리오 등록", "견적 문의 채팅", "전후 비교 쇼케이스"],
  },
  {
    type: "moving", label: "이사 전문가",
    description: "이사 서비스 견적·예약",
    icon: "car-outline", color: "#eab308", bg: "rgba(234,179,8,0.1)",
    benefits: ["이사 서비스 등록", "견적 요청 수신", "서비스 지역 지정"],
  },
  {
    type: "cleaning", label: "청소 전문가",
    description: "청소 서비스 견적·예약",
    icon: "sparkles-outline", color: "#ec4899", bg: "rgba(236,72,153,0.1)",
    benefits: ["청소 서비스 등록", "견적 요청 수신", "정기/단건 선택"],
  },
  {
    type: "repair", label: "수리 전문가",
    description: "가전·배관·전기·긴급 수리",
    icon: "construct-outline", color: "#ea580c", bg: "rgba(234,88,12,0.1)",
    benefits: ["수리 서비스 등록", "긴급 출동 배지", "전문분야 노출"],
  },
]

/** account_type 영문 → 한글 라벨 */
const TYPE_LABEL: Record<string, string> = {
  user: "일반 회원",
  individual: "일반 회원",
  agent: "공인중개사",
  business: "사장님",
  producer: "로컬푸드 생산자",
  interior: "인테리어",
  moving: "이사 전문가",
  cleaning: "청소 전문가",
  repair: "수리 전문가",
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "심사중", color: "#d97706", bg: "rgba(245,158,11,0.15)" },
  approved: { label: "승인", color: "#16a34a", bg: "rgba(34,197,94,0.15)" },
  rejected: { label: "반려", color: "#e11d48", bg: "rgba(244,63,94,0.15)" },
  cancelled: { label: "취소됨", color: lightColors.ink500, bg: lightColors.muted },
}

/** 최대 업로드 파일 수 */
const MAX_CERT_FILES = 3
const MAX_LICENSE_FILES = 3
const MAX_EXTRA_FILES = 3

export default function AccountUpgradeScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [currentType, setCurrentType] = useState("user")
  const [existing, setExisting] = useState<AccountTypeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<RequestedType | null>(null)

  // 폼 — 웹 API 와 동일한 필드
  const [form, setForm] = useState({
    business_name: "",
    business_number: "",
    registration_number: "",
    office_address: "",
    contact_phone: "",
    intro: "",
  })
  const [certUrls, setCertUrls] = useState<string[]>([])
  const [licenseUrls, setLicenseUrls] = useState<string[]>([])
  const [extraUrls, setExtraUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        const [profileRes, ppRes, reqs] = await Promise.all([
          supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle(),
          plazaId
            ? supabase.from("plaza_profiles").select("account_type")
                .eq("user_id", user.id).eq("plaza_id", plazaId).maybeSingle()
            : Promise.resolve({ data: null } as any),
          listAccountTypeRequests(supabase, user.id),
        ])
        if (cancelled) return
        const pp: any = ppRes?.data
        setCurrentType(pp?.account_type ?? profileRes.data?.account_type ?? "user")
        setExisting(reqs)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, plazaId])

  const selectedDef = selected ? ROLES.find((r) => r.type === selected) : null

  /** 이미지 선택 → R2 업로드 → URL 반환 */
  async function pickAndUpload(
    current: string[],
    setter: (v: string[]) => void,
    max: number,
  ) {
    if (current.length >= max) {
      Alert.alert("제한", `최대 ${max}장까지 가능합니다`)
      return
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다")
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    if (res.canceled || !res.assets?.[0]) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", {
        uri: res.assets[0].uri,
        name: "cert.jpg",
        type: "image/jpeg",
      } as any)
      const upRes = await gwangjangFetch("/api/board/upload", {
        method: "POST",
        body: fd,
      })
      if (!upRes.ok) throw new Error("업로드 실패")
      const { url } = await upRes.json()
      setter([...current, url])
    } catch (e: any) {
      Alert.alert("실패", e?.message || "업로드 실패")
    } finally {
      setUploading(false)
    }
  }

  function removeUrl(
    current: string[],
    setter: (v: string[]) => void,
    idx: number,
  ) {
    setter(current.filter((_, i) => i !== idx))
  }

  /** 신청 — 웹 API 호출 (서버사이드 검증 활용) */
  async function submit() {
    if (!selectedDef || !user) return
    if (!form.business_name.trim()) {
      Alert.alert("입력 필요", "상호 / 사업장명을 입력해 주세요")
      return
    }
    if (selectedDef.type === "agent" && !form.registration_number.trim()) {
      Alert.alert("입력 필요", "공인중개사 등록번호를 입력해 주세요")
      return
    }
    if (!form.office_address.trim()) {
      Alert.alert("입력 필요", "사업장 주소를 입력해 주세요")
      return
    }
    if (certUrls.length === 0) {
      Alert.alert("입력 필요", "사업자등록증 사진을 1장 이상 업로드해 주세요")
      return
    }
    if (selectedDef.requiresLicense && licenseUrls.length === 0) {
      Alert.alert("입력 필요", `${selectedDef.licenseLabel} 사진을 업로드해 주세요`)
      return
    }
    if (form.contact_phone.trim() && !/^[0-9+\-() ]{8,20}$/.test(form.contact_phone.trim())) {
      Alert.alert("확인", "연락처 형식이 올바르지 않습니다")
      return
    }
    if (form.intro.length > 1000) {
      Alert.alert("확인", "소개는 1000자 이내로 작성해 주세요")
      return
    }

    setSubmitting(true)
    try {
      const res = await gwangjangFetch("/api/account-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_type: selectedDef.type,
          business_name: form.business_name.trim(),
          business_number: form.business_number.trim() || null,
          registration_number: selectedDef.type === "agent" ? (form.registration_number.trim() || null) : null,
          office_address: form.office_address.trim(),
          contact_phone: form.contact_phone.trim() || null,
          intro: form.intro.trim() || null,
          business_cert_urls: certUrls,
          license_urls: licenseUrls,
          extra_docs_urls: extraUrls,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        Alert.alert("실패", body?.error || "신청에 실패했습니다")
        return
      }

      // 신청 이력 재로드
      try {
        const reqs = await listAccountTypeRequests(getSupabase(), user.id)
        setExisting(reqs ?? [])
      } catch {}

      Alert.alert("접수", "계정 유형 신청이 접수되었습니다. 심사 결과를 기다려주세요.", [
        { text: "확인", onPress: () => router.back() },
      ])
    } catch (e: any) {
      Alert.alert("오류", e?.message || "신청 처리 중 오류가 발생했습니다")
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setForm({ business_name: "", business_number: "", registration_number: "", office_address: "", contact_phone: "", intro: "" })
    setCertUrls([])
    setLicenseUrls([])
    setExtraUrls([])
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
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (selected) { setSelected(null); resetForm() }
            else router.back()
          }}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>{selectedDef ? selectedDef.label : "계정 유형 신청"}</Text>
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
              <View style={styles.hintCard}>
                <Text style={styles.hintTitle}>현재 계정 유형: {TYPE_LABEL[currentType] || currentType}</Text>
                <Text style={styles.hintBody}>
                  계정 유형을 변경하면 추가 기능 (전문 매물 등록, 공동구매 운영 등) 을 사용할 수 있습니다.
                  심사 후 즉시 변경됩니다.
                </Text>
              </View>

              <Text style={styles.sectionTitle}>변경할 유형 선택</Text>
              <View style={{ gap: 8 }}>
                {ROLES.map((r) => {
                  const isCurrent = r.type === currentType
                  return (
                    <Pressable
                      key={r.type}
                      onPress={() => { if (!isCurrent) { setSelected(r.type); resetForm() } }}
                      disabled={isCurrent}
                      style={({ pressed }) => [
                        styles.roleCard,
                        isCurrent && styles.roleCardCurrent,
                        !isCurrent && pressed && { backgroundColor: lightColors.muted },
                      ]}
                    >
                      <View style={[styles.roleIcon, { backgroundColor: r.bg }]}>
                        <Ionicons name={r.icon} size={22} color={isCurrent ? r.color : r.color} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.roleLabelRow}>
                          <Text style={[styles.roleLabel, isCurrent && { color: lightColors.ink500 }]}>{r.label}</Text>
                          {isCurrent && (
                            <View style={styles.currentBadge}>
                              <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                              <Text style={styles.currentBadgeText}>현재 유형</Text>
                            </View>
                          )}
                          {!isCurrent && r.requiresLicense && (
                            <View style={styles.licenseBadge}>
                              <Text style={styles.licenseBadgeText}>자격증 필수</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.roleDesc, isCurrent && { color: lightColors.ink500 }]} numberOfLines={2}>
                          {r.description}
                        </Text>
                        <View style={styles.benefitsRow}>
                          {r.benefits.slice(0, 2).map((b, i) => (
                            <Text key={i} style={[styles.benefitText, isCurrent && { color: lightColors.ink500 }]}>
                              ✓ {b}
                            </Text>
                          ))}
                        </View>
                      </View>
                      {isCurrent ? (
                        <Ionicons name="lock-closed" size={16} color={lightColors.ink500} />
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={lightColors.ink500} />
                      )}
                    </Pressable>
                  )
                })}
              </View>

              {existing.length > 0 && (
                <View style={{ marginTop: spacing[5] }}>
                  <Text style={styles.sectionTitle}>신청 이력</Text>
                  <View style={styles.historyCard}>
                    {existing.map((r, i) => {
                      const def = ROLES.find((x) => x.type === r.requested_type)
                      const sm = STATUS_LABEL[r.status]
                      return (
                        <View
                          key={r.id}
                          style={[
                            styles.historyRow,
                            i > 0 && { borderTopWidth: 1, borderTopColor: lightColors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyLabel}>
                              {def?.label || r.requested_type}
                            </Text>
                            <Text style={styles.historyDate}>
                              {new Date(r.submitted_at).toLocaleDateString("ko-KR")}
                            </Text>
                            {r.admin_note && (
                              <Text style={styles.adminNote}>관리자: {r.admin_note}</Text>
                            )}
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: sm.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: sm.color }]}>
                              {sm.label}
                            </Text>
                          </View>
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
                <View style={[styles.hintCard, { backgroundColor: selectedDef.bg, borderColor: selectedDef.color + "40" }]}>
                  <Text style={[styles.hintTitle, { color: selectedDef.color }]}>
                    {selectedDef.label}
                  </Text>
                  <Text style={styles.hintBody}>{selectedDef.description}</Text>
                  <View style={{ marginTop: spacing[2], gap: 4 }}>
                    {selectedDef.benefits.map((b, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={14} color={selectedDef.color} />
                        <Text style={styles.benefitText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* ── 기본 정보 ── */}
                <View style={styles.formCard}>
                  <Field label="상호 / 사업장명 *">
                    <TextInput
                      style={styles.input}
                      value={form.business_name}
                      onChangeText={(v) => setForm((p) => ({ ...p, business_name: v }))}
                      placeholder="예: 광장 부동산"
                      placeholderTextColor={lightColors.ink500}
                      maxLength={100}
                    />
                  </Field>
                  <Field label="사업자등록번호">
                    <TextInput
                      style={styles.input}
                      value={form.business_number}
                      onChangeText={(v) => setForm((p) => ({ ...p, business_number: v }))}
                      placeholder="예: 123-45-67890"
                      placeholderTextColor={lightColors.ink500}
                      keyboardType="number-pad"
                      maxLength={20}
                    />
                  </Field>
                  {selectedDef?.type === "agent" && (
                    <Field label="중개사무소 등록번호 *">
                      <TextInput
                        style={styles.input}
                        value={form.registration_number}
                        onChangeText={(v) => setForm((p) => ({ ...p, registration_number: v }))}
                        placeholder="예: 2020-강원춘천-00001"
                        placeholderTextColor={lightColors.ink500}
                        maxLength={50}
                      />
                    </Field>
                  )}
                  <Field label="사업장 주소 *">
                    <TextInput
                      style={styles.input}
                      value={form.office_address}
                      onChangeText={(v) => setForm((p) => ({ ...p, office_address: v }))}
                      placeholder="강원특별자치도 춘천시 ..."
                      placeholderTextColor={lightColors.ink500}
                      maxLength={200}
                    />
                  </Field>
                  <Field label="연락처">
                    <TextInput
                      style={styles.input}
                      value={form.contact_phone}
                      onChangeText={(v) => setForm((p) => ({ ...p, contact_phone: v }))}
                      placeholder="예: 033-123-4567"
                      placeholderTextColor={lightColors.ink500}
                      keyboardType="phone-pad"
                      maxLength={20}
                    />
                  </Field>
                  <Field label="활동 소개 (선택)">
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={form.intro}
                      onChangeText={(v) => setForm((p) => ({ ...p, intro: v }))}
                      placeholder="경력, 전문 분야, 활동 지역 등을 자유롭게 작성"
                      placeholderTextColor={lightColors.ink500}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      maxLength={1000}
                    />
                    <Text style={styles.charCount}>{form.intro.length}/1000</Text>
                  </Field>
                </View>

                {/* ── 사업자등록증 (필수) ── */}
                <View style={styles.formCard}>
                  <Text style={styles.fieldLabel}>
                    사업자등록증 <Text style={{ color: "#dc2626" }}>*</Text>
                  </Text>
                  <Text style={styles.helper}>
                    최대 {MAX_CERT_FILES}장 · 이미지 10MB 이하
                  </Text>
                  <DocGrid
                    urls={certUrls}
                    onRemove={(idx) => removeUrl(certUrls, setCertUrls, idx)}
                    onAdd={() => pickAndUpload(certUrls, setCertUrls, MAX_CERT_FILES)}
                    max={MAX_CERT_FILES}
                    uploading={uploading}
                  />
                </View>

                {/* ── 자격증 (agent 필수) ── */}
                {selectedDef.requiresLicense && (
                  <View style={styles.formCard}>
                    <Text style={styles.fieldLabel}>
                      {selectedDef.licenseLabel} 사진 <Text style={{ color: "#dc2626" }}>*</Text>
                    </Text>
                    <Text style={styles.helper}>
                      최대 {MAX_LICENSE_FILES}장 · 이미지 10MB 이하
                    </Text>
                    <DocGrid
                      urls={licenseUrls}
                      onRemove={(idx) => removeUrl(licenseUrls, setLicenseUrls, idx)}
                      onAdd={() => pickAndUpload(licenseUrls, setLicenseUrls, MAX_LICENSE_FILES)}
                      max={MAX_LICENSE_FILES}
                      uploading={uploading}
                    />
                  </View>
                )}

                {/* ── 추가 서류 (선택) ── */}
                <View style={styles.formCard}>
                  <Text style={styles.fieldLabel}>추가 서류 (선택)</Text>
                  <Text style={styles.helper}>
                    포트폴리오, 경력증명서 등 · 최대 {MAX_EXTRA_FILES}장
                  </Text>
                  <DocGrid
                    urls={extraUrls}
                    onRemove={(idx) => removeUrl(extraUrls, setExtraUrls, idx)}
                    onAdd={() => pickAndUpload(extraUrls, setExtraUrls, MAX_EXTRA_FILES)}
                    max={MAX_EXTRA_FILES}
                    uploading={uploading}
                  />
                </View>

                <Pressable
                  onPress={submit}
                  disabled={submitting || uploading}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    (submitting || uploading) && { opacity: 0.6 },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : uploading ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.submitText}>업로드 중</Text>
                    </View>
                  ) : (
                    <Text style={styles.submitText}>신청하기</Text>
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

// ─── 공용 컴포넌트 ───

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing[3] }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

function DocGrid({
  urls,
  onRemove,
  onAdd,
  max,
  uploading,
}: {
  urls: string[]
  onRemove: (idx: number) => void
  onAdd: () => void
  max: number
  uploading: boolean
}) {
  return (
    <View style={styles.docGrid}>
      {urls.map((u, i) => (
        <View key={i} style={styles.docTile}>
          <Image source={{ uri: u }} cachePolicy="memory-disk" style={styles.docImg} contentFit="cover" />
          <Pressable onPress={() => onRemove(i)} style={styles.docRemove} hitSlop={6}>
            <Ionicons name="close" size={12} color="#ffffff" />
          </Pressable>
        </View>
      ))}
      {urls.length < max && (
        <Pressable
          onPress={onAdd}
          disabled={uploading}
          style={({ pressed }) => [
            styles.docAddBtn,
            uploading && { opacity: 0.5 },
            pressed && { backgroundColor: lightColors.muted },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={lightColors.ink500} />
          ) : (
            <>
              <Ionicons name="add" size={24} color={lightColors.ink500} />
              <Text style={styles.docAddText}>추가</Text>
            </>
          )}
        </Pressable>
      )}
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
  headerBtn: { width: 36, padding: 6 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  hintCard: {
    padding: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    marginBottom: spacing[3],
  },
  hintTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 6,
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
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  roleCardCurrent: {
    backgroundColor: "#f8fafc",
    borderColor: "#16a34a",
    borderWidth: 1.5,
    opacity: 0.75,
  },
  currentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(22,163,74,0.12)",
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#16a34a",
  },
  roleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  roleLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  roleLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  licenseBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(245,158,11,0.15)",
  },
  licenseBadgeText: { fontSize: 10, fontWeight: "700", color: "#b45309" },
  roleDesc: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 4,
  },
  benefitsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  benefitText: {
    fontSize: 11,
    color: lightColors.ink700,
  },
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
    gap: 12,
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
  adminNote: {
    fontSize: 11,
    color: lightColors.ink700,
    marginTop: 4,
    fontStyle: "italic",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },

  // Form
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
  charCount: {
    fontSize: 10,
    color: lightColors.ink500,
    textAlign: "right",
    marginTop: 4,
  },
  helper: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 4,
    marginBottom: spacing[3],
  },

  // Doc grid
  docGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  docTile: {
    width: 100,
    height: 100,
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
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  docAddBtn: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  docAddText: {
    fontSize: 11,
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
