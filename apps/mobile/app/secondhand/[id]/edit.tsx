/**
 * 중고거래 글 수정 — 광장 web /secondhand/[id]/edit 1:1 미러.
 * register form 동일 + prefill + PATCH /api/secondhand/[id].
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
  Image as RNImage,
  View,
} from "react-native"
import { Image as ExpoImage } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  getSecondhandPost,
  updateSecondhandPost,
  SECONDHAND_CATEGORIES,
  SECONDHAND_CONDITIONS,
} from "@gwangjang/features/secondhand"
import { gwangjangFetch, getSupabase, uploadImage } from "@/lib/supabase"
import { AddressSearch } from "@/components/AddressSearch"
import { useCurrentPlaza } from "@/lib/plaza"
import { useAuth } from "@/lib/auth-context"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const AMBER = "#f59e0b"

export default function SecondhandEditScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { user } = useAuth()
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
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<string>(SECONDHAND_CATEGORIES[0])
  const [price, setPrice] = useState("")
  const [isPriceNegotiable, setIsPriceNegotiable] = useState(false)
  const [location, setLocation] = useState("")
  const [regionId, setRegionId] = useState<string | null>(null)
  const [condition, setCondition] = useState<string>("")

  useEffect(() => {
    if (!id) return
    getSecondhandPost(getSupabase(), id, DEFAULT_PLAZA, null).then(({ post }) => {
      if (post) {
        setTitle(post.title || "")
        setDescription(post.description || "")
        setCategory(post.category || SECONDHAND_CATEGORIES[0])
        setPrice(String(post.price || ""))
        setIsPriceNegotiable(!!post.is_price_negotiable)
        setImages(post.images ?? [])
        setLocation(post.location || "")
        setCondition(((post as any).condition as string) || "")
        setRegionId((post as any).region_id ?? null)
      }
      setLoading(false)
      loadedRef.current = true
    })
  }, [id])

  useEffect(() => {
    if (loadedRef.current) setFormDirty(true)
  }, [title, description])

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
        assets.map((a) => uploadImage(a.uri, "secondhand")),
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
    if (!title.trim() || !description.trim()) {
      Alert.alert("입력 필요", "제목과 설명을 입력해주세요")
      return
    }
    const priceNum = Number(price) || 0
    if (priceNum < 0) {
      Alert.alert("가격 오류", "올바른 가격을 입력해주세요")
      return
    }
    // 업로드 중/실패한 로컬 이미지(file://) 가 남아있으면 제출 차단 — 깨진 이미지 저장 방지
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
      const r = await updateSecondhandPost(
        (u, init) => gwangjangFetch(u, init as any),
        id,
        {
          title: title.trim(),
          description: description.trim(),
          category,
          price: priceNum,
          isPriceNegotiable,
          images,
          location: location.trim() || null,
          condition: condition || null,
        },
      )
      if (!r.ok) {
        Alert.alert("수정 실패", r.error ?? "")
        return
      }
      await setPostRegion("secondhand_posts", id, regionId)
      Alert.alert("수정 완료", "중고거래 글이 수정되었습니다")
      setFormDirty(false)
      router.replace(`/secondhand/${id}` as any)
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
        <Text style={styles.headerTitle}>중고거래 수정</Text>
        <Pressable onPress={handleSubmit} disabled={submitting || uploading} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : uploading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.saveBtnText}>업로드 중</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>저장</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <View>
            <Text style={styles.label}>사진 (최대 {MAX_IMAGES}장)</Text>
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
                  {uploading ? (
                    <ActivityIndicator size="small" color={lightColors.ink500} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={24} color={lightColors.ink500} />
                  )}
                </Pressable>
              )}
            </ScrollView>
          </View>

          <Field label="제목 *">
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={lightColors.ink500} />
          </Field>

          <Field label="카테고리">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {SECONDHAND_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.chip,
                    category === c ? { backgroundColor: AMBER } : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text style={[styles.chipText, { color: category === c ? "#ffffff" : lightColors.ink900 }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="상품 상태 (선택)">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {SECONDHAND_CONDITIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCondition((prev) => (prev === c ? "" : c))}
                  style={[
                    styles.chip,
                    condition === c ? { backgroundColor: AMBER } : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text style={[styles.chipText, { color: condition === c ? "#ffffff" : lightColors.ink900 }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="가격 (원)">
            <TextInput
              value={price}
              onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              style={styles.input}
              placeholderTextColor={lightColors.ink500}
            />
            <Pressable onPress={() => setIsPriceNegotiable((v) => !v)} style={styles.checkRow}>
              <View style={[styles.checkbox, isPriceNegotiable && { backgroundColor: AMBER, borderColor: AMBER }]}>
                {isPriceNegotiable && <Ionicons name="checkmark" size={12} color="#ffffff" />}
              </View>
              <Text style={styles.checkLabel}>가격 제안 받기</Text>
            </Pressable>
          </Field>

          <Field label="설명 *">
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              style={[styles.input, styles.textarea]}
              placeholderTextColor={lightColors.ink500}
            />
          </Field>

          <Field label="거래 희망장소">
            <AddressSearch
              value={location}
              onChange={(addr) => setLocation(addr)}
              placeholder="주소를 검색해주세요"
            />
          </Field>

          <RegionFormField
            plazaId={DEFAULT_PLAZA}
            userId={user?.id}
            address={location}
            value={regionId}
            onChange={setRegionId}
            skipAutoDefault
          />
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
    backgroundColor: AMBER, minWidth: 60, alignItems: "center",
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
  textarea: { minHeight: 140, textAlignVertical: "top", lineHeight: 22 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing[2] },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: lightColors.border,
    alignItems: "center", justifyContent: "center",
  },
  checkLabel: { fontSize: fontSize.sm, color: lightColors.ink900 },
})
