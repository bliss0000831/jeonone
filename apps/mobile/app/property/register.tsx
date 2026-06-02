/**
 * 매물 등록 — 광장 web /register 미러 (핵심 필드 RN 버전).
 *
 * 정독 매핑 (RN 한정 — 지도 위젯·panorama·instagram/youtube embed 는 웹에서 편집):
 *   - 헤더 (← 매물 등록)
 *   - 사진 (최대 10장)
 *   - 거래 유형 (매매/전세/월세) *
 *   - 매물 종류 (PROPERTY_TYPES 칩) *
 *   - 가격 입력 (거래 유형에 따라 단/복수 필드)
 *   - 면적 (㎡) * / 방 / 욕실
 *   - 층 / 총 층수 / 향
 *   - 옵션 토글: 주차 / 엘리베이터 / 반려동물
 *   - 입주 가능일 (YYYY-MM-DD)
 *   - 주소 * + 상세 주소
 *   - 제목 * / 상세 설명 *
 *   - 옵션/특징 멀티 선택 (PROPERTY_FEATURES)
 *   - 등록 버튼 (createPropertyPost — POST /api/properties)
 *
 * 서버에서 plaza_id 자동, 월 한도 체크, agent/일반 권한 처리.
 */

import { useEffect, useMemo, useState } from "react"
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
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createPropertyPost,
  PROPERTY_TYPES,
  PROPERTY_TRANSACTION_TYPES,
  PROPERTY_DIRECTIONS,
  PROPERTY_FEATURES,
} from "@gwangjang/features/property"
import { gwangjangFetch, uploadImage } from "@/lib/supabase"
import { AddressSearch } from "@/components/AddressSearch"
import { AddressMapPreview } from "@/components/AddressMapPreview"
import { DatePickerField } from "@/components/DatePickerField"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"
import { isValidInstagramPostUrl, normalizeInstagramUrl } from "@/lib/integrations/instagram"
import { isValidYouTubeUrl, normalizeYouTubeUrl } from "@/lib/integrations/youtube"

const MAX_IMAGES = 10
const BLUE = "#2563eb"

