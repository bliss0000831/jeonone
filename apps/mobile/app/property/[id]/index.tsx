/**
 * 매물 상세 — 광장 web /property/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - Header: ← + Title + 공유 + 신고 + 더보기 (소유자만)
 *   - 이미지 갤러리 (가로 스와이프 + 페이지 인디케이터)
 *   - 가격 (큰 텍스트, 거래유형 강조)
 *   - 거래유형 / 매물유형 / 중개사 뱃지
 *   - 제목 + 위치 + 조회/관심/시간
 *   - 인스타 / 유튜브 외부 링크 버튼 (있을 때)
 *   - 작성자 카드 (아바타 + 이름 + 역할)
 *   - 키-값 (면적 / 층 / 방 / 화장실 / 방향 / 주차 / 엘베 / 반려)
 *   - 설명 (longform)
 *   - 하단 sticky 액션바: 찜 / 전화 / 채팅
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native"
import { Image } from "expo-image"
import { MediaItem } from "@/components/MediaItem"
import { ImageLightbox } from "@/components/ImageLightbox"
import { useShareModal } from "@/components/mypage/ShareModal"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { impactLight } from "@gwangjang/platform/haptics"
import { Ionicons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import {
  deleteProperty,
  getProperty,
  toggleFavorite,
} from "@gwangjang/features/property"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { PostReportModal } from "@/components/PostReportModal"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useTrackRecent } from "@/lib/recent-views"
import { useTrackView } from "@/lib/view-tracker"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AddressMapPreview } from "@/components/AddressMapPreview"
import { EmbedModal } from "@/components/EmbedModal"
import { AuthorCard } from "@/components/AuthorCard"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"
import { PropertyPanoramaViewer } from "@/components/PropertyPanoramaViewer"


interface PropertyData {
  id: string
  user_id: string
  title: string
  property_type: string
  transaction_type: string
  price: number | null
  monthly_rent: number | null
  deposit: number | null
  maintenance_fee: number | null
  area_sqm: number | null
  floor_info: string | null
  total_floors: number | null
  rooms: number | null
  bathrooms: number | null
  address: string | null
  description: string | null
  images: string[] | null
  panorama_images: Array<{ url: string; title?: string | null }> | null
  features: string[] | null
  direction: string | null
  parking: boolean | null
  elevator: boolean | null
  pet_allowed: boolean | null
  views: number | null
  status: string
  instagram_post_url: string | null
  youtube_post_url: string | null
  lat: number | null
  lng: number | null
  address_detail: string | null
  created_at: string
}

interface ProfileData {
  id: string
  nickname: string | null
  phone: string | null
  avatar_url: string | null
  location: string | null
  account_type: string | null
}

function formatManwon(value: number): string {
  if (!value && value !== 0) return ""
  if (value >= 10000) {
    const uk = Math.floor(value / 10000)
    const man = value % 10000
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억`
  }
  return `${value.toLocaleString()}만원`
}

// web dbToProperty 정독: 월세는 price 가 보증금으로 사용됨
function formatPrice(p: PropertyData): string {
  if (p.transaction_type === "월세") {
    const deposit = p.deposit ?? p.price ?? 0  // db.price 가 보증금
    const rent = p.monthly_rent ?? 0
    return `${formatManwon(deposit)}/${formatManwon(rent)}`
  }
  return formatManwon(p.price ?? 0)
}

function formatArea(sqm: number | null): string {
  if (!sqm) return "-"
  const py = (sqm / 3.305785).toFixed(1).replace(/\.0$/, "")
  return `${sqm}㎡ (${py}평)`
}

// web formatPostedAgo (오늘/어제/N일 전/N주 전/N개월 전) 1:1
import { relativeDate } from "@/lib/relative-date"

export default function PropertyDetailScreen() {
  const styles = useThemedStyles(makeStyles)
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const { width } = useWindowDimensions()

  useTrackView("properties", id)

  const [property, setProperty] = useState<PropertyData | null>(null)
  // 최근 본 글에 기록 (제목/이미지 로드 후 1회)
  useTrackRecent({
    id: id as string,
    kind: "property",
    kindLabel: "매물",
    title: property?.title,
    image: property?.images?.[0] ?? null,
    href: `/property/${id}`,
  })
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [isFavorite, setIsFavorite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [imageIndex, setImageIndex] = useState(0)
  const [favLoading, setFavLoading] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  // 인스타/유튜브 임베드 모달 (웹과 동일한 인라인 팝업 UX)
  const [embed, setEmbed] = useState<
    { kind: "instagram" | "youtube"; url: string } | null
  >(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) return
    setLoadError(false)
    try {
      const supabase = getSupabase()
      const data = await getProperty(supabase, id, DEFAULT_PLAZA, user?.id)
      setProperty(data.property as PropertyData | null)
      setProfile(data.profile as ProfileData | null)
      setFavoriteCount(data.favoriteCount)
      setIsFavorite(data.isFavorite)
    } catch (e) {
      console.warn("[property] load failed", e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [id, user?.id, DEFAULT_PLAZA])

  useEffect(() => {
    loadDetail()
    // 조회수 증가는 getProperty RPC 가 처리
  }, [loadDetail, id])

  // useFocusEffect 는 mount 시에도 fire — useEffect(loadDetail) 와 중복 호출 방지.
  // 첫 focus 는 스킵, 이후 (탭 전환 후 돌아오기 등) 만 갱신.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      loadDetail()
    }, [loadDetail]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadDetail()
    } finally {
      setRefreshing(false)
    }
  }, [loadDetail])

  async function handleFavorite() {
    if (!user) {
      Alert.alert("로그인 필요", "로그인 후 이용해주세요")
      return
    }
    if (favLoading || !property) return
    setFavLoading(true)
    void impactLight()
    try {
      const next = await toggleFavorite(getSupabase(), {
        userId: user.id,
        propertyId: property.id,
        plazaId: DEFAULT_PLAZA,
        isFavorite,
      })
      setIsFavorite(next)
      setFavoriteCount((p) => (next ? p + 1 : Math.max(0, p - 1)))
    } catch (e) {
      console.warn("[property] favorite failed", e)
      Alert.alert("오류", "찜 처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setFavLoading(false)
    }
  }

  function handleCall() {
    if (!profile?.phone) {
      Alert.alert("연락처 없음", "판매자가 연락처를 공개하지 않았습니다")
      return
    }
    Linking.openURL(`tel:${profile.phone}`).catch(() => {
      Alert.alert("전화 연결 실패", "이 기기에서 전화를 걸 수 없습니다.")
    })
  }

  async function handleShare() {
    if (!property) return
    share.open({ title: property.title,
        message: `${property.title}\n${buildShareUrl("property", property.id)}` })
  }

  async function handleChat() {
    if (!user || !property) {
      Alert.alert("로그인 필요", "로그인 후 이용해주세요")
      return
    }
    if (user.id === property.user_id) {
      Alert.alert("알림", "본인 매물에는 채팅할 수 없습니다")
      return
    }
    if (chatBusy) return // 더블탭 방지 — 채팅방 중복 생성 방지
    setChatBusy(true)
    try {
      const supabase = getSupabase()
      // 기존 방 찾기
      const { data: existing } = await supabase
        .from("chat_rooms")
        .select("id")
        .eq("property_id", property.id)
        .eq("buyer_id", user.id)
        .eq("seller_id", property.user_id)
        .maybeSingle()
      if (existing) {
        router.push(`/chat/${existing.id}`)
        return
      }
      // 새 방 — web /api/chat/rooms POST 사용 (자기-매물 차단 + seller 검증 + plaza 격리)
      const res = await gwangjangFetch("/api/chat/rooms", {
        method: "POST",
        body: JSON.stringify({
          propertyId: property.id,
          sellerId: property.user_id,
          postType: "property",
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || "채팅방 생성 실패")
      }
      const j = await res.json().catch(() => ({}))
      const roomId = j?.roomId ?? j?.room?.id ?? j?.id
      if (!roomId) throw new Error("채팅방 정보 없음")
      router.push(`/chat/${roomId}`)
    } catch (e: any) {
      Alert.alert("실패", e?.message || "채팅방 생성 실패")
    } finally {
      setChatBusy(false)
    }
  }

  function handleDelete() {
    Alert.alert(
      "매물 삭제",
      "정말로 이 매물을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            if (!property) return
            try {
              await deleteProperty(getSupabase(), property.id)
              router.back()
            } catch (e: any) {
              Alert.alert("실패", e?.message || "삭제 실패")
            }
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: lightColors.background }} edges={["top"]}>
        <View style={{ height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing[3] }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }} accessibilityLabel="뒤로가기" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (!property) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: lightColors.background }} edges={["top"]}>
        <View style={{ height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: lightColors.border }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
          </Pressable>
          <Text style={{ marginLeft: spacing[2], fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 }}>매물</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[4], gap: spacing[3] }}>
          <Ionicons name={loadError ? "alert-circle-outline" : "home-outline"} size={48} color={lightColors.ink300} />
          <Text style={{ fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink700 }}>{loadError ? "데이터를 불러오지 못했습니다" : "매물을 찾을 수 없습니다"}</Text>
          {loadError && (
            <Pressable onPress={loadDetail} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: lightColors.primary }}>
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>다시 시도</Text>
            </Pressable>
          )}
          <Text style={{ fontSize: fontSize.sm, color: lightColors.ink500, textAlign: "center" }}>
            삭제됐거나 다른 광장 매물일 수 있어요
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderRadius: 8, backgroundColor: lightColors.primary }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>뒤로가기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const isOwner = user?.id === property.user_id
  const images = property.images ?? []
  const isAgent = profile?.account_type === "agent"

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>매물 상세</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          {/* 찜 — web 헤더 우측 액션 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="좋아요"
            hitSlop={8}
            style={styles.headerBtn}
            onPress={handleFavorite}
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={20}
              color={isFavorite ? "#ef4444" : lightColors.ink900}
            />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="공유" hitSlop={8} style={styles.headerBtn} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={20} color={lightColors.ink900} />
          </Pressable>
          {/* 액션 — 비작성자: 사이렌 신고 / 작성자·관리자: ⋮ 메뉴 */}
          {property && (
            <PostActionsMenu
              kind="properties"
              postId={property.id}
              authorId={property.user_id}
              editHref={`/property/${property.id}/edit`}
              bumpable
              onDeleted={() => router.back()}
              onAction={() => {
                // 올리기 후 bumped_at 즉시 반영 — 상세페이지 날짜 갱신
                setProperty((prev) => prev ? { ...prev, bumped_at: new Date().toISOString(), effective_at: new Date().toISOString() } : prev)
              }}
            />
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 이미지 갤러리 */}
        {images.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / width)
                setImageIndex(idx)
              }}
            >
              {images.map((img, i) => (
                <Pressable key={i} onPress={() => { setImageIndex(i); setLightboxOpen(true) }}>
                  <MediaItem
                    uri={img}
                    style={{ width, aspectRatio: 4 / 3 }}
                  />
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.indicator}>
              <Text style={styles.indicatorText}>
                {imageIndex + 1} / {images.length}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.placeholder, { width, aspectRatio: 4 / 3 }]}>
            <Ionicons name="image-outline" size={48} color={lightColors.ink300} />
          </View>
        )}

        {/* 본문 */}
        <View style={styles.body}>
          {/* 뱃지 */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, styles.badgeSecondary]}>
              <Text style={[styles.badgeText, { color: lightColors.ink700 }]}>
                {property.transaction_type}
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeSecondary]}>
              <Text style={[styles.badgeText, { color: lightColors.ink700 }]}>
                {property.property_type}
              </Text>
            </View>
            {/* 일반 / 공인중개사 분기 (web 매물 카드 매핑) */}
            {isAgent ? (
              <View style={[styles.badge, { backgroundColor: "#2563eb" }]}>
                <Ionicons name="business" size={11} color="#ffffff" />
                <Text style={[styles.badgeText, { color: "#ffffff" }]}>공인중개사</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: "#059669" }]}>
                <Ionicons name="person" size={11} color="#ffffff" />
                <Text style={[styles.badgeText, { color: "#ffffff" }]}>일반</Text>
              </View>
            )}
            {property.status !== "active" && (
              <View style={[styles.badge, styles.badgeMuted]}>
                <Text style={[styles.badgeText, { color: "#ffffff" }]}>
                  {property.status === "reserved" ? "예약중" : "거래완료"}
                </Text>
              </View>
            )}
          </View>

          {/* 가격 */}
          <Text style={styles.price}>{formatPrice(property)}</Text>

          {/* 제목 */}
          <Text style={styles.titleText}>{property.title}</Text>

          {/* 위치 */}
          {property.address && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.location} numberOfLines={2}>
                {property.address}
              </Text>
            </View>
          )}

          {/* 메타 */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              <Ionicons name="eye-outline" size={11} color={lightColors.ink500} /> 조회{" "}
              {(property.views ?? 0).toLocaleString()}
            </Text>
            <Text style={styles.metaText}>
              <Ionicons name="heart-outline" size={11} color={lightColors.ink500} /> 관심{" "}
              {favoriteCount}
            </Text>
            <Text style={styles.metaText}>
              <Ionicons name="time-outline" size={11} color={lightColors.ink500} />{" "}
              {relativeDate((property as any).effective_at ?? (property as any).bumped_at ?? property.created_at)}
            </Text>
          </View>

          {/* 외부 링크 — 별도 화면 이동 없이 EmbedModal 로 인라인 재생 (웹과 동일 UX) */}
          {(property.instagram_post_url || property.youtube_post_url) && (
            <View style={styles.linkRow}>
              {property.instagram_post_url && (
                <Pressable
                  onPress={() =>
                    setEmbed({
                      kind: "instagram",
                      url: property.instagram_post_url!,
                    })
                  }
                  style={({ pressed }) => [
                    styles.linkBtn,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <LinearGradient
                    colors={["#E1306C", "#F77737"]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.linkBtnFill}
                  >
                    <Ionicons name="logo-instagram" size={18} color="#ffffff" />
                    <Text style={styles.linkBtnText}>인스타 보기</Text>
                  </LinearGradient>
                </Pressable>
              )}
              {property.youtube_post_url && (
                <Pressable
                  onPress={() =>
                    setEmbed({ kind: "youtube", url: property.youtube_post_url! })
                  }
                  style={({ pressed }) => [
                    styles.linkBtn,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={[styles.linkBtnFill, { backgroundColor: "#E53935" }]}>
                    <Ionicons name="logo-youtube" size={18} color="#ffffff" />
                    <Text style={styles.linkBtnText}>유튜브 보기</Text>
                  </View>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* 작성자 카드 — 페이지 맨 아래로 이동 (위치 섹션 뒤) */}

        {/* 키-값 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>매물 정보</Text>
          <View style={styles.kvCard}>
            <KV k="면적" v={formatArea(property.area_sqm)} />
            <KV
              k="층"
              v={
                property.floor_info
                  ? `${property.floor_info}${property.total_floors ? ` / ${property.total_floors}층` : ""}`
                  : "-"
              }
            />
            <KV k="방 / 화장실" v={`${property.rooms ?? 0}개 / ${property.bathrooms ?? 0}개`} />
            {property.direction && <KV k="방향" v={property.direction} />}
            <KV k="주차" v={property.parking ? "가능" : "불가"} />
            <KV k="엘리베이터" v={property.elevator ? "있음" : "없음"} />
            <KV k="반려동물" v={property.pet_allowed ? "가능" : "불가"} />
            {property.maintenance_fee != null && (
              <KV k="관리비" v={`${property.maintenance_fee.toLocaleString()}만원`} />
            )}
          </View>
        </View>

        {/* 설명 — 위치 위로 (사용자 피드백) */}
        {property.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>상세 설명</Text>
            <Text style={styles.description}>{property.description}</Text>
          </View>
        )}

        {/* 태그 — 위치 위로 */}
        {property.features && property.features.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>특징</Text>
            <View style={styles.tagRow}>
              {property.features.map((f) => (
                <View key={f} style={styles.tag}>
                  <Text style={styles.tagText}>#{f}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 360° 가상 투어 — 파노라마 이미지가 있으면 */}
        {property.panorama_images && property.panorama_images.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>360° 가상 투어</Text>
            <PropertyPanoramaViewer
              images={property.panorama_images}
              height={360}
            />
          </View>
        )}

        {/* 위치 — 페이지 하단으로 이동. 인터랙티브 지도 + 위성 토글. */}
        {property.address && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>매물 위치</Text>
            <View style={[styles.locationRow, { marginBottom: spacing[3] }]}>
              <Ionicons name="location-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.location} numberOfLines={3}>
                {property.address}
                {property.address_detail ? ` ${property.address_detail}` : ""}
              </Text>
            </View>
            {/* 부동산 디테일도 정적 PNG + 워머 + 모달 패턴 통일.
                인라인 동적 NaverMap 제거 → 그리드 회귀 차단. "지도 보기" 탭 시 풀스크린에서만 동적. */}
            <AddressMapPreview
              address={property.address}
              height={260}
              manualNaverToggle
              hideOkBadge
              initialLat={property.lat ?? null}
              initialLng={property.lng ?? null}
              persistTo={{ table: "properties", id: property.id }}
            />
          </View>
        )}

        {/* 판매자 정보 — 가장 아래 */}
        {profile && (
          <AuthorCard
            profile={{
              id: profile.id,
              nickname: profile.nickname,
              avatar_url: profile.avatar_url,
              account_type: (profile as any).account_type ?? null,
              created_at: (profile as any).created_at ?? null,
            }}
            title="판매자 정보"
          />
        )}
        <DetailLegalNotice variant={isAgent ? "agent" : "directDeal"} />
      </ScrollView>

      {/* 하단 sticky 액션 */}
      {!isOwner && (
        <View style={styles.actionBar}>
          <Pressable
            onPress={handleFavorite}
            disabled={favLoading}
            style={({ pressed }) => [styles.favBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={22}
              color={isFavorite ? "#ef4444" : lightColors.ink900}
            />
            <Text style={styles.favCount}>{favoriteCount}</Text>
          </Pressable>
          <Pressable
            onPress={handleCall}
            style={({ pressed }) => [styles.callBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="call" size={18} color={lightColors.ink900} />
            <Text style={styles.callText}>전화하기</Text>
          </Pressable>
          <Pressable
            onPress={handleChat}
            style={({ pressed }) => [styles.chatBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="chatbubble" size={18} color="#ffffff" />
            <Text style={styles.chatText}>채팅하기</Text>
          </Pressable>
        </View>
      )}
      {/* 신고 모달 — web ReportButton 1:1 */}
      {property && (
        <PostReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="property"
          targetId={property.id}
        />
      )}
      {/* 인스타/유튜브 임베드 — 웹과 동일한 인라인 팝업 */}
      {embed && (
        <EmbedModal
          visible={!!embed}
          onClose={() => setEmbed(null)}
          kind={embed.kind}
          url={embed.url}
        />
      )}
      {share.element}
      <ImageLightbox
        visible={lightboxOpen}
        images={images}
        initialIndex={imageIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </SafeAreaView>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey} numberOfLines={1}>
        {k}
      </Text>
      <Text style={styles.kvValue} numberOfLines={1}>
        {v}
      </Text>
    </View>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: "relative",
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  // 화면 정중앙 정렬 wrap — 포인터 이벤트는 통과해서 아래 버튼이 클릭 가능
  headerTitleWrap: {
    position: "absolute",
    left: 56, right: 56,
    top: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
  },

  placeholder: {
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    position: "absolute",
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  indicatorText: { fontSize: 11, fontWeight: "600", color: "#ffffff" },

  body: { padding: spacing[4] },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeSecondary: { backgroundColor: colors.muted },
  badgePrimary: { backgroundColor: colors.primary },
  badgeMuted: { backgroundColor: "#64748b" },
  badgeText: { fontSize: 11, fontWeight: "600" },

  price: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.ink900,
    marginVertical: spacing[2],
    letterSpacing: -0.5,
  },
  titleText: {
    fontSize: fontSize.md,
    color: colors.ink900,
    lineHeight: 24,
    marginBottom: spacing[2],
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 8,
  },
  location: {
    flex: 1,
    fontSize: 13,
    color: colors.ink500,
    lineHeight: 18,
  },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  metaText: { fontSize: 11, color: colors.ink500 },

  linkRow: { flexDirection: "row", gap: 10, marginTop: spacing[3] },
  linkBtn: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  linkBtnFill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
  },
  linkBtnText: { fontSize: 15, fontWeight: "700", color: "#ffffff", letterSpacing: -0.2 },

  authorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderTopWidth: 8,
    borderTopColor: colors.muted,
    borderBottomWidth: 8,
    borderBottomColor: colors.muted,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  authorAvatarImg: { width: "100%", height: "100%" },
  authorLetter: { fontSize: 18, fontWeight: "700", color: colors.primary },
  authorName: { fontSize: fontSize.sm, fontWeight: "600", color: colors.ink900 },
  authorLocation: { fontSize: 11, color: colors.ink500, marginTop: 2 },

  section: { padding: spacing[4] },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
    marginBottom: spacing[3],
  },
  kvCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  kvRow: {
    width: "50%",          // 2열 그리드 — 길이 절반으로 축소
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  kvKey: {
    width: 72,
    fontSize: 12,
    color: colors.ink500,
    flexShrink: 0,
  },
  kvValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: colors.ink900,
  },

  description: { fontSize: 14, lineHeight: 22, color: colors.ink900 },

  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.1)",
  },
  tagText: { fontSize: 12, color: colors.primary },

  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  favBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[2],
  },
  favCount: { fontSize: 11, color: colors.ink500, marginTop: 2 },
  callBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  callText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.ink900 },
  chatBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  chatText: { fontSize: fontSize.sm, fontWeight: "700", color: "#ffffff" },
})
}

const styles = makeStyles(lightColors)
