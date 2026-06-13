/**
 * 중고거래 등록 — 광장 web /secondhand/register 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 중고거래 등록)
 *   - 사진 (최대 10장 → /api/upload)
 *   - 제목 *
 *   - 카테고리 (SECONDHAND_CATEGORIES 16개 칩)
 *   - 가격 + "가격제안 환영" 체크
 *   - 가격 0원 + "나눔으로 올리기" 체크 → /api/sharing 으로 분기
 *   - 설명 *
 *   - 거래 희망 장소
 *   - 등록 버튼 (createSecondhandPost)
 */

import { useEffect, useRef, useState } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ToastAndroid,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Image as RNImage,
  View,
} from "react-native"
import { Alert } from "@/lib/alert"
import { Image as ExpoImage } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  createSecondhandPost,
  SECONDHAND_CATEGORIES,
  SECONDHAND_CONDITIONS,
} from "@gwangjang/features/secondhand"
import { createSharingPost } from "@gwangjang/features/sharing"
import { gwangjangFetch, uploadImage } from "@/lib/supabase"
import { useLocalSearchParams } from "expo-router"
import { AddressSearch } from "@/components/AddressSearch"
import { RegionFormField } from "@/components/RegionFormField"
import { setPostRegion } from "@/lib/set-post-region"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { RegisterConsentBlock } from "@/components/legal/RegisterConsentBlock"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"

const MAX_IMAGES = 10
const AMBER = "#f59e0b"
const DRAFT_KEY = "draft.secondhand.register"
// 농기구/자재 카테고리 (전원일기)
const FARM_CATEGORIES = ["트랙터", "경운기", "이양기", "수확기", "관리기", "방제기/드론", "운반기", "하우스자재", "부품/소모품", "농자재", "기타"]

