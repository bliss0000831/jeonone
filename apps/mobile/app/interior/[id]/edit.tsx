/**
 * 인테리어 수정 — 광장 web /interior/[id]/edit 미러.
 * register form + prefill + supabase direct update.
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
  getInteriorPost,
  updateInteriorPost,
  INTERIOR_CATEGORIES,
  INTERIOR_SPACES,
} from "@gwangjang/features/interior"
import { getSupabase, uploadImage } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { AddressSearch } from "@/components/AddressSearch"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const PURPLE = "#a855f7"

// content 에서 [공간] 태그 추출
function extractSpace(content: string | null): { content: string; space: string } {
  if (!content) return { content: "", space: "" }
  const m = content.match(/\n*\[공간\]\s*([^\n]+)\s*$/)
  if (m) {
    return { content: content.replace(/\n*\[공간\][^\n]*$/, "").trim(), space: m[1].trim() }
  }
  return { content, space: "" }
}

export default function InteriorEditScreen() {
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
  const [content, setContent] = useState("")
  const [category, setCategory] = useState<string>(INTERIOR_CATEGORIES[0])
  const [spaces, setSpaces] = useState<string[]>([])
  const [serviceRegion, setServiceRegion] = useState("")
  const [serviceDistrict, setServiceDistrict] = useState("")
  const [serviceDong, setServiceDong] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [priceUnit, setPriceUnit] = useState("만원")
  const [careerYears, setCareerYears] = useState("")

  useEffect(() => {
    if (!id) return
    getInteriorPost(getSupabase(), id, DEFAULT_PLAZA, null).then(({ post }) => {
      if (post) {
        setTitle(post.title || "")
        const ex = extractSpace(post.content || "")
        setContent(ex.content)
        setSpaces(
          ex.space
            ? ex.space.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        )
        setCategory(post.category || INTERIOR_CATEGORIES[0])
        setServiceRegion(post.service_region || "")
        setServiceDistrict(post.service_district || "")
        setServiceDong((post as any).service_dong || "")
        setContactPhone(post.contact_phone || "")
        setMinPrice(post.min_price ? String(post.min_price) : "")
        setMaxPrice(post.max_price ? String(post.max_price) : "")
        setCareerYears((post as any).career_years ? String((post as any).career_years) : "")
        setPriceUnit(post.price_unit || "만원")
        setImages(post.images ?? [])
      }
      setLoading(false)
      loadedRef.current = true
    })
  }, [id])

  useEffect(() => {
    if (loadedRef.current) setFormDirty(true)
  }, [title, content])

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
        assets.map((a) => uploadImage(a.uri, "interior")),
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
    if (!title.trim() || !content.trim()) {
      Alert.alert("입력 필요", "제목·상세 설명은 필수입니다")
      return
    }
    setSubmitting(true)
    try {
      const r = await updateInteriorPost(getSupabase(), id, {
        plaza: DEFAULT_PLAZA,
        userId: "",  // server RLS check
        title: title.trim(),
        content: content.trim(),
        category,
        space: spaces.length > 0 ? spaces.join(", ") : null,
        service_region: serviceRegion.trim() || null,
        service_district: serviceDistrict.trim() || null,
        service_dong: serviceDong.trim() || null,
        contact_phone: contactPhone.trim() || null,
        min_price: minPrice ? Number(minPrice) : null,
        career_years: careerYears ? Number(careerYears) : null,
        max_price: maxPrice ? Number(maxPrice) : null,
        price_unit: priceUnit,
        images,
      })
      if (!r.ok) {
        Alert.alert("수정 실패", r.error ?? "")
        return
      }
      Alert.alert("수정 완료", "인테리어 글이 수정되었습니다")
      setFormDirty(false)
      router.replace(`/interior/${id}` as any)
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
        <Text style={styles.headerTitle}>인테리어 수정</Text>
        <Pressable onPress={handleSubmit} disabled={submitting || uploading} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : uploading ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><ActivityIndicator size="small" color="#ffffff" /><Text style={styles.saveBtnText}>업로드 중</Text></View> : <Text style={styles.saveBtnText}>저장</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <View>
            <Text style={styles.label}>시공 사진 (최대 {MAX_IMAGES}장)</Text>
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

          <Field label="시공 종류 *">
            <View style={styles.chipWrap}>
              {INTERIOR_CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c ? { backgroundColor: PURPLE } : { backgroundColor: lightColors.muted }]}>
                  <Text style={[styles.chipText, { color: category === c ? "#ffffff" : lightColors.ink900 }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="공간 (복수 선택)">
            <View style={styles.chipWrap}>
              {INTERIOR_SPACES.map((s) => {
                const selected = spaces.includes(s)
                return (
                  <Pressable
                    key={s}
                    onPress={() =>
                      setSpaces((cur) =>
                        cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
                      )
                    }
                    style={[styles.chip, selected ? { backgroundColor: PURPLE } : { backgroundColor: lightColors.muted }]}
                  >
                    <Text style={[styles.chipText, { color: selected ? "#ffffff" : lightColors.ink900 }]}>{s}</Text>
                  </Pressable>
                )
              })}
            </View>
          </Field>

          <Field label="제목 *">
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="상세 설명 *">
            <TextInput value={content} onChangeText={setContent} multiline style={[styles.input, styles.textarea]} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="사업장 위치">
            <AddressSearch
              value={
                [serviceRegion, serviceDistrict, serviceDong]
                  .filter(Boolean)
                  .join(" ")
              }
              onChange={(_addr, data) => {
                setServiceRegion(data?.sido ?? "")
                setServiceDistrict(data?.sigungu ?? "")
                setServiceDong(data?.bname ?? "")
              }}
              placeholder="주소를 검색해주세요"
            />
          </Field>

          <Field label="연락처">
            <TextInput value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="가격 범위">
            <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "center" }}>
              <TextInput value={minPrice} onChangeText={(v) => setMinPrice(v.replace(/[^0-9]/g, ""))} placeholder="최소" keyboardType="number-pad" style={[styles.input, { flex: 1 }]} placeholderTextColor={lightColors.ink500} />
              <Text style={{ color: lightColors.ink500 }}>~</Text>
              <TextInput value={maxPrice} onChangeText={(v) => setMaxPrice(v.replace(/[^0-9]/g, ""))} placeholder="최대" keyboardType="number-pad" style={[styles.input, { flex: 1 }]} placeholderTextColor={lightColors.ink500} />
              <View style={{ minWidth: 60 }}>
                <TextInput value={priceUnit} onChangeText={setPriceUnit} style={styles.input} />
              </View>
            </View>
          </Field>

          <Field label="경력 (년)">
            <TextInput
              value={careerYears}
              onChangeText={(v) => setCareerYears(v.replace(/[^0-9]/g, ""))}
              placeholder="예: 8"
              keyboardType="number-pad"
              style={styles.input}
              placeholderTextColor={lightColors.ink500}
              maxLength={2}
            />
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
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },
})
