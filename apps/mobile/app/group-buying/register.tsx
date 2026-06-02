/**
 * 공동구매 등록 — 광장 web /group-buying/register 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 공동구매 등록)
 *   - 사진 (최대 10장)
 *   - 제목 *
 *   - 상품명 *
 *   - 정가 (선택, 할인 표시용) / 공구가 *
 *   - 최소/최대 인원
 *   - 마감일 (YYYY-MM-DD)
 *   - 위치
 *   - 받는 방법 (pickup / delivery / both)
 *   - 픽업 위치 / 픽업 시간 (pickup/both 일 때)
 *   - 배송비 + 모드 (included/separate)
 *   - 노출 범위 (plaza / national)
 *   - 결제 필수 토글
 *   - 입금 계좌
 *   - 상세 설명 *
 *   - 등록 버튼 (createGroupBuyingPost)
 *
 * 권한 (account_type='business' / admin) 은 서버에서 처리.
 */

import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native"
import { Image as ExpoImage } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { createGroupBuyingPost } from "@gwangjang/features/group-buying"
import { getSupabase, gwangjangFetch, uploadImage } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { DatePickerField } from "@/components/DatePickerField"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const PURPLE = "#8b5cf6"

const DELIVERY_MODES = [
  { value: "pickup" as const, label: "픽업만" },
  { value: "delivery" as const, label: "배송만" },
  { value: "both" as const, label: "둘 다" },
]

