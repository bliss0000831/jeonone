/**
 * 로컬푸드 수정 — 광장 web /local-food/[id]/edit 미러.
 * register form + prefill + PATCH /api/local-food/[id].
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
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  getLocalFoodPost,
  updateLocalFoodPost,
  LOCAL_FOOD_CATEGORIES,
  LOCAL_FOOD_UNITS,
} from "@gwangjang/features/local-food"
import { gwangjangFetch, getSupabase, uploadImage } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const GREEN = "#16a34a"

export default function LocalFoodEditScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [price, setPrice] = useState("")
  const [originalPrice, setOriginalPrice] = useState("")
  const [unit, setUnit] = useState<string>(LOCAL_FOOD_UNITS[0])
  const [category, setCategory] = useState<string>(LOCAL_FOOD_CATEGORIES[0])
  // 원산지 + 농장명 (location 컬럼 재활용)
  const [origin, setOrigin] = useState("")
  const [farmName, setFarmName] = useState("")
  const [shippingFee, setShippingFee] = useState("")
  const [freeShipping, setFreeShipping] = useState(false)
  const [visibility, setVisibility] = useState<"plaza" | "national">("plaza")
  const [formDirty, setFormDirty] = useState(false)
  const loadedRef = useRef(false)
  useUnsavedChangesGuard(formDirty)

  useEffect(() => {
    if (loadedRef.current) setFormDirty(true)
  }, [title, description, content, images, price, category, origin, farmName])

  useEffect(() => {
    if (!id) return
    getLocalFoodPost(getSupabase(), id, DEFAULT_PLAZA, null).then(({ post }) => {
      if (post) {
        setTitle(post.title || "")
        setDescription(post.description || "")
        setContent(post.content || "")
        setPrice(String(post.price || ""))
        setOriginalPrice(post.original_price ? String(post.original_price) : "")
        setUnit(post.unit || LOCAL_FOOD_UNITS[0])
        setCategory(post.category || LOCAL_FOOD_CATEGORIES[0])
        setOrigin(post.location || "")
        setFarmName((post as any).farm_name || "")
        setShippingFee((post as any).shipping_fee ? String((post as any).shipping_fee) : "")
        setFreeShipping(!!(post as any).free_shipping)
        setVisibility((post as any).visibility === "national" ? "national" : "plaza")
        setImages(post.images ?? [])
      }
      setLoading(false)
      loadedRef.current = true
    })
  }, [id])

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
      // 웹: blob:/data: 등 스킴 있는 URI 는 그대로 — file:// 붙이면 깨져 미리보기 안 됨
      if (u.includes(":")) return u
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
    if (submitting || !id) return
    if (!title.trim()) {
      Alert.alert("입력 필요", "상품명을 입력해주세요")
      return
    }
    const priceNum = Number(price)
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("가격 오류", "가격을 정확히 입력해주세요")
      return
    }
    setSubmitting(true)
    try {
      const r = await updateLocalFoodPost(
        (u, init) => gwangjangFetch(u, init as any),
        id,
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
        Alert.alert("수정 실패", r.error ?? "")
        return
      }
      setFormDirty(false)
      Alert.alert("수정 완료", "로컬푸드 글이 수정되었습니다")
      router.replace(`/local-food/${id}` as any)
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
        <Text style={styles.headerTitle}>로컬푸드 수정</Text>
        <Pressable onPress={handleSubmit} disabled={submitting || uploading} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : uploading ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><ActivityIndicator size="small" color="#ffffff" /><Text style={styles.saveBtnText}>업로드 중</Text></View> : <Text style={styles.saveBtnText}>저장</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
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

          <Field label="상품명 *">
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={lightColors.ink500} />
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
                  borderColor: freeShipping ? "#16a34a" : lightColors.border,
                  backgroundColor: freeShipping ? "#16a34a" : "transparent",
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
                  style={[styles.chip, category === c ? { backgroundColor: GREEN } : { backgroundColor: lightColors.muted }]}
                >
                  <Text style={[styles.chipText, { color: category === c ? "#ffffff" : lightColors.ink900 }]}>{c}</Text>
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
                <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="정가 (선택)">
                <TextInput value={originalPrice} onChangeText={(v) => setOriginalPrice(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            </View>
          </View>

          <Field label="판매 단위">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {LOCAL_FOOD_UNITS.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setUnit(u)}
                  style={[styles.chip, unit === u ? { backgroundColor: GREEN } : { backgroundColor: lightColors.muted }]}
                >
                  <Text style={[styles.chipText, { color: unit === u ? "#ffffff" : lightColors.ink900 }]}>{u}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="간단 설명">
            <TextInput value={description} onChangeText={setDescription} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="상세 설명">
            <TextInput value={content} onChangeText={setContent} multiline style={[styles.input, styles.textarea]} placeholderTextColor={lightColors.ink500} />
          </Field>

          {/* 거래 장소 / 동·면 필드 제거 — 농가명으로 대체 */}
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
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  saveBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md,
    backgroundColor: GREEN, minWidth: 60, alignItems: "center",
  },
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
  textarea: { minHeight: 100, textAlignVertical: "top" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },
})
