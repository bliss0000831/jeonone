/**
 * 인테리어 등록 — 광장 web /interior/register 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 인테리어 등록)
 *   - 사진 (최대 10장)
 *   - 시공종류 (INTERIOR_CATEGORIES 칩) *
 *   - 공간 (INTERIOR_SPACES 칩) — 본문에 [공간] 태그로 추가
 *   - 제목 *
 *   - 상세 설명 *
 *   - 시공 지역 / 동
 *   - 연락처 (프로필 phone 자동)
 *   - 가격 범위 (min~max + 단위)
 *   - 등록 버튼 (createInteriorPost)
 *
 * 권한 (account_type='interior' 또는 admin) 은 RLS 가 차단.
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
  createInteriorPost,
  INTERIOR_CATEGORIES,
  INTERIOR_SPACES,
} from "@gwangjang/features/interior"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, uploadImage } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { AddressSearch } from "@/components/AddressSearch"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const PURPLE = "#a855f7"

export default function InteriorRegisterScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const { user } = useAuth()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)

  const [consented, setConsented] = useState(false)
  const [regionId, setRegionId] = useState<string | null>(null)
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
    if (title.trim() || content.trim() || images.length > 0) setFormDirty(true)
  }, [title, content, images])

  // 권한 게이트 — account_type='interior' 또는 admin 만. 동시에 phone prefill.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      // 🅲 권한 게이트 — account_type/phone 은 plaza_profiles 우선, role 은 global
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("account_type, role, phone")
          .eq("id", user.id)
          .maybeSingle(),
        DEFAULT_PLAZA
          ? supabase
              .from("plaza_profiles")
              .select("account_type, phone")
              .eq("user_id", user.id)
              .eq("plaza_id", DEFAULT_PLAZA)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      const prof: any = profRes?.data || {}
      const pp: any = (ppRes as any)?.data || {}
      const t = (pp.account_type ?? prof.account_type) as string | undefined
      const r = prof.role as string | undefined
      const isAdmin = r === "admin" || r === "superadmin"
      if (!isAdmin && t !== "interior") {
        Alert.alert(
          "권한 필요",
          "인테리어 등록은 인테리어 전문가 계정만 가능합니다. 마이페이지 → 계정 유형 신청에서 전환할 수 있어요.",
          [{ text: "확인", onPress: () => router.back() }],
          { cancelable: false },
        )
        return
      }
      const p = (pp.phone ?? prof.phone) as string | undefined
      if (p) setContactPhone(p)
    })()
    return () => {
      cancelled = true
    }
  }, [user, router, DEFAULT_PLAZA])

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
    if (submitting || !user) return
    if (!title.trim() || !content.trim() || !category) {
      Alert.alert("입력 필요", "제목·상세 설명·시공종류는 필수입니다")
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
      const r = await createInteriorPost(getSupabase(), {
        plaza: DEFAULT_PLAZA,
        userId: user.id,
        title: title.trim(),
        content: content.trim(),
        category,
        space: spaces.length > 0 ? spaces.join(", ") : null,
        service_region: serviceRegion.trim() || null,
        service_district: serviceDistrict.trim() || null,
        service_dong: serviceDong.trim() || null,
        contact_phone: contactPhone.trim() || null,
        min_price: minPrice ? Number(minPrice) : null,
        max_price: maxPrice ? Number(maxPrice) : null,
        price_unit: priceUnit,
        career_years: careerYears ? Number(careerYears) : null,
        images,
      })
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      if (r.postId) await setPostRegion("interior_posts", r.postId, regionId)
      Alert.alert("등록 완료", "인테리어 글이 등록되었습니다")
      setFormDirty(false)
      if (r.postId) router.replace(`/interior/${r.postId}` as any)
      else router.back()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>인테리어 등록</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {/* Images */}
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

          <Field label="시공 종류 *">
            <View style={styles.chipWrap}>
              {INTERIOR_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.chip,
                    category === c
                      ? { backgroundColor: PURPLE }
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
                    style={[
                      styles.chip,
                      selected
                        ? { backgroundColor: PURPLE }
                        : { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? "#ffffff" : lightColors.ink900 },
                      ]}
                    >
                      {s}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </Field>

          <Field label="제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="예: 25평 아파트 전체 리모델링 시공"
              placeholderTextColor={lightColors.ink500}
              maxLength={100}
              style={styles.input}
            />
          </Field>

          <Field label="상세 설명 *">
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="시공 내용, 재료, 기간 등 자세히 적어주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={3000}
              style={[styles.input, styles.textarea]}
            />
          </Field>

          <Field label="사업장 위치">
            <AddressSearch
              value={
                [serviceRegion, serviceDistrict, serviceDong]
                  .filter(Boolean)
                  .join(" ")
              }
              onChange={(_addr, data) => {
                // Daum Postcode 결과 → sido/sigungu/bname 으로 분해 저장
                setServiceRegion(data?.sido ?? "")
                setServiceDistrict(data?.sigungu ?? "")
                setServiceDong(data?.bname ?? "")
              }}
              placeholder="주소를 검색해주세요"
            />
          </Field>

          <RegionFormField
            plazaId={DEFAULT_PLAZA}
            userId={user?.id}
            address={[serviceRegion, serviceDistrict, serviceDong].filter(Boolean).join(" ")}
            value={regionId}
            onChange={setRegionId}
          />

          <Field label="연락처">
            <TextInput
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="예: 010-0000-0000"
              placeholderTextColor={lightColors.ink500}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </Field>

          <Field label="가격 범위">
            <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "center" }}>
              <TextInput
                value={minPrice}
                onChangeText={(v) => setMinPrice(v.replace(/[^0-9]/g, ""))}
                placeholder="최소"
                placeholderTextColor={lightColors.ink500}
                keyboardType="number-pad"
                style={[styles.input, { flex: 1 }]}
              />
              <Text style={{ color: lightColors.ink500 }}>~</Text>
              <TextInput
                value={maxPrice}
                onChangeText={(v) => setMaxPrice(v.replace(/[^0-9]/g, ""))}
                placeholder="최대"
                placeholderTextColor={lightColors.ink500}
                keyboardType="number-pad"
                style={[styles.input, { flex: 1 }]}
              />
              <View style={{ minWidth: 60 }}>
                <TextInput
                  value={priceUnit}
                  onChangeText={setPriceUnit}
                  style={styles.input}
                />
              </View>
            </View>
          </Field>

          <Field label="경력 (년)">
            <TextInput
              value={careerYears}
              onChangeText={(v) => setCareerYears(v.replace(/[^0-9]/g, ""))}
              placeholder="예: 8"
              placeholderTextColor={lightColors.ink500}
              keyboardType="number-pad"
              style={styles.input}
              maxLength={2}
            />
          </Field>

          <RegisterConsentBlock serviceKind="service" onChange={setConsented} />

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
              <Text style={styles.submitBtnText}>인테리어 등록하기</Text>
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
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

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