export default function SecondhandRegisterScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [formDirty, setFormDirty] = useState(false)
  useUnsavedChangesGuard(formDirty)
  const [submitting, setSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [regionId, setRegionId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<string>(FARM_CATEGORIES[0])
  const [price, setPrice] = useState("")
  const [isPriceNegotiable, setIsPriceNegotiable] = useState(false)
  const [postAsSharing, setPostAsSharing] = useState(false)
  const [location, setLocation] = useState("")
  const [condition, setCondition] = useState<string>("")
  // 거래방식 — ?type=auction|rental
  const params = useLocalSearchParams<{ type?: string }>()
  const initialType = params.type === "auction" || params.type === "rental" ? params.type : "sale"
  const [listingType, setListingType] = useState<"sale" | "auction" | "rental">(initialType as any)
  const [auctionStartPrice, setAuctionStartPrice] = useState("")
  const [auctionDays, setAuctionDays] = useState("7")
  const [rentalDaily, setRentalDaily] = useState("")
  const [rentalDeposit, setRentalDeposit] = useState("")

  // ── 임시저장(draft) — 작성 중 이탈해도 내용 보존, 재진입 시 복원 ──
  const draftReadyRef = useRef(false)

  // 1) 진입 시: 저장된 임시글이 있으면 이어쓰기 제안
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY)
        const d = raw ? JSON.parse(raw) : null
        if (alive && d && (d.title || d.description || (Array.isArray(d.images) && d.images.length))) {
          Alert.alert("임시저장 불러오기", "작성하던 내용이 있어요. 이어서 작성할까요?", [
            {
              text: "새로 작성",
              style: "destructive",
              onPress: () => { AsyncStorage.removeItem(DRAFT_KEY).catch(() => {}); draftReadyRef.current = true },
            },
            {
              text: "이어서 작성",
              onPress: () => {
                if (typeof d.title === "string") setTitle(d.title)
                if (typeof d.description === "string") setDescription(d.description)
                if (typeof d.category === "string") setCategory(d.category)
                if (typeof d.price === "string") setPrice(d.price)
                setIsPriceNegotiable(!!d.isPriceNegotiable)
                setPostAsSharing(!!d.postAsSharing)
                if (typeof d.location === "string") setLocation(d.location)
                if (typeof d.condition === "string") setCondition(d.condition)
                if (Array.isArray(d.images)) setImages(d.images)
                if (d.listingType === "sale" || d.listingType === "auction" || d.listingType === "rental") setListingType(d.listingType)
                if (typeof d.auctionStartPrice === "string") setAuctionStartPrice(d.auctionStartPrice)
                if (typeof d.auctionDays === "string") setAuctionDays(d.auctionDays)
                if (typeof d.rentalDaily === "string") setRentalDaily(d.rentalDaily)
                if (typeof d.rentalDeposit === "string") setRentalDeposit(d.rentalDeposit)
                if (d.regionId === null || typeof d.regionId === "string") setRegionId(d.regionId)
                draftReadyRef.current = true
              },
            },
          ])
          return
        }
      } catch { /* 무시 */ }
      draftReadyRef.current = true
    })()
    return () => { alive = false }
  }, [])

  // 2) 작성 중: 디바운스 저장 (내용 없으면 삭제)
  useEffect(() => {
    if (!draftReadyRef.current) return
    const hasContent = !!(title.trim() || description.trim() || images.length)
    const t = setTimeout(() => {
      if (!hasContent) { AsyncStorage.removeItem(DRAFT_KEY).catch(() => {}); return }
      const d = { title, description, category, price, isPriceNegotiable, postAsSharing, location, condition, images, listingType, auctionStartPrice, auctionDays, rentalDaily, rentalDeposit, regionId }
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(d)).catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [title, description, category, price, isPriceNegotiable, postAsSharing, location, condition, images, listingType, auctionStartPrice, auctionDays, rentalDaily, rentalDeposit, regionId])

  useEffect(() => {
    if (title.trim() || description.trim() || images.length > 0) setFormDirty(true)
  }, [title, description, images])

  const priceNum = listingType === "auction"
    ? (auctionStartPrice === "" ? 0 : Number(auctionStartPrice))
    : listingType === "rental"
    ? (rentalDaily === "" ? 0 : Number(rentalDaily))
    : (price === "" ? 0 : Number(price))

  // 대표이미지 지정 — idx 를 0번으로 이동 (web 1:1, 모바일 통일)
  function setAsThumbnail(idx: number) {
    if (idx === 0) return
    setImages((prev) => {
      const next = [...prev]
      const [picked] = next.splice(idx, 1)
      next.unshift(picked)
      return next
    })
    if (Platform.OS === "android") ToastAndroid.show("대표 사진으로 지정했어요", ToastAndroid.SHORT)
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

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (submitting) return
    const errors: string[] = []
    if (!title.trim()) errors.push("제목을 입력해주세요")
    if (!description.trim()) errors.push("설명을 입력해주세요")
    if (Number.isNaN(priceNum) || priceNum < 0) errors.push("올바른 가격을 입력해주세요 (0 이상의 숫자)")
    if (images.length === 0) errors.push("사진을 1장 이상 올려주세요 — 농기구는 사진이 있어야 거래가 됩니다")
    if (listingType === "auction" && priceNum <= 0) errors.push("경매 시작가를 입력해주세요")
    if (listingType === "rental" && priceNum <= 0) errors.push("일 대여료를 입력해주세요")
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

    const shouldRouteToSharing = priceNum === 0 && postAsSharing
    setSubmitting(true)
    try {
      const fetcher = (u: string, init?: RequestInit) =>
        gwangjangFetch(u, init as any)

      if (shouldRouteToSharing) {
        // 0원 + 나눔으로 올리기 → /api/sharing
        const r = await createSharingPost(fetcher, {
          title: title.trim(),
          description: description.trim(),
          category,
          images,
          location: location.trim() || null,
        })
        if (!r.ok) {
          Alert.alert("등록 실패", r.error ?? "")
          return
        }
        if (r.postId) await setPostRegion("sharing_posts", r.postId, regionId)
        await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {})
        Alert.alert("등록 완료", "나눔 글이 성공적으로 등록되었습니다 💝")
        setFormDirty(false)
        if (r.postId) router.replace(`/sharing/${r.postId}` as any)
        else router.replace("/(tabs)/mypage" as any)
        return
      }

      const r = await createSecondhandPost(fetcher, {
        title: title.trim(),
        description: description.trim(),
        category,
        price: priceNum,
        isPriceNegotiable,
        images,
        location: location.trim() || null,
        condition: condition || null,
        // 경매/대여 — 서버가 post 와 같은 요청에 매물을 원자적으로 생성 (고아 post 방지)
        listingType,
        ...(listingType === "auction"
          ? {
              auctionStartPrice: priceNum,
              auctionDays: Math.max(1, Number(auctionDays) || 7),
              auctionBidIncrement: Math.max(1000, Math.round((priceNum * 0.05) / 1000) * 1000),
            }
          : {}),
        ...(listingType === "rental"
          ? { rentalDailyPrice: priceNum, rentalDeposit: Number(rentalDeposit) || 0 }
          : {}),
      })
      if (r.rateLimited) {
        Alert.alert("등록 제한", r.error ?? "")
        return
      }
      if (!r.ok) {
        Alert.alert("등록 실패", r.error ?? "")
        return
      }
      if (r.postId) await setPostRegion("secondhand_posts", r.postId, regionId)
      setFormDirty(false)
      await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {})

      // 경매/대여 매물은 서버가 생성하여 listingId 를 돌려준다. 별도 insert 없음.
      if (listingType === "auction") {
        Alert.alert("등록 완료", "경매가 등록되었습니다 🔨")
        router.replace((r.listingId ? `/auction/${r.listingId}` : "/auction") as any)
        return
      }
      if (listingType === "rental") {
        Alert.alert("등록 완료", "대여 상품이 등록되었습니다 🚜")
        router.replace((r.listingId ? `/rental/${r.listingId}` : "/rental") as any)
        return
      }

      if (r.flagged) {
        Alert.alert("등록 완료", "등록되었으나 관리자 검토 중입니다.")
      } else {
        Alert.alert("등록 완료", "농기구/자재 글이 성공적으로 등록되었습니다")
      }
      if (r.postId && !r.flagged) router.replace(`/secondhand/${r.postId}` as any)
      else router.replace("/(tabs)/mypage" as any)
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
          <Ionicons name="bag-handle" size={18} color={AMBER} />
          <Text style={styles.headerTitle}>{listingType === "auction" ? "경매 등록" : listingType === "rental" ? "대여 등록" : "농기구/자재 등록"}</Text>
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
            <Text style={styles.label}>사진 (최대 {MAX_IMAGES}장) <Text style={{ color: "#e11d48" }}>· 1장 이상 필수</Text></Text>
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

          {/* Title */}
          <Field label="제목 *">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="판매할 물품의 제목을 입력하세요"
              placeholderTextColor={lightColors.ink500}
              maxLength={100}
              style={styles.input}
            />
            <Text style={{ fontSize: 13, color: lightColors.ink500, textAlign: "right", marginTop: 2 }}>
              {title.length}/100
            </Text>
          </Field>

          {/* 거래방식 */}
          <Field label="거래방식">
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([["sale", "판매"], ["rental", "대여"], ["auction", "경매"]] as const).map(([v, lbl]) => (
                <Pressable key={v} onPress={() => setListingType(v)}
                  style={[styles.chip, { paddingHorizontal: 18 }, listingType === v ? { backgroundColor: "#225a39" } : { backgroundColor: lightColors.muted }]}>
                  <Text style={[styles.chipText, { color: listingType === v ? "#fff" : lightColors.ink900 }]}>{lbl}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 13, color: lightColors.ink500, marginTop: 6, lineHeight: 18 }}>
              {listingType === "sale"
                ? "한 가격에 바로 판매합니다."
                : listingType === "rental"
                ? "일정 기간 빌려주고 대여료를 받아요. 보증금은 반납 후 돌려줍니다."
                : "여러 사람이 값을 올려 부르고, 가장 높은 분께 팝니다."}
            </Text>
          </Field>

          {listingType === "auction" && (
            <>
              <Field label="경매 시작가 (원)">
                <TextInput value={auctionStartPrice} onChangeText={(v) => setAuctionStartPrice(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad" placeholder="예: 1000000" placeholderTextColor={lightColors.ink500} style={styles.input} />
                {auctionStartPrice ? (
                  <Text style={{ fontSize: 13, color: lightColors.ink500, marginTop: 6, lineHeight: 18 }}>
                    입찰 단위(한 번에 오르는 값): {Math.max(1000, Math.round((parseInt(auctionStartPrice || "0", 10) * 0.05) / 1000) * 1000).toLocaleString()}원 · 자동 설정
                  </Text>
                ) : null}
              </Field>
              <Field label="경매 기간 (일)">
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {["1", "3", "5", "7", "10", "14"].map((d) => (
                    <Pressable key={d} onPress={() => setAuctionDays(d)}
                      style={[styles.chip, auctionDays === d ? { backgroundColor: "#225a39" } : { backgroundColor: lightColors.muted }]}>
                      <Text style={[styles.chipText, { color: auctionDays === d ? "#fff" : lightColors.ink900 }]}>{d}일</Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
            </>
          )}

          {listingType === "rental" && (
            <>
              <Field label="일 대여료 (원)">
                <TextInput value={rentalDaily} onChangeText={(v) => setRentalDaily(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad" placeholder="예: 50000" placeholderTextColor={lightColors.ink500} style={styles.input} />
              </Field>
              <Field label="보증금 (원, 선택)">
                <TextInput value={rentalDeposit} onChangeText={(v) => setRentalDeposit(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad" placeholder="예: 200000" placeholderTextColor={lightColors.ink500} style={styles.input} />
                <Text style={{ fontSize: 13, color: lightColors.ink500, marginTop: 6, lineHeight: 18 }}>
                  빌려줄 때 잠시 맡아두고, 반납·정상 확인 후 돌려주는 금액이에요.
                </Text>
              </Field>
            </>
          )}

          {/* Category — 줄바꿈(wrap)으로 모든 항목이 한눈에 보이게 (어르신 가독성) */}
          <Field label="카테고리">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {FARM_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.chip,
                    category === c
                      ? { backgroundColor: AMBER }
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

          {/* Condition — 상품 상태 */}
          <Field label="상품 상태 (선택)">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {SECONDHAND_CONDITIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCondition((prev) => (prev === c ? "" : c))}
                  style={[
                    styles.chip,
                    condition === c
                      ? { backgroundColor: AMBER }
                      : { backgroundColor: lightColors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: condition === c ? "#ffffff" : lightColors.ink900 },
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          {/* Price (판매 모드만) */}
          {listingType === "sale" && (
          <Field label="가격 (원)">
            <TextInput
              value={price}
              onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))}
              placeholder="0 (무료나눔)"
              placeholderTextColor={lightColors.ink500}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Pressable
              onPress={() => setIsPriceNegotiable((v) => !v)}
              style={styles.checkRow}
            >
              <View
                style={[
                  styles.checkbox,
                  isPriceNegotiable && { backgroundColor: AMBER, borderColor: AMBER },
                ]}
              >
                {isPriceNegotiable && (
                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                )}
              </View>
              <Text style={styles.checkLabel}>가격 제안 받기</Text>
            </Pressable>

            {priceNum === 0 && (
              <Pressable
                onPress={() => setPostAsSharing((v) => !v)}
                style={[styles.checkRow, { marginTop: 4 }]}
              >
                <View
                  style={[
                    styles.checkbox,
                    postAsSharing && { backgroundColor: "#ef4444", borderColor: "#ef4444" },
                  ]}
                >
                  {postAsSharing && (
                    <Ionicons name="checkmark" size={12} color="#ffffff" />
                  )}
                </View>
                <Text style={styles.checkLabel}>0원 → 나눔 게시판으로 올리기</Text>
              </Pressable>
            )}
          </Field>
          )}

          {/* Description */}
          <Field label="설명 *">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="상품 상태, 거래 희망 사항 등을 적어주세요"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={3000}
              style={[styles.input, styles.textarea]}
            />
            <Text style={{ fontSize: 13, color: lightColors.ink500, textAlign: "right", marginTop: 2 }}>
              {description.length}/3000
            </Text>
          </Field>

          {/* Location — 주소 검색 (Daum Postcode) */}
          <Field label="거래 희망장소">
            <AddressSearch
              value={location}
              onChange={(addr) => setLocation(addr)}
              placeholder="주소를 검색해주세요"
            />
          </Field>

          {/* 지역 — 거래 희망장소 자동 추출 + 사용자 변경 가능 */}
          <RegionFormField
            plazaId={plazaId}
            userId={user?.id}
            address={location}
            value={regionId}
            onChange={setRegionId}
          />

          <RegisterConsentBlock serviceKind="secondhand" onChange={setConsented} />

          {/* Submit */}
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
              <Text style={styles.submitBtnText}>
                {listingType === "auction" ? "경매 등록하기" : listingType === "rental" ? "대여 등록하기" : priceNum === 0 && postAsSharing ? "나눔 등록하기" : "등록하기"}
              </Text>
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
    position: "absolute",
    top: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
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
  textarea: { minHeight: 140, textAlignVertical: "top", lineHeight: 22 },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipText: { fontSize: fontSize.sm, fontWeight: "500" },

  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing[2],
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: { fontSize: fontSize.sm, color: lightColors.ink900 },

  submitBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: AMBER,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
})
