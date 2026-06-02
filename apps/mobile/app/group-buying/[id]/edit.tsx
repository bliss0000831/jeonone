/**
 * 공동구매 수정 — 광장 web /group-buying/[id]/edit 미러.
 * register form + prefill + PATCH /api/group-buying/[id].
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
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { getPost, updateGroupBuyingPost } from "@gwangjang/features/group-buying"
import { gwangjangFetch, getSupabase, uploadImage } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { DatePickerField } from "@/components/DatePickerField"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const PURPLE = "#8b5cf6"

const DELIVERY_MODES = [
  { value: "pickup" as const, label: "픽업만" },
  { value: "delivery" as const, label: "배송만" },
  { value: "both" as const, label: "둘 다" },
]

export default function GroupBuyingEditScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const loadedRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
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

  useEffect(() => {
    if (!id) return
    getPost(getSupabase(), id, DEFAULT_PLAZA).then(({ post }) => {
      if (post) {
        setTitle(post.title || "")
        setProductName(post.product_name || "")
        setDescription(post.description || "")
        setOriginalPrice(post.original_price ? String(post.original_price) : "")
        setGroupPrice(String(post.group_price || ""))
        setMinParticipants(String(post.min_participants || 2))
        setMaxParticipants(post.max_participants ? String(post.max_participants) : "")
        setDeadline(post.deadline || "")
        // 위치/픽업 필드 폐기 — 배송 전용
        setVisibility((post as any).visibility === "national" ? "national" : "plaza")
        setImages(post.images ?? [])
      }
      setLoading(false)
      loadedRef.current = true
    })
  }, [id])

  useEffect(() => {
    if (loadedRef.current) setFormDirty(true)
  }, [title, description, images])

  async function pickImages() {
    try {
    if (images.length >= MAX_IMAGES) return
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    if (submitting || !id) return
    if (!title.trim() || !description.trim() || !productName.trim() || !groupPrice) {
      Alert.alert("입력 필요", "필수 항목을 모두 입력해주세요")
      return
    }
    const groupPriceNum = Number(groupPrice)
    const minPart = Number(minParticipants) || 2
    if (Number.isNaN(groupPriceNum) || groupPriceNum <= 0) {
      Alert.alert("가격 오류", "공구 가격은 1원 이상의 숫자여야 합니다")
      return
    }
    setSubmitting(true)
    try {
      const r = await updateGroupBuyingPost(
        (u, init) => gwangjangFetch(u, init as any),
        id,
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
          delivery_fee: deliveryFee ? Number(deliveryFee) : 0,
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
        Alert.alert("수정 실패", r.error ?? "")
        return
      }
      Alert.alert("수정 완료", "공동구매가 수정되었습니다")
      setFormDirty(false)
      router.replace(`/group-buying/${id}` as any)
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
        <Text style={styles.headerTitle}>공동구매 수정</Text>
        <Pressable onPress={handleSubmit} disabled={submitting || uploading} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : uploading ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><ActivityIndicator size="small" color="#ffffff" /><Text style={styles.saveBtnText}>업로드 중</Text></View> : <Text style={styles.saveBtnText}>저장</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
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
                  <Pressable onPress={() => setImages((p) => p.filter((_, i) => i !== idx))} style={styles.imgRemove} hitSlop={6}>
                    <Ionicons name="close" size={12} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <Pressable onPress={pickImages} style={styles.imgPick} disabled={uploading}>
                  {uploading ? <ActivityIndicator size="small" color={lightColors.ink500} /> : <Ionicons name="cloud-upload-outline" size={24} color={lightColors.ink500} />}
                </Pressable>
              )}
            </ScrollView>
          </View>

          <Field label="제목 *">
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="상품명 *">
            <TextInput value={productName} onChangeText={setProductName} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="정가 (할인 표시용)">
                <TextInput value={originalPrice} onChangeText={(v) => setOriginalPrice(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="공구가 *">
                <TextInput value={groupPrice} onChangeText={(v) => setGroupPrice(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="최소 인원">
                <TextInput value={minParticipants} onChangeText={(v) => setMinParticipants(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="최대 인원 (선택)">
                <TextInput value={maxParticipants} onChangeText={(v) => setMaxParticipants(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
          </View>

          <Field label="마감일">
            <DatePickerField value={deadline} onChange={setDeadline} mode="datetime" placeholder="마감 일시 선택" clearable />
          </Field>

          {/* 위치 필드 제거 — 배송 전용 */}

          {/* 받는 방법 선택 제거 — 배송 전용 */}

          {/* 참여 방식 폐기 — 공동구매는 항상 선결제 */}

          {/* 공개 범위 */}
          <Field label="공개 범위 *">
            <View style={styles.chipWrap}>
              {[
                { v: "plaza" as const, l: "현재 광장" },
                { v: "national" as const, l: "전체 광장" },
              ].map((m) => (
                <Pressable
                  key={m.v}
                  onPress={() => setVisibility(m.v)}
                  style={[
                    styles.chip,
                    visibility === m.v
                      ? { backgroundColor: PURPLE }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: visibility === m.v ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {m.l}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          {/* 배송비 처리 */}
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

          {/* 입금 계좌 필드 제거 — 선결제(에스크로)라 불필요 */}

          <Field label="상세 설명 *">
            <TextInput value={description} onChangeText={setDescription} multiline style={[styles.input, styles.textarea]} placeholderTextColor={lightColors.ink500} />
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
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: PURPLE, minWidth: 60, alignItems: "center" },
  saveBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

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

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
})
