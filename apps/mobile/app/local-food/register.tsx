/**
 * 로컬푸드 등록 — 광장 web /local-food/register 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 로컬 푸드 등록)
 *   - 사진 (최대 10장)
 *   - 상품명 *
 *   - 카테고리 (LOCAL_FOOD_CATEGORIES 칩)
 *   - 가격 * + 원가(선택, 할인% 표시용)
 *   - 단위 (LOCAL_FOOD_UNITS 칩)
 *   - 한 줄 소개 (description)
 *   - 상세 설명 (content)
 *   - 위치 / 동
 *   - 등록 버튼 (createLocalFoodPost)
 *
 * 권한 검사 (account_type='producer' 또는 admin) 는 서버에서 처리.
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
  Image as RNImage,
} from "react-native"
import { Image as ExpoImage } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createLocalFoodPost,
  LOCAL_FOOD_CATEGORIES,
  LOCAL_FOOD_UNITS,
} from "@gwangjang/features/local-food"
import { getSupabase, gwangjangFetch, uploadImage } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const GREEN = "#16a34a"

export default function LocalFoodRegisterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const DEFAULT_PLAZA = useCurrentPlaza()
  // 권한 게이트 — web 1:1 (account_type !== 'producer' 차단)
  // 🅲 account_type 은 현재 광장 plaza_profiles 우선
  const [permChecking, setPermChecking] = useState(true)
  const [permAllowed, setPermAllowed] = useState(false)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("account_type, role")
          .eq("id", user.id)
          .maybeSingle(),
        DEFAULT_PLAZA
          ? supabase
              .from("plaza_profiles")
              .select("account_type")
              .eq("user_id", user.id)
              .eq("plaza_id", DEFAULT_PLAZA)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      const prof: any = profRes?.data || {}
      const pp: any = (ppRes as any)?.data || {}
      const t = pp.account_type ?? prof.account_type
      const r = prof.role
      const isAdmin = r === "admin" || r === "superadmin"
      if (!isAdmin && t !== "producer") {
        setPermChecking(false)
        Alert.alert(
          "권한 필요",
          "로컬푸드 등록은 생산자 계정만 가능합니다. 마이페이지 → 계정 유형 신청에서 전환할 수 있어요.",
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
  }, [user, router, DEFAULT_PLAZA])
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [price, setPrice] = useState("")
  const [originalPrice, setOriginalPrice] = useState("")
  const [unit, setUnit] = useState<string>(LOCAL_FOOD_UNITS[0])
  const [category, setCategory] = useState<string>(LOCAL_FOOD_CATEGORIES[0])
  // 원산지 + 농장명 (location 컬럼을 원산지 텍스트로 재활용)
  const [origin, setOrigin] = useState("")
  const [farmName, setFarmName] = useState("")
  const [shippingFee, setShippingFee] = useState("")
  const [freeShipping, setFreeShipping] = useState(false)
  const [visibility, setVisibility] = useState<"plaza" | "national">("plaza")

  useEffect(() => {
    if (title.trim()) setFormDirty(true)
  }, [title])

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
        assets.map((a) => uploadImage(a.uri, "local_food")),
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
    if (!title.trim()) {
      Alert.alert("입력 필요", "상품명을 입력해주세요")
      return
    }
    const priceNum = Number(price)
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("가격 오류", "가격을 정확히 입력해주세요")
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
      const r = await createLocalFoodPost(
        (u, init) => gwangjangFetch(u, init as any),
        {
          title: title.trim(),
          description: description.trim() || null,
          content: content.trim() || null,
          price: priceNum,
          original_price: originalPrice ? Number(originalPrice) : null,
          unit,
          category,
          location: origin.trim() || null,
          district: null,
          farm_name: farmName.trim() || null,
          shipping_fee: freeShipping ? 0 : (shippingFee ? Number(shippingFee) : 0),
          free_shipping: freeShipping,
          images,
          visibility,
        } as any,
      )
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      Alert.alert("등록 완료", "로컬푸드 글이 등록되었습니다")
      setFormDirty(false)
      if (r.postId) router.replace(`/local-food/${r.postId}` as any)
      else router.back()
    } finally {
      setSubmitting(false)
    }
  }

  // 권한 확인 중 / 미허용 시 폼 대신 로딩만 표시
  if (permChecking || !permAllowed) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]} edges={["top"]}>
        <ActivityIndicator size="large" color={GREEN} />
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
          <Ionicons name="leaf" size={18} color={GREEN} />
          <Text style={styles.headerTitle}>로컬 푸드 등록</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {/* Images */}
          <View>
            <Text style={styles.label}>상품 이미지 (최대 {MAX_IMAGES}장)</Text>
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

          <Field label="상품명 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="예: 춘천 햇사과 (꿀맛)"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
            />
          </Field>

          <Field label="원산지">
            <TextInput
              value={origin}
              onChangeText={setOrigin}
              placeholder="예: 강원도 춘천시"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
              maxLength={60}
            />
          </Field>

          <Field label="판매처 (선택)">
            <TextInput
              value={farmName}
              onChangeText={setFarmName}
              placeholder="예: 행복농원 (비우면 닉네임 사용)"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
              maxLength={60}
            />
          </Field>

          <Field label="배송비 (원)">
            <TextInput
              value={freeShipping ? "" : shippingFee}
              onChangeText={(v) => setShippingFee(v.replace(/[^0-9]/g, ""))}
              placeholder={freeShipping ? "무료배송" : "예: 3000"}
              placeholderTextColor={lightColors.ink500}
              keyboardType="number-pad"
              style={styles.input}
              editable={!freeShipping}
            />
            <Pressable
              onPress={() => setFreeShipping((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}
              hitSlop={8}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: freeShipping ? GREEN : lightColors.border,
                  backgroundColor: freeShipping ? GREEN : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {freeShipping && <Ionicons name="checkmark" size={12} color="#ffffff" />}
              </View>
              <Text style={{ fontSize: 14, color: lightColors.ink900 }}>무료배송</Text>
            </Pressable>
          </Field>

          <Field label="카테고리">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {LOCAL_FOOD_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.chip,
                    category === c
                      ? { backgroundColor: GREEN }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: category === c ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="노출 범위">
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {(["plaza", "national"] as const).map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setVisibility(v)}
                  style={[
                    styles.chip,
                    visibility === v
                      ? { backgroundColor: GREEN }
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

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="판매가 *">
                <TextInput
                  value={price}
                  onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))}
                  placeholder="10000"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="정가 (선택)">
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
          </View>

          <Field label="판매 단위">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {LOCAL_FOOD_UNITS.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setUnit(u)}
                  style={[
                    styles.chip,
                    unit === u
                      ? { backgroundColor: GREEN }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: unit === u ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {u}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="간단 설명">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="상품 요약을 한 줄로 적어주세요"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
            />
          </Field>

          <Field label="상세 설명">
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="재배 방식, 산지, 보관법 등을 자세히 적어주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={3000}
              style={[styles.input, styles.textarea]}
            />
          </Field>

          {/* 거래 장소 / 동·면 필드 제거 — 농가명으로 대체 */}

          <RegisterConsentBlock serviceKind="localFood" onChange={setConsented} />

          <Pressable
            onPress={handleSubmit}
            disabled={submitting || uploading || !consented}
            style={[styles.submitBtn, (submitting || !consented) && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : uploading ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.submitBtnText}>업로드 중...</Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>로컬 푸드 등록하기</Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
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
  textarea: { minHeight: 100, textAlignVertical: "top" },

  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  submitBtn: {
    paddingVertical: 14, borderRadius: radius.md,
    backgroundColor: GREEN, alignItems: "center",
  },
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
