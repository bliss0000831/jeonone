/**
 * 매물 수정 — 광장 web /property/[id]/edit 미러 (RN 핵심 필드).
 * register form + prefill + PATCH /api/properties/[id].
 *
 * 지도/panorama/instagram/youtube 는 RN 미지원 — 핵심 필드만.
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
  Switch,
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
  getProperty,
  updatePropertyPost,
  PROPERTY_TYPES,
  PROPERTY_TRANSACTION_TYPES,
  PROPERTY_DIRECTIONS,
  PROPERTY_FEATURES,
} from "@gwangjang/features/property"
import { gwangjangFetch, getSupabase, uploadImage } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"
import { useAuth } from "@/lib/auth-context"
import { AddressSearch } from "@/components/AddressSearch"
import { AddressMapPreview } from "@/components/AddressMapPreview"
import { DatePickerField } from "@/components/DatePickerField"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"
import { isValidInstagramPostUrl, normalizeInstagramUrl } from "@/lib/integrations/instagram"
import { isValidYouTubeUrl, normalizeYouTubeUrl } from "@/lib/integrations/youtube"

const MAX_IMAGES = 10
const BLUE = "#2563eb"

export default function PropertyEditScreen() {
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

  const [propertyType, setPropertyType] = useState<string>("")
  const [transactionType, setTransactionType] = useState<string>("")
  const [price, setPrice] = useState("")
  const [deposit, setDeposit] = useState("")
  const [monthlyRent, setMonthlyRent] = useState("")
  const [maintenanceFee, setMaintenanceFee] = useState("")
  const [area, setArea] = useState("")
  const [floor, setFloor] = useState("")
  const [totalFloors, setTotalFloors] = useState("")
  const [rooms, setRooms] = useState("1")
  const [bathrooms, setBathrooms] = useState("1")
  const [direction, setDirection] = useState<string>("")
  const [parking, setParking] = useState(false)
  const [elevator, setElevator] = useState(false)
  const [petAllowed, setPetAllowed] = useState(false)
  const [moveInDate, setMoveInDate] = useState("")
  const [address, setAddress] = useState("")
  const [addressDetail, setAddressDetail] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [features, setFeatures] = useState<string[]>([])
  const [regionId, setRegionId] = useState<string | null>(null)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [instagramPostUrl, setInstagramPostUrl] = useState("")
  const [youtubePostUrl, setYoutubePostUrl] = useState("")

  useEffect(() => {
    if (!id) return
    getProperty(getSupabase(), id, DEFAULT_PLAZA).then((res: any) => {
      const post = res?.property ?? res
      if (post) {
        setPropertyType(post.property_type || "")
        setTransactionType(post.transaction_type || "")
        if (post.transaction_type === "월세") {
          setDeposit(String(post.price || ""))
          setMonthlyRent(String(post.monthly_rent || ""))
        } else {
          setPrice(String(post.price || ""))
        }
        setMaintenanceFee(post.maintenance_fee ? String(post.maintenance_fee) : "")
        setArea(post.area_sqm ? String(post.area_sqm) : "")
        setFloor(post.floor_info || "")
        setTotalFloors(post.total_floors ? String(post.total_floors) : "")
        setRooms(String(post.rooms || 1))
        setBathrooms(String(post.bathrooms || 1))
        setDirection(post.direction || "")
        setParking(!!post.parking)
        setElevator(!!post.elevator)
        setPetAllowed(!!post.pet_allowed)
        setMoveInDate(post.move_in_date || "")
        setAddress(post.address || "")
        setAddressDetail(post.address_detail || "")
        setTitle(post.title || "")
        setDescription(post.description || "")
        setFeatures(Array.isArray(post.features) ? post.features : [])
        setImages(Array.isArray(post.images) ? post.images : [])
        setLat(post.lat != null ? Number(post.lat) : null)
        setLng(post.lng != null ? Number(post.lng) : null)
        setInstagramPostUrl(post.instagram_post_url || "")
        setYoutubePostUrl(post.youtube_post_url || "")
        setRegionId((post as any).region_id ?? null)
      }
      setLoading(false)
      loadedRef.current = true
    })
  }, [id])

  useEffect(() => {
    if (loadedRef.current) setFormDirty(true)
  }, [title, description, price, deposit, monthlyRent, area, images])

  function toggleFeature(f: string) {
    setFeatures((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))
  }

  async function pickImages() {
    try {
      if (images.length >= MAX_IMAGES) return
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All, // 이미지 + 동영상 (등록 화면과 통일)
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - images.length,
        quality: 0.8,
      })
      if (!r.assets || r.assets.length === 0) return

      const assets = r.assets.slice(0, MAX_IMAGES - images.length)
      const localUris = assets.map((a) => a.uri)

      setImages((p) => [...p, ...localUris].slice(0, MAX_IMAGES))

      setUploading(true)
      try {
        const settled = await Promise.allSettled(
          assets.map((a) => uploadImage(a.uri, "property")),
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
    if (!propertyType || !transactionType) {
      Alert.alert("입력 필요", "거래 유형과 매물 종류를 선택해주세요")
      return
    }
    if (!title.trim() || !description.trim() || !address.trim() || !area) {
      Alert.alert("입력 필요", "제목·상세 설명·주소·면적은 필수입니다")
      return
    }
    let priceNum = 0
    let monthlyRentNum: number | null = null
    if (transactionType === "월세") {
      priceNum = Number(deposit) || 0
      monthlyRentNum = Number(monthlyRent) || 0
    } else {
      priceNum = Number(price) || 0
    }
    if (priceNum <= 0) {
      Alert.alert("가격 오류", transactionType === "월세" ? "보증금을 입력해주세요" : "가격을 입력해주세요")
      return
    }
    // 월세는 월세 금액(*)도 필수
    if (transactionType === "월세" && (monthlyRentNum ?? 0) <= 0) {
      Alert.alert("입력 필요", "월세 금액을 입력해주세요")
      return
    }

    // Instagram / YouTube URL 유효성 검증
    if (instagramPostUrl.trim() && !isValidInstagramPostUrl(instagramPostUrl.trim())) {
      Alert.alert("올바른 Instagram 게시물 URL을 입력해주세요")
      return
    }
    if (youtubePostUrl.trim() && !isValidYouTubeUrl(youtubePostUrl.trim())) {
      Alert.alert("올바른 YouTube URL을 입력해주세요")
      return
    }

    setSubmitting(true)
    try {
      const r = await updatePropertyPost(
        (u, init) => gwangjangFetch(u, init as any),
        id,
        {
          title: title.trim(),
          property_type: propertyType,
          transaction_type: transactionType,
          price: priceNum,
          monthly_rent: monthlyRentNum,
          maintenance_fee: maintenanceFee ? Number(maintenanceFee) : null,
          area_sqm: Number(area),
          floor_info: floor || null,
          total_floors: totalFloors ? Number(totalFloors) : null,
          rooms: Number(rooms) || 1,
          bathrooms: Number(bathrooms) || 1,
          direction: direction || null,
          parking,
          elevator,
          pet_allowed: petAllowed,
          move_in_date: /^\d{4}-\d{2}-\d{2}$/.test(moveInDate) ? moveInDate : null,
          address: address.trim(),
          address_detail: addressDetail.trim() || null,
          lat,
          lng,
          description: description.trim(),
          features,
          images,
          instagram_post_url: normalizeInstagramUrl(instagramPostUrl) ?? null,
          youtube_post_url: normalizeYouTubeUrl(youtubePostUrl) ?? null,
          // panorama_images 는 RN 미지원
        },
      )
      if (!r.ok) {
        Alert.alert("수정 실패", r.error ?? "")
        return
      }
      await setPostRegion("properties", id, regionId)
      Alert.alert("수정 완료", "매물이 수정되었습니다")
      setFormDirty(false)
      router.replace(`/property/${id}` as any)
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
        <Text style={styles.headerTitle}>매물 수정</Text>
        <Pressable onPress={handleSubmit} disabled={submitting || uploading} style={[styles.saveBtn, submitting && { opacity: 0.5 }]}>
          {submitting ? <ActivityIndicator size="small" color="#ffffff" /> : uploading ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><ActivityIndicator size="small" color="#ffffff" /><Text style={styles.saveBtnText}>업로드 중</Text></View> : <Text style={styles.saveBtnText}>저장</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {/* 사진 */}
          <Section title="사진" subtitle={`최대 ${MAX_IMAGES}장`}>
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
          </Section>

          {/* 거래 정보 */}
          <Section title="거래 정보">
            <Field label="거래 유형 *">
              <View style={styles.chipWrap}>
                {PROPERTY_TRANSACTION_TYPES.map((t) => (
                  <Pressable key={t} onPress={() => setTransactionType(t)} style={[styles.chip, transactionType === t ? { backgroundColor: BLUE } : { backgroundColor: lightColors.muted }]}>
                    <Text style={[styles.chipText, { color: transactionType === t ? "#ffffff" : lightColors.ink900 }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <Field label="매물 종류 *">
              <View style={styles.chipWrap}>
                {PROPERTY_TYPES.map((t) => (
                  <Pressable key={t} onPress={() => setPropertyType(t)} style={[styles.chip, propertyType === t ? { backgroundColor: BLUE } : { backgroundColor: lightColors.muted }]}>
                    <Text style={[styles.chipText, { color: propertyType === t ? "#ffffff" : lightColors.ink900 }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            {transactionType === "월세" ? (
              <View style={{ flexDirection: "row", gap: spacing[3] }}>
                <View style={{ flex: 1 }}>
                  <Field label="보증금 (만원) *">
                    <TextInput value={deposit} onChangeText={(v) => setDeposit(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="월세 (만원) *">
                    <TextInput value={monthlyRent} onChangeText={(v) => setMonthlyRent(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
                  </Field>
                </View>
              </View>
            ) : (
              <Field label={`${transactionType || "매매가"} (만원) *`}>
                <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
              </Field>
            )}

            <Field label="관리비 (만원, 선택)">
              <TextInput value={maintenanceFee} onChangeText={(v) => setMaintenanceFee(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
            </Field>
          </Section>

          {/* 면적·구조 */}
          <Section title="면적 · 구조">
            <View style={{ flexDirection: "row", gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Field label="면적 (㎡) *">
                  <TextInput value={area} onChangeText={(v) => setArea(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="방">
                  <TextInput value={rooms} onChangeText={(v) => setRooms(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="욕실">
                  <TextInput value={bathrooms} onChangeText={(v) => setBathrooms(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
                </Field>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Field label="층">
                  <TextInput value={floor} onChangeText={setFloor} style={styles.input} placeholderTextColor={lightColors.ink500} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="총 층수">
                  <TextInput value={totalFloors} onChangeText={(v) => setTotalFloors(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.input} placeholderTextColor={lightColors.ink500} />
                </Field>
              </View>
            </View>

            <Field label="향">
              <View style={styles.chipWrap}>
                {PROPERTY_DIRECTIONS.map((d) => (
                  <Pressable key={d} onPress={() => setDirection((cur) => (cur === d ? "" : d))} style={[styles.chip, direction === d ? { backgroundColor: BLUE } : { backgroundColor: lightColors.muted }]}>
                    <Text style={[styles.chipText, { color: direction === d ? "#ffffff" : lightColors.ink900 }]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
          </Section>

          {/* 옵션 */}
          <Section title="옵션">
            <View style={styles.toggleGrid}>
              <View style={styles.toggleRow}><Text style={styles.toggleLabel}>주차 가능</Text><Switch value={parking} onValueChange={setParking} /></View>
              <View style={styles.toggleRow}><Text style={styles.toggleLabel}>엘리베이터</Text><Switch value={elevator} onValueChange={setElevator} /></View>
              <View style={styles.toggleRow}><Text style={styles.toggleLabel}>반려동물 가능</Text><Switch value={petAllowed} onValueChange={setPetAllowed} /></View>
            </View>

            <Field label="옵션 / 특징">
              <View style={styles.chipWrap}>
                {PROPERTY_FEATURES.map((f) => (
                  <Pressable key={f} onPress={() => toggleFeature(f)} style={[styles.chip, features.includes(f) ? { backgroundColor: BLUE } : { backgroundColor: lightColors.muted }]}>
                    <Text style={[styles.chipText, { color: features.includes(f) ? "#ffffff" : lightColors.ink900 }]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
          </Section>

          {/* 위치 · 입주일 */}
          <Section title="위치 · 입주">
            <Field label="입주 가능일">
              <DatePickerField value={moveInDate} onChange={setMoveInDate} mode="date" placeholder="날짜 선택" clearable />
            </Field>

            <Field label="매물 위치 *">
              <AddressSearch
                value={address}
                onChange={(addr) => {
                  setAddress(addr)
                  setLat(null)
                  setLng(null)
                }}
                placeholder="주소를 검색해주세요"
              />
            </Field>

            <Field label="상세 주소 (선택)">
              <TextInput value={addressDetail} onChangeText={setAddressDetail} style={styles.input} placeholderTextColor={lightColors.ink500} />
            </Field>

            <AddressMapPreview
              address={address}
              onCoordsResolved={(c) => {
                setLat(c?.lat ?? null)
                setLng(c?.lng ?? null)
              }}
            />

            <RegionFormField
              plazaId={DEFAULT_PLAZA}
              userId={user?.id}
              address={address}
              value={regionId}
              onChange={setRegionId}
              skipAutoDefault
            />
          </Section>

          {/* 소개 */}
          <Section title="소개">
            <Field label="제목 *">
              <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={lightColors.ink500} />
            </Field>

            <Field label="상세 설명 *">
              <TextInput value={description} onChangeText={setDescription} multiline style={[styles.input, styles.textarea]} placeholderTextColor={lightColors.ink500} />
            </Field>
          </Section>

          {/* 외부 링크 */}
          <Section title="외부 링크" subtitle="선택 사항">
            <Field label="인스타그램 게시물 URL">
              <TextInput
                value={instagramPostUrl}
                onChangeText={setInstagramPostUrl}
                placeholder="https://www.instagram.com/p/Abc123/"
                placeholderTextColor={lightColors.ink500}
                autoCapitalize="none"
                keyboardType="url"
                style={styles.input}
              />
            </Field>

            <Field label="유튜브 영상 URL">
              <TextInput
                value={youtubePostUrl}
                onChangeText={setYoutubePostUrl}
                placeholder="https://www.youtube.com/watch?v=..."
                placeholderTextColor={lightColors.ink500}
                autoCapitalize="none"
                keyboardType="url"
                style={styles.input}
              />
            </Field>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View><Text style={styles.label}>{label}</Text>{children}</View>
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      <View style={styles.sectionCard}>{children}</View>
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
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: BLUE, minWidth: 60, alignItems: "center" },
  saveBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

  body: {
    padding: spacing[3],
    gap: spacing[4],
    paddingBottom: spacing[8],
    backgroundColor: "#f8fafc",
  },
  section: { gap: 10 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: lightColors.ink900,
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 12,
    color: lightColors.ink500,
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: spacing[4],
    gap: spacing[4],
    borderWidth: 1,
    borderColor: lightColors.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
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
  textarea: { minHeight: 140, textAlignVertical: "top" },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  toggleGrid: { gap: spacing[2] },
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 6, paddingHorizontal: spacing[3],
    borderRadius: radius.md, backgroundColor: lightColors.muted,
  },
  toggleLabel: { fontSize: fontSize.sm, color: lightColors.ink900 },
})