export default function GroupBuyingRegisterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plaza = useCurrentPlaza()
  // 권한 게이트 — 🅲 광장별 격리: plaza_profiles.account_type 우선
  const [permChecking, setPermChecking] = useState(true)
  const [permAllowed, setPermAllowed] = useState(false)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase.from("profiles").select("account_type, role").eq("id", user.id).maybeSingle(),
        plaza
          ? supabase
              .from("plaza_profiles")
              .select("account_type")
              .eq("user_id", user.id)
              .eq("plaza_id", plaza)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      const t =
        (ppRes?.data as any)?.account_type ?? (profRes?.data as any)?.account_type
      const r = (profRes?.data as any)?.role
      const isAdmin = r === "admin" || r === "superadmin"
      if (!isAdmin && t !== "business") {
        setPermChecking(false)
        Alert.alert(
          "권한 필요",
          "공동구매 등록은 사업자 계정만 가능합니다. 마이페이지 → 계정 유형 신청에서 전환할 수 있어요.",
          [{ text: "확인", onPress: () => router.back() }],
        )
      } else {
        setPermAllowed(true)
        setPermChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, router])
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  // 마감일 최소값 — 현재 시각 (과거 날짜 선택 차단). 마운트 시 한 번만 계산.
  const [minDeadline] = useState(() => new Date())
  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])

  const [title, setTitle] = useState("")
  const [productName, setProductName] = useState("")
  const [description, setDescription] = useState("")
  const [originalPrice, setOriginalPrice] = useState("")
  const [groupPrice, setGroupPrice] = useState("")
  const [minParticipants, setMinParticipants] = useState("2")
  const [maxParticipants, setMaxParticipants] = useState("")
  const [deadline, setDeadline] = useState("")
  // 위치 / 픽업 필드 폐기 — 배송 전용
  const [deliveryFee, setDeliveryFee] = useState("")
  const [deliveryFeeMode, setDeliveryFeeMode] = useState<"included" | "separate" | "free">("separate")
  const [accountInfo, setAccountInfo] = useState("")
  const [visibility, setVisibility] = useState<"plaza" | "national">("plaza")
  // 공동구매는 항상 선결제 — 직거래 모드 폐기
  const paymentRequired = true

  // 미저장 이탈 경고 — 제목뿐 아니라 주요 입력 중 하나라도 채워지면 활성화
  useEffect(() => {
    if (
      title.trim() ||
      productName.trim() ||
      description.trim() ||
      groupPrice.trim() ||
      images.length > 0
    ) {
      setFormDirty(true)
    }
  }, [title, productName, description, groupPrice, images])

  // 대표이미지 지정 — idx 를 0번으로 이동 (web 1:1, 모바일 통일)
  function setAsThumbnail(idx: number) {
    if (idx === 0) return
    setImages((prev) => {
      const next = [...prev]
      const [picked] = next.splice(idx, 1)
      next.unshift(picked)
      return next
    })
  }

  async function pickImages() {
    try {
    if (images.length >= MAX_IMAGES) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다. 설정에서 허용해 주세요.")
      return
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, // 이미지 + 동영상 (web 1:1)
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.8,
    })
    if (!r.assets || r.assets.length === 0) return
    const assets = r.assets.slice(0, MAX_IMAGES - images.length)
    // URI 정규화 — file:// 프리픽스 보장 (Android content:// 대응)
    const localUris = assets.map((a) => {
      const u = a.uri
      if (u.startsWith("file://") || u.startsWith("http")) return u
      if (u.startsWith("content://") || u.startsWith("/")) return u
      return `file://${u}`
    })

    // 즉시 로컬 URI 로 미리보기 표시
    setImages((p) => [...p, ...localUris].slice(0, MAX_IMAGES))

    // 백그라운드 업로드 → 로컬 URI 를 서버 URL 로 교체
    setUploading(true)
    try {
      const settled = await Promise.allSettled(
        assets.map((a) => uploadImage(a.uri, "group_buying")),
      )
      let failCount = 0
      setImages((prev) => {
        const next = [...prev]
        for (let i = 0; i < settled.length; i++) {
          const localUri = localUris[i]
          const idx = next.indexOf(localUri)
          if (idx === -1) continue
          const res = settled[i]
          if (res.status === "fulfilled" && res.value) {
            next[idx] = res.value
          } else {
            // 업로드 실패해도 로컬 URI 유지 (미리보기 보존)
            failCount++
          }
        }
        return next
      })
      if (failCount > 0) Alert.alert("업로드 실패", `${failCount}개 파일 업로드에 실패했습니다. 재업로드가 필요합니다.`)
    } catch (err) {
      Alert.alert("업로드 오류", (err as Error)?.message || "이미지 업로드에 실패했습니다")
    } finally {
      setUploading(false)
    }
    } catch (err) {
      Alert.alert("이미지 선택 오류", `${(err as Error)?.message || "알 수 없는 오류"}`)
    }
  }

  async function handleSubmit() {
    if (submitting) return
    const errors: string[] = []
    if (!title.trim()) errors.push("제목을 입력해주세요")
    if (!productName.trim()) errors.push("상품명을 입력해주세요")
    if (!description.trim()) errors.push("상세 설명을 입력해주세요")
    if (!groupPrice) errors.push("공동구매가를 입력해주세요")
    const groupPriceNum = Number(groupPrice)
    const minPart = Number(minParticipants) || 2
    if (groupPrice && (Number.isNaN(groupPriceNum) || groupPriceNum <= 0)) {
      errors.push("공구 가격은 1원 이상의 숫자여야 합니다")
    }
    if (originalPrice) {
      const orig = Number(originalPrice)
      if (Number.isNaN(orig) || orig < 0) {
        errors.push("정가는 0 이상의 숫자여야 합니다")
      }
    }
    if (minPart < 2) errors.push("최소 인원은 2명 이상이어야 합니다")
    if (maxParticipants) {
      const max = Number(maxParticipants)
      if (Number.isNaN(max) || max < minPart) {
        errors.push("최대 인원은 최소 인원보다 커야 합니다")
      }
    }
    if (errors.length > 0) {
      Alert.alert("입력을 확인해주세요", errors.join("\n"))
      return
    }
    // 업로드 중/실패한 로컬 이미지(file://) 가 남아있으면 제출 차단 — 깨진 이미지 등록 방지
    if (uploading) {
      Alert.alert("업로드 중", "이미지 업로드가 끝난 후 다시 시도해주세요.")
      return
    }
    const unuploaded = images.filter((u) => !u.startsWith("http"))
    if (unuploaded.length > 0) {
      Alert.alert(
        "업로드 미완료",
        `${unuploaded.length}개 이미지가 업로드되지 않았습니다. 해당 이미지를 삭제하거나 다시 추가해주세요.`,
      )
      return
    }
    setSubmitting(true)
    try {
      const r = await createGroupBuyingPost(
        (u, init) => gwangjangFetch(u, init as any),
        {
          title: title.trim(),
          description: description.trim(),
          product_name: productName.trim(),
          original_price: originalPrice ? Number(originalPrice) : null,
          group_price: groupPriceNum,
          min_participants: minPart,
          max_participants: maxParticipants ? Number(maxParticipants) : null,
          deadline: deadline.trim() || null,
          location: null,
          delivery_mode: "delivery",
          delivery_fee: deliveryFeeMode === "free" ? 0 : (deliveryFee ? Number(deliveryFee) : 0),
          delivery_fee_mode: deliveryFeeMode,
          pickup_location: null,
          pickup_time: null,
          account_info: null,
          visibility,
          payment_required: paymentRequired,
          images,
        },
      )
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      Alert.alert("등록 완료", "공동구매가 등록되었습니다")
      setFormDirty(false)
      if (r.postId) router.replace(`/group-buying/${r.postId}` as any)
      else router.back()
    } finally {
      setSubmitting(false)
    }
  }

  // 권한 확인 중 / 미허용 시 폼 대신 로딩만 표시 (폼 깜빡임 + 잘못된 입력 방지)
  if (permChecking || !permAllowed) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]} edges={["top"]}>
        <ActivityIndicator size="large" color={PURPLE} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="cart" size={18} color={PURPLE} />
          <Text style={styles.headerTitle}>공동구매 등록</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {/* Images */}
          <View>
            <Text style={styles.label}>상품 사진 (최대 {MAX_IMAGES}장)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {images.map((url, idx) => (
                <View key={idx} style={styles.imgWrap}>
                  {url.startsWith("http") ? (
                    <ExpoImage source={url} contentFit="cover" style={styles.img} />
                  ) : (
                    <RNImage source={{ uri: url }} resizeMode="cover" style={styles.img} />
                  )}
                  {idx === 0 ? (
                    <View style={styles.thumbBadge}>
                      <Ionicons name="star" size={10} color="#fde68a" />
                      <Text style={styles.thumbBadgeText}>대표</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => setAsThumbnail(idx)} style={styles.thumbStarBtn} hitSlop={6}>
                      <Ionicons name="star-outline" size={14} color="#ffffff" />
                    </Pressable>
                  )}
                  <Pressable onPress={() => setImages((p) => p.filter((_, i) => i !== idx))} style={styles.imgRemove} hitSlop={6}>
                    <Ionicons name="close" size={12} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <Pressable onPress={pickImages} style={styles.imgPick} disabled={uploading}>
                  {uploading ? (
                    <ActivityIndicator size="small" color={lightColors.ink500} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={24} color={lightColors.ink500} />
                  )}
                </Pressable>
              )}
            </ScrollView>
          </View>

          <Field label="공동구매 제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="예: 신선한 계란 30구 공동구매"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
              maxLength={80}
            />
            <Text style={{ fontSize: 11, color: lightColors.ink500, textAlign: "right", marginTop: 2 }}>
              {title.length}/80
            </Text>
          </Field>

          <Field label="상품명 *">
            <TextInput
              value={productName}
              onChangeText={setProductName}
              placeholder="예: 무항생제 계란 30구"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
            />
          </Field>

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="정가 (원)">
                <TextInput
                  value={originalPrice}
                  onChangeText={(v) => setOriginalPrice(v.replace(/[^0-9]/g, ""))}
                  placeholder="12000"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="공동구매가 (원) *">
                <TextInput
                  value={groupPrice}
                  onChangeText={(v) => setGroupPrice(v.replace(/[^0-9]/g, ""))}
                  placeholder="9000"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="최소 인원 *">
                <TextInput
                  value={minParticipants}
                  onChangeText={(v) => setMinParticipants(v.replace(/[^0-9]/g, ""))}
                  placeholder="2"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="최대 인원">
                <TextInput
                  value={maxParticipants}
                  onChangeText={(v) => setMaxParticipants(v.replace(/[^0-9]/g, ""))}
                  placeholder="제한 없음"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
          </View>

          <Field label="모집 마감일">
            <DatePickerField
              value={deadline}
              onChange={setDeadline}
              mode="datetime"
              placeholder="마감 일시 선택"
              minimumDate={minDeadline}
              clearable
            />
          </Field>

          {/* 지역 필드 제거 — 배송 전용 */}

          {/* 받는 방법 선택 / 픽업 옵션 제거 — 배송 전용 */}

          <Field label="배송비 (원)">
            <TextInput
              value={deliveryFeeMode === "free" ? "" : deliveryFee}
              onChangeText={(v) => setDeliveryFee(v.replace(/[^0-9]/g, ""))}
              placeholder={deliveryFeeMode === "free" ? "무료배송" : "예: 3000"}
              placeholderTextColor={lightColors.ink500}
              keyboardType="number-pad"
              style={styles.input}
              editable={deliveryFeeMode !== "free"}
            />
            <Pressable
              onPress={() =>
                setDeliveryFeeMode((m) => (m === "free" ? "separate" : "free"))
              }
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}
              hitSlop={8}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: deliveryFeeMode === "free" ? "#10b981" : lightColors.border,
                  backgroundColor: deliveryFeeMode === "free" ? "#10b981" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {deliveryFeeMode === "free" && <Ionicons name="checkmark" size={12} color="#ffffff" />}
              </View>
              <Text style={{ fontSize: 14, color: lightColors.ink900 }}>무료배송</Text>
            </Pressable>
          </Field>

          <Field label="노출 범위">
            <View style={styles.chipWrap}>
              {(["plaza", "national"] as const).map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setVisibility(v)}
                  style={[
                    styles.chip,
                    visibility === v
                      ? { backgroundColor: PURPLE }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: visibility === v ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {v === "plaza" ? "현재 광장" : "전체 광장"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          {/* 결제 필수 토글 제거 — 공동구매는 항상 선결제 */}
          {/* 입금 계좌 필드 제거 — 선결제(에스크로)라 불필요 */}

          <Field label="상세 설명 *">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="상품 설명, 공구 진행 방식 등을 자세히 적어주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={3000}
              style={[styles.input, styles.textarea]}
            />
            <Text style={{ fontSize: 11, color: lightColors.ink500, textAlign: "right", marginTop: 2 }}>
              {description.length}/3000
            </Text>
          </Field>

          <RegisterConsentBlock serviceKind="groupBuying" onChange={setConsented} />

          <Pressable
            onPress={handleSubmit}
            disabled={submitting || uploading || !consented}
            style={[styles.submitBtn, (submitting || uploading || !consented) && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : uploading ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.submitBtnText}>업로드 중...</Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>공동구매 등록하기</Text>
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
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border,
  },
  headerBtn: { padding: 6 },
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  body: { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[6] },
  label: { fontSize: 15, fontWeight: "600", color: lightColors.ink900, marginBottom: 8, letterSpacing: -0.1 },

  imgWrap: { width: 100, height: 100, position: "relative", overflow: "visible" },
  img: { width: 100, height: 100, borderRadius: radius.md },
  imgRemove: {
    position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center",
  },
  imgPick: {
    width: 100, height: 100, borderRadius: radius.md,
    borderWidth: 2, borderStyle: "dashed", borderColor: lightColors.border,
    alignItems: "center", justifyContent: "center",
  },

  input: {
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: lightColors.border,
    backgroundColor: lightColors.background, fontSize: 15, color: lightColors.ink900,
  },
  textarea: { minHeight: 140, textAlignVertical: "top", lineHeight: 22 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 4,
  },

  submitBtn: { paddingVertical: 14, borderRadius: radius.md, backgroundColor: PURPLE, alignItems: "center" },
  submitBtnText: { color: "#ffffff", fontWeight: "700", fontSize: fontSize.md },
  thumbBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(250,204,21,0.95)",
  },
  thumbBadgeText: { color: "#78350f", fontSize: 10, fontWeight: "700" },
  thumbStarBtn: {
    position: "absolute",
    bottom: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
})