export default function PropertyRegisterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)

  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  // 지역 — 주소 자동 파싱 + 사용자 override 가능
  const [regionId, setRegionId] = useState<string | null>(null)

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
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [instagramPostUrl, setInstagramPostUrl] = useState("")
  const [youtubePostUrl, setYoutubePostUrl] = useState("")

  useEffect(() => {
    if (title.trim() || description.trim() || images.length > 0) setFormDirty(true)
  }, [title, description, images])

  const featuresSet = useMemo(() => new Set(features), [features])

  function toggleFeature(f: string) {
    setFeatures((cur) =>
      cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f],
    )
  }

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
        // 이미지 + 동영상 지원 (다른 도메인과 일관성, MediaItem/MediaThumbnail 이 video 처리)
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - images.length,
        quality: 0.8,
      })
      // assets null-safe 체크 (canceled 플래그 대신 실제 데이터 확인)
      if (!r.assets || r.assets.length === 0) return

      const assets = r.assets.slice(0, MAX_IMAGES - images.length)
      const localUris = assets.map((a) => a.uri)

      // 1) 즉시 로컬 URI 로 미리보기 표시
      setImages((p) => [...p, ...localUris].slice(0, MAX_IMAGES))

      // 2) 백그라운드 업로드 → 로컬 URI 를 서버 URL 로 교체
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
              // 업로드 실패해도 로컬 URI 유지 (미리보기 보존)
              failCount++
            }
          }
          return next
        })
        if (failCount > 0) {
          Alert.alert("업로드 실패", `${failCount}개 파일 업로드에 실패했습니다. 재업로드가 필요합니다.`)
        }
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

    // 모든 유효성 검사 — 한 번에 수집하여 표시
    const errors: string[] = []
    if (!propertyType || !transactionType) errors.push("거래 유형과 매물 종류를 선택해주세요")
    if (!title.trim()) errors.push("제목을 입력해주세요")
    if (!description.trim()) errors.push("상세 설명을 입력해주세요")
    if (!address.trim()) errors.push("주소를 입력해주세요")
    if (!area) errors.push("면적을 입력해주세요")

    // 가격 — 광장 web 와 동일한 매핑
    let priceNum = 0
    let monthlyRentNum: number | null = null
    if (transactionType === "월세") {
      priceNum = Number(deposit) || 0
      monthlyRentNum = Number(monthlyRent) || 0
    } else {
      priceNum = Number(price) || 0
    }
    if (propertyType && transactionType && priceNum <= 0) {
      errors.push(transactionType === "월세" ? "보증금을 입력해주세요" : "가격을 입력해주세요")
    }
    // 월세는 월세 금액(*)도 필수
    if (transactionType === "월세" && (monthlyRentNum ?? 0) <= 0) {
      errors.push("월세 금액을 입력해주세요")
    }

    const areaNum = Number(area)
    if (area && (Number.isNaN(areaNum) || areaNum <= 0)) {
      errors.push("면적(㎡)을 정확히 입력해주세요")
    }

    // Instagram / YouTube URL 유효성 검증
    if (instagramPostUrl.trim() && !isValidInstagramPostUrl(instagramPostUrl.trim())) {
      errors.push("올바른 Instagram 게시물 URL을 입력해주세요")
    }
    if (youtubePostUrl.trim() && !isValidYouTubeUrl(youtubePostUrl.trim())) {
      errors.push("올바른 YouTube URL을 입력해주세요")
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
      const r = await createPropertyPost(
        (u, init) => gwangjangFetch(u, init as any),
        {
          title: title.trim(),
          property_type: propertyType,
          transaction_type: transactionType,
          price: priceNum,
          monthly_rent: monthlyRentNum,
          maintenance_fee: maintenanceFee ? Number(maintenanceFee) : null,
          area_sqm: areaNum,
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
          // panorama_images 는 RN 미지원 (웹 PropertyPanoramaUploader 사용)
        },
      )
      if (!r.ok) {
        if (r.monthlyLimitExceeded) {
          Alert.alert("월 한도 초과", r.error ?? "")
        } else {
          Alert.alert("등록 실패", r.error ?? "")
        }
        return
      }
      // 지역 정보 저장 (insert 후 UPDATE — payload 안 건드림)
      if (r.postId) {
        await setPostRegion("properties", r.postId, regionId)
      }
      Alert.alert("등록 완료", "매물이 등록되었습니다")
      setFormDirty(false)
      if (r.postId) router.replace(`/property/${r.postId}` as any)
      else router.back()
    } catch (e: any) {
      console.warn("[property/register] submit failed", e)
      Alert.alert(
        "네트워크 오류",
        "등록에 실패했습니다. 입력 내용은 유지되니 다시 시도해주세요.",
        [
          { text: "취소", style: "cancel" },
          { text: "다시 시도", onPress: () => { handleSubmit() } },
        ],
      )
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
        <View style={styles.headerTitleWrap}>
          <Ionicons name="home" size={18} color={BLUE} />
          <Text style={styles.headerTitle}>매물 등록</Text>
        </View>
        <View style={{ width: 36 }} />
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
          </Section>

          {/* 거래 정보 */}
          <Section title="거래 정보">
          <Field label="거래 유형 *">
            <View style={styles.chipWrap}>
              {PROPERTY_TRANSACTION_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTransactionType(t)}
                  style={[
                    styles.chip,
                    transactionType === t
                      ? { backgroundColor: BLUE }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text style={[styles.chipText, { color: transactionType === t ? "#ffffff" : lightColors.ink900 }]}>
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="매물 종류 *">
            <View style={styles.chipWrap}>
              {PROPERTY_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setPropertyType(t)}
                  style={[
                    styles.chip,
                    propertyType === t
                      ? { backgroundColor: BLUE }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text style={[styles.chipText, { color: propertyType === t ? "#ffffff" : lightColors.ink900 }]}>
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          {/* Price */}
          {transactionType === "월세" ? (
            <View style={{ gap: spacing[3] }}>
              <Field label="보증금 (만원) *">
                <TextInput
                  value={deposit}
                  onChangeText={(v) => setDeposit(v.replace(/[^0-9]/g, ""))}
                  placeholder="1000"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
              <Field label="월세 (만원) *">
                <TextInput
                  value={monthlyRent}
                  onChangeText={(v) => setMonthlyRent(v.replace(/[^0-9]/g, ""))}
                  placeholder="50"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
          ) : (
            <Field label={`${transactionType || "매매가"} (만원) *`}>
              <TextInput
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))}
                placeholder="50000"
                placeholderTextColor={lightColors.ink500}
                keyboardType="number-pad"
                style={styles.input}
              />
            </Field>
          )}

          <Field label="관리비 (만원, 선택)">
            <TextInput
              value={maintenanceFee}
              onChangeText={(v) => setMaintenanceFee(v.replace(/[^0-9]/g, ""))}
              placeholder="10"
              placeholderTextColor={lightColors.ink500}
              keyboardType="number-pad"
              style={styles.input}
            />
          </Field>
          </Section>

          {/* 면적 · 구조 */}
          <Section title="면적 · 구조">
          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="면적 (㎡) *">
                <TextInput
                  value={area}
                  onChangeText={(v) => setArea(v.replace(/[^0-9.]/g, ""))}
                  placeholder="84"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="방 개수">
                <TextInput
                  value={rooms}
                  onChangeText={(v) => setRooms(v.replace(/[^0-9]/g, ""))}
                  placeholder="1"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="욕실">
                <TextInput
                  value={bathrooms}
                  onChangeText={(v) => setBathrooms(v.replace(/[^0-9]/g, ""))}
                  placeholder="1"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Field label="층">
                <TextInput
                  value={floor}
                  onChangeText={setFloor}
                  placeholder="예: 5"
                  placeholderTextColor={lightColors.ink500}
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="총 층수">
                <TextInput
                  value={totalFloors}
                  onChangeText={(v) => setTotalFloors(v.replace(/[^0-9]/g, ""))}
                  placeholder="15"
                  placeholderTextColor={lightColors.ink500}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
          </View>

          <Field label="향">
            <View style={styles.chipWrap}>
              {PROPERTY_DIRECTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDirection((cur) => (cur === d ? "" : d))}
                  style={[
                    styles.chip,
                    direction === d
                      ? { backgroundColor: BLUE }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text style={[styles.chipText, { color: direction === d ? "#ffffff" : lightColors.ink900 }]}>
                    {d}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>
          </Section>

          {/* 옵션 */}
          <Section title="옵션">
          <View style={styles.toggleGrid}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>주차 가능</Text>
              <Switch value={parking} onValueChange={setParking} />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>엘리베이터</Text>
              <Switch value={elevator} onValueChange={setElevator} />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>반려동물 가능</Text>
              <Switch value={petAllowed} onValueChange={setPetAllowed} />
            </View>
          </View>

          <Field label="옵션 / 특징">
            <View style={styles.chipWrap}>
              {PROPERTY_FEATURES.map((f) => {
                const selected = featuresSet.has(f)
                return (
                  <Pressable
                    key={f}
                    onPress={() => toggleFeature(f)}
                    style={[
                      styles.chip,
                      selected
                        ? { backgroundColor: BLUE }
                        : { backgroundColor: lightColors.muted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? "#ffffff" : lightColors.ink900 },
                      ]}
                    >
                      {f}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </Field>
          </Section>

          {/* 위치 · 입주 */}
          <Section title="위치 · 입주">
          <Field label="입주 가능일">
            <DatePickerField
              value={moveInDate}
              onChange={setMoveInDate}
              mode="date"
              placeholder="날짜 선택 (비워두면 즉시 입주)"
              clearable
            />
          </Field>

          <Field label="매물 위치 *">
            <AddressSearch
              value={address}
              onChange={(addr) => {
                // 주소가 바뀌면 기존 좌표는 무효화 (재검증)
                setAddress(addr)
                setLat(null)
                setLng(null)
              }}
              placeholder="주소를 검색해주세요"
            />
          </Field>

          <Field label="상세 주소 (동/호수, 선택)">
            <TextInput
              value={addressDetail}
              onChangeText={setAddressDetail}
              placeholder="예: 101동 1502호"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
            />
          </Field>

          <AddressMapPreview
            address={address}
            onCoordsResolved={(c) => {
              setLat(c?.lat ?? null)
              setLng(c?.lng ?? null)
            }}
          />

          {/* 지역 (시/군) — 주소 자동 추출 + 사용자 변경 가능 */}
          <RegionFormField
            plazaId={plazaId}
            userId={user?.id}
            address={address}
            value={regionId}
            onChange={setRegionId}
          />
          </Section>

          {/* 소개 */}
          <Section title="소개">
          <Field label="제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="예: 후평동 25평 아파트 깨끗한 매물"
              placeholderTextColor={lightColors.ink500}
              style={styles.input}
              maxLength={80}
            />
          </Field>

          <Field label="상세 설명 *">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="매물 특징, 주변 환경, 학군 등을 자세히 적어주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={3000}
              style={[styles.input, styles.textarea]}
            />
          </Field>

          </Section>

          {/* 외부 링크 */}
          <Section title="외부 링크" subtitle="선택 사항">
          <Field label="인스타그램 게시물 URL">
            <TextInput
              value={instagramPostUrl}
              onChangeText={setInstagramPostUrl}
              placeholder="https://www.instagram.com/p/Abc123/ 또는 /reel/..."
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
              placeholder="https://www.youtube.com/watch?v=... 또는 /shorts/..."
              placeholderTextColor={lightColors.ink500}
              autoCapitalize="none"
              keyboardType="url"
              style={styles.input}
            />
          </Field>
          </Section>

          <RegisterConsentBlock serviceKind="property" onChange={setConsented} />

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
              <Text style={styles.submitBtnText}>매물 등록하기</Text>
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
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border,
  },
  headerBtn: { padding: 6 },
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },

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
  sectionSub: { fontSize: 12, color: lightColors.ink500 },
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

  submitBtn: { paddingVertical: 14, borderRadius: radius.md, backgroundColor: BLUE, alignItems: "center" },
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
