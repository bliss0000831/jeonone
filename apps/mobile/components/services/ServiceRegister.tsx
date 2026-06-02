/**
 * 서비스 등록 공용 컴포넌트 — moving / cleaning / repair 등록 thin wrapper 가 사용.
 * 광장 web /<kind>/register 1:1 미러 (interior 와 동일 구조).
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
  createServicePost,
  SERVICE_CATEGORIES,
  SERVICE_META,
  type ServiceKind,
} from "@gwangjang/features/services"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, uploadImage } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { AddressSearch } from "@/components/AddressSearch"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const INTERIOR_SPACES = ["아파트", "빌라", "원룸", "상가", "사무실"]

export function ServiceRegister({ kind }: { kind: ServiceKind }) {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const { user } = useAuth()
  const meta = SERVICE_META[kind]
  const categories = SERVICE_CATEGORIES[kind]

  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)

  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [regionId, setRegionId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState<string>(categories[0])
  const [serviceRegion, setServiceRegion] = useState("")
  const [serviceDistrict, setServiceDistrict] = useState("")
  const [serviceDong, setServiceDong] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  // 인테리어 전용 — 공간 (아파트/빌라/원룸/상가/사무실). 본문에 태그로 합쳐 저장 (웹 1:1)
  const [space, setSpace] = useState("")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [priceUnit, setPriceUnit] = useState("만원")
  const [careerYears, setCareerYears] = useState("")

  // formDirty — 폼 입력 시 dirty 처리 (제목/내용/이미지/카테고리/지역)
  const phoneLoadedRef = useRef(false)
  useEffect(() => {
    if (title.trim() || content.trim() || images.length > 0) setFormDirty(true)
  }, [title, content, images, category, serviceRegion, serviceDistrict])

  // 권한 게이트 — kind 와 account_type 이 일치하거나 admin/superadmin 만 등록 가능
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      // 🅲 광장 격리 — account_type/phone 은 plaza_profiles 우선 (role 은 글로벌)
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase.from("profiles").select("account_type, role, phone")
          .eq("id", user.id).maybeSingle(),
        DEFAULT_PLAZA
          ? supabase.from("plaza_profiles").select("account_type, phone")
              .eq("user_id", user.id).eq("plaza_id", DEFAULT_PLAZA).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      const data: any = profRes.data || {}
      const pp: any = ppRes?.data || {}
      const t = (pp.account_type ?? data.account_type) as string | undefined
      const r = data.role as string | undefined
      const isAdmin = r === "admin" || r === "superadmin"
      const labelMap: Record<string, string> = {
        interior: "인테리어",
        moving: "이사",
        cleaning: "청소",
        repair: "수리",
      }
      if (!isAdmin && t !== kind) {
        Alert.alert(
          "권한 필요",
          `${labelMap[kind] || kind} 서비스 등록은 ${labelMap[kind] || kind} 전문가 계정만 가능합니다. 마이페이지 → 계정 유형 신청에서 전환할 수 있어요.`,
          [{ text: "확인", onPress: () => router.back() }],
          { cancelable: false },
        )
        return
      }
      // phone prefill — plaza phone 우선
      const p = (pp.phone ?? data.phone) as string | undefined
      if (p) setContactPhone(p)
    })()
    return () => {
      cancelled = true
    }
  }, [user, kind, router])

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
        assets.map((a) => uploadImage(a.uri, kind)),
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
    if (!title.trim() || !content.trim()) {
      Alert.alert("입력 필요", "제목과 내용을 입력해주세요")
      return
    }
    // 업로드 실패한 로컬 이미지(file://) 가 남아있으면 제출 차단 — 깨진 이미지 방지
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
      const r = await createServicePost(getSupabase(), kind, {
        plaza: DEFAULT_PLAZA,
        userId: user.id,
        title: title.trim(),
        content:
          kind === "interior" && space
            ? `${content.trim()}\n\n[공간] ${space}`
            : content.trim(),
        category,
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
      // 서비스 도메인 테이블 매핑 (interior 는 별도 register 페이지 사용)
      const table =
        kind === "moving" ? "moving_posts" :
        kind === "cleaning" ? "cleaning_posts" :
        kind === "repair" ? "repair_posts" : null
      if (r.postId && table) await setPostRegion(table, r.postId, regionId)
      Alert.alert("등록 완료", `${meta.label} 글이 등록되었습니다`)
      setFormDirty(false)
      if (r.postId) router.replace(`/${kind}/${r.postId}` as any)
      else router.back()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>{meta.label} 등록</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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

          {kind === "interior" && (
            <Field label="공간">
              <View style={styles.chipWrap}>
                {INTERIOR_SPACES.map((sp) => (
                  <Pressable
                    key={sp}
                    onPress={() => setSpace((s) => (s === sp ? "" : sp))}
                    style={[
                      styles.chip,
                      space === sp
                        ? { backgroundColor: meta.bg }
                        : { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: space === sp ? "#ffffff" : lightColors.ink900 },
                      ]}
                    >
                      {sp}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>
          )}

          <Field label={`${meta.label} 종류 *`}>
            <View style={styles.chipWrap}>
              {categories.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.chip,
                    category === c
                      ? { backgroundColor: meta.bg }
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

          <Field label="제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={`예: ${meta.label} 전문 업체`}
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
              maxLength={80}
              accessibilityLabel="서비스 제목 입력"
            />
          </Field>

          <Field label="상세 설명 *">
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="서비스 내용, 차별점, 경력 등을 자세히 적어주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={3000}
              style={[styles.input, styles.textarea]}
              accessibilityLabel="서비스 상세 설명 입력"
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
              accessibilityLabel="연락처 입력"
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
            style={[styles.submitBtn, { backgroundColor: meta.bg }, (submitting || !consented) && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : uploading ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.submitBtnText}>업로드 중...</Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>{meta.label} 등록하기</Text>
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
  label: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900, marginBottom: spacing[2] },

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

  submitBtn: { paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
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
