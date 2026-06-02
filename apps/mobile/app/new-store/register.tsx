/**
 * 신장개업 등록 — 광장 web /new-store/register 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 신장개업 등록)
 *   - 사진 (최대 10장)
 *   - 가게명 *
 *   - 카테고리 (NEW_STORE_CATEGORIES 칩)
 *   - 가게 소개 *
 *   - 주소 *
 *   - 전화번호
 *   - 오픈 예정일 (YYYY-MM-DD)
 *   - 오픈 이벤트
 *   - 등록 버튼 (createNewStorePost — POST /api/new-store)
 *
 * 권한 검사 (account_type='business' or admin) 는 서버에서 처리.
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
import {
  createNewStorePost,
  NEW_STORE_CATEGORIES as DEFAULT_CATEGORIES,
} from "@gwangjang/features/new-store"
import { getSupabase, gwangjangFetch, uploadImage } from "@/lib/supabase"
import { DatePickerField } from "@/components/DatePickerField"
import { AddressSearch } from "@/components/AddressSearch"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const STORE_BLUE = "#3b82f6"

export default function NewStoreRegisterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const [regionId, setRegionId] = useState<string | null>(null)
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
        plazaId
          ? supabase
              .from("plaza_profiles")
              .select("account_type")
              .eq("user_id", user.id)
              .eq("plaza_id", plazaId)
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
          "신장개업 등록은 사업자 계정만 가능합니다. 마이페이지 → 계정 유형 신청에서 전환할 수 있어요.",
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
  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [storeName, setStoreName] = useState("")
  const [description, setDescription] = useState("")
  const [categories, setCategories] = useState<readonly string[]>(DEFAULT_CATEGORIES)
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORIES[0])

  // 웹 /new-store/register 와 1:1 — categories 테이블에서 type='new_store' fetch
  useEffect(() => {
    gwangjangFetch("/api/categories?type=new_store")
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data.map((c) => c.name))
          setCategory(data[0].name)
        }
      })
      .catch(() => {})
  }, [])
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [openingDate, setOpeningDate] = useState("")
  const [openingEvent, setOpeningEvent] = useState("")

  useEffect(() => {
    if (storeName.trim()) setFormDirty(true)
  }, [storeName])

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, // 이미지 + 동영상 (web 1:1)
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.8,
    })
    if (!result.assets || result.assets.length === 0) return
    const assets = result.assets.slice(0, MAX_IMAGES - images.length)
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
        assets.map((a) => uploadImage(a.uri, "new_store")),
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

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (submitting) return
    if (!storeName.trim() || !description.trim() || !address.trim()) {
      Alert.alert("입력 필요", "가게명·소개·주소는 필수입니다")
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
      const r = await createNewStorePost(
        (u, init) => gwangjangFetch(u, init as any),
        {
          store_name: storeName.trim(),
          description: description.trim(),
          category,
          address: address.trim(),
          phone: phone.trim() || null,
          opening_date: openingDate.trim() || null,
          opening_event: openingEvent.trim() || null,
          images,
        },
      )
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      if (r.postId) await setPostRegion("new_store_posts", r.postId, regionId)
      Alert.alert("등록 완료", "신장개업 글이 등록되었습니다")
      setFormDirty(false)
      if (r.postId) router.replace(`/new-store/${r.postId}` as any)
      else router.back()
    } finally {
      setSubmitting(false)
    }
  }

  // 권한 확인 중 / 미허용 시 폼 대신 로딩만 표시
  if (permChecking || !permAllowed) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]} edges={["top"]}>
        <ActivityIndicator size="large" color={STORE_BLUE} />
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
          <Ionicons name="storefront" size={18} color={STORE_BLUE} />
          <Text style={styles.headerTitle}>신장개업 등록</Text>
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
            <Text style={styles.label}>사진 (최대 {MAX_IMAGES}장)</Text>
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
                  <Pressable onPress={() => removeImage(idx)} style={styles.imgRemove} hitSlop={6}>
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

          <Field label="매장명 *">
            <TextInput
              value={storeName}
              onChangeText={setStoreName}
              placeholder="예: 춘천 베이커리"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
              maxLength={60}
            />
          </Field>

          <Field label="업종">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {categories.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.chip,
                    category === c
                      ? { backgroundColor: STORE_BLUE }
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

          <Field label="매장 소개 *">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="우리 가게를 자세히 소개해주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={3000}
              style={[styles.input, styles.textarea]}
            />
          </Field>

          <Field label="매장 위치 *">
            <AddressSearch
              value={address}
              onChange={(addr) => setAddress(addr)}
              placeholder="주소를 검색해주세요"
            />
          </Field>

          <RegionFormField
            plazaId={plazaId}
            userId={user?.id}
            address={address}
            value={regionId}
            onChange={setRegionId}
          />

          <Field label="전화번호">
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="예: 033-000-0000"
              placeholderTextColor={lightColors.ink500}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </Field>

          <Field label="오픈일">
            <DatePickerField
              value={openingDate}
              onChange={setOpeningDate}
              mode="date"
              placeholder="날짜 선택"
              clearable
            />
          </Field>

          <Field label="오픈 이벤트">
            <TextInput
              value={openingEvent}
              onChangeText={setOpeningEvent}
              placeholder="예: 오픈 기념 전 메뉴 20% 할인!"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
            />
          </Field>

          <RegisterConsentBlock serviceKind="newStore" onChange={setConsented} />

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
              <Text style={styles.submitBtnText}>신장개업 등록하기</Text>
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
  label: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },

  imgWrap: { width: 100, height: 100, position: "relative", overflow: "visible" },
  img: { width: 100, height: 100, borderRadius: radius.md },
  imgRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  imgPick: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  input: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
    fontSize: 15,
    color: lightColors.ink900,
  },
  textarea: { minHeight: 100, textAlignVertical: "top" },

  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  submitBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: STORE_BLUE,
    alignItems: "center",
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
