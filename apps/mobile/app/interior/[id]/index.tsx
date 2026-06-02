/**
 * 인테리어 상세 — 광장 web /interior/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 인테리어 + 좋아요 / 공유 / 호스트 메뉴)
 *   - 이미지 캐러셀 + 카테고리 배지 (좌상단)
 *   - 제목 + 가격 (min~max + 단위, 가격 문의)
 *   - 메타 (지역 / 조회 / 좋아요)
 *   - 서비스 소개 (content)
 *   - 업체 정보 카드 (카테고리 뱃지)
 *   - 액션 바 (전화하기 + 채팅하기)
 *
 * 채팅 라우팅은 RN 미구현 — fallback 외부 웹뷰.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useShareModal } from "@/components/mypage/ShareModal"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { impactLight } from "@gwangjang/platform/haptics"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  deleteInteriorPost,
  getInteriorPost,
  toggleInteriorLike,
  type InteriorAuthor,
  type InteriorPost,
} from "@gwangjang/features/interior"
import { useAuth } from "@/lib/auth-context"
import { startPostChat } from "@gwangjang/features/chat"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useTrackRecent } from "@/lib/recent-views"
import { useTrackView } from "@/lib/view-tracker"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AuthorCard } from "@/components/AuthorCard"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"
import { AddressMapPreview } from "@/components/AddressMapPreview"


const CATEGORY_ICON: Record<string, any> = {
  전체리모델링: "home-outline",
  부분시공: "construct-outline",
  주방: "restaurant-outline",
  욕실: "water-outline",
  도배장판: "grid-outline",
  바닥재: "layers-outline",
  타일: "apps-outline",
  붙박이장: "albums-outline",
  조명전기: "bulb-outline",
  페인팅: "color-palette-outline",
  샷시창호: "expand-outline",
  발코니확장: "resize-outline",
  기타: "ellipsis-horizontal",
  시공: "brush-outline",
  수리: "construct-outline",
  청소: "sparkles-outline",
  이사: "car-outline",
}

const CATEGORY_BG: Record<string, string> = {
  전체리모델링: "#9333ea",
  부분시공: "#a855f7",
  주방: "#f43f5e",
  욕실: "#0ea5e9",
  도배장판: "#f59e0b",
  바닥재: "#f97316",
  타일: "#14b8a6",
  붙박이장: "#78716c",
  조명전기: "#eab308",
  페인팅: "#ec4899",
  샷시창호: "#06b6d4",
  발코니확장: "#10b981",
  기타: "#6b7280",
  시공: "#a855f7",
}

export default function InteriorDetailScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const { width } = useWindowDimensions()

  useTrackView("interior_posts", id)

  const [post, setPost] = useState<InteriorPost | null>(null)
  useTrackRecent({
    id: id as string,
    kind: "interior",
    kindLabel: "인테리어",
    title: post?.title,
    image: (post as any)?.images?.[0] ?? null,
    href: `/interior/${id}`,
  })
  const [author, setAuthor] = useState<InteriorAuthor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!id) return
    const supabase = getSupabase()
    setLoadError(false)
    try {
      const r = await getInteriorPost(supabase, id, DEFAULT_PLAZA, user?.id ?? null)
      setPost(r.post)
      setAuthor(r.author)
      setLiked(r.is_liked)
    } catch (e) {
      console.warn("[interior] load failed", e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [id, user?.id])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // useFocusEffect 는 mount 시에도 fire — useEffect 와 중복 호출 방지.
  // 첫 focus 는 스킵, 이후 (탭 전환 후 돌아오기 등) 만 갱신.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      fetchAll()
    }, [fetchAll]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchAll()
    } finally {
      setRefreshing(false)
    }
  }, [fetchAll])

  async function handleLike() {
    if (!user || !post) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    if (likeBusy) return // 더블탭 방지 — 좋아요 수/상태 불일치 방지
    setLikeBusy(true)
    void impactLight()
    try {
      const r = await toggleInteriorLike(getSupabase(), {
        postId: post.id,
        userId: user.id,
        isLiked: liked,
        currentLikes: post.likes,
      })
      setLiked(r.liked)
      setPost({ ...post, likes: r.likes })
    } catch (e) {
      console.warn("[interior] like failed", e)
      Alert.alert("오류", "좋아요 처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  async function handleShare() {
    if (!post) return
    share.open({ title: post.title,
        message: `${post.title}\n${buildShareUrl("interior", post.id)}` })
  }

  function confirmDelete() {
    Alert.alert("삭제", "정말로 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: handleDelete },
    ])
  }

  async function handleDelete() {
    if (!post) return
    setBusy(true)
    try {
      await deleteInteriorPost(getSupabase(), post.id)
      router.back()
    } catch (e: any) {
      Alert.alert("삭제 실패", e?.message ?? "처리에 실패했습니다")
    } finally {
      setBusy(false)
    }
  }

  function openHostMenu() {
    if (!post) return
    Alert.alert("관리", undefined, [
      { text: "수정하기", onPress: () => router.push(`/interior/${post.id}/edit` as any) },
      { text: "삭제하기", style: "destructive", onPress: confirmDelete },
      { text: "취소", style: "cancel" },
    ])
  }

  async function openChat() {
    if (!post) return
    if (busy) return // 더블탭 방지 — 중복 채팅방 생성 차단
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    if (user.id === post.user_id) {
      Alert.alert("알림", "본인 게시물에는 채팅할 수 없습니다")
      return
    }
    setBusy(true)
    try {
      const r = await startPostChat(
        (u, init) => gwangjangFetch(u, init as any),
        { postId: post.id, postType: "interior" },
      )
      if (!r.ok || !r.roomId) {
        Alert.alert("채팅 실패", r.error ?? "")
        return
      }
      router.push(`/chat/${r.roomId}` as any)
    } finally {
      setBusy(false)
    }
  }

  function callPhone() {
    if (!post?.contact_phone) return
    Linking.openURL(`tel:${post.contact_phone}`).catch(() => {})
  }

  function formatPrice(p: InteriorPost): string {
    if (!p.min_price && !p.max_price) return "가격 문의"
    const unit = p.price_unit || "만원"
    if (p.min_price && p.max_price) {
      return `${p.min_price.toLocaleString()}~${p.max_price.toLocaleString()}${unit}`
    }
    if (p.min_price) return `${p.min_price.toLocaleString()}${unit}~`
    return `~${p.max_price?.toLocaleString()}${unit}`
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={lightColors.primary} />
      </SafeAreaView>
    )
  }
  if (!post) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Ionicons name={loadError ? "alert-circle-outline" : "brush-outline"} size={48} color={lightColors.ink500} />
        <Text style={{ color: lightColors.ink500, marginTop: 12 }}>
          {loadError ? "불러오지 못했습니다" : "게시글을 찾을 수 없습니다"}
        </Text>
        {loadError ? (
          <Pressable
            onPress={() => { setLoadError(false); setLoading(true); fetchAll() }}
            style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: lightColors.primary }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>다시 시도</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: lightColors.primary }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>돌아가기</Text>
          </Pressable>
        )}
      </SafeAreaView>
    )
  }

  const isOwner = !!user && user.id === post.user_id
  const category = post.category || "시공"
  const catIcon = CATEGORY_ICON[category] ?? "brush-outline"
  const catBg = CATEGORY_BG[category] ?? "#a855f7"
  const images = post.images ?? []
  const region = `${post.service_region ?? ""} ${post.service_district ?? ""}`.trim()

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>인테리어</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={handleLike} hitSlop={8} style={styles.headerBtn}>
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={22}
              color={liked ? "#ef4444" : lightColors.ink900}
            />
          </Pressable>
          <Pressable onPress={handleShare} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="share-social-outline" size={22} color={lightColors.ink900} />
          </Pressable>
          <PostActionsMenu
            kind="interior"
            postId={post.id}
            authorId={post.user_id}
            editHref={`/interior/${post.id}/edit`}
            onDeleted={() => router.back()}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Gallery */}
        <View>
          {images.length > 0 ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(it, idx) => `${idx}-${it}`}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / width)
                setImageIndex(i)
              }}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width, aspectRatio: 4 / 3 }} />
              )}
            />
          ) : (
            <View
              style={[
                styles.galleryFallback,
                { width, aspectRatio: 4 / 3, backgroundColor: catBg },
              ]}
            >
              <Ionicons name={catIcon} size={64} color="#ffffff" />
              <Text style={styles.galleryFallbackLabel}>{category}</Text>
            </View>
          )}

          <View style={styles.galleryBadges}>
            <View style={[styles.badge, { backgroundColor: catBg }]}>
              <Ionicons name={catIcon} size={12} color="#ffffff" />
              <Text style={styles.badgeText}>{category}</Text>
            </View>
          </View>

          {images.length > 1 && (
            <View style={styles.indicator}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === imageIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Body */}
        <View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[4] }}>
          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.price}>{formatPrice(post)}</Text>

          {/* [공간] 뱃지 — content 에서 추출 */}
          {(() => {
            const m = (post.content || "").match(/\n*\[공간\]\s*([^\n]+)/)
            if (!m) return null
            return (
              <View style={styles.spaceBadge}>
                <Ionicons name="home-outline" size={12} color="#a855f7" />
                <Text style={styles.spaceBadgeText}>{m[1].trim()}</Text>
              </View>
            )
          })()}

          {/* Meta */}
          <View style={styles.metaRow}>
            {!!region && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={lightColors.ink500} />
                <Text style={styles.metaText}>{region}</Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Ionicons name="eye-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{post.views ?? 0}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="heart-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{post.likes ?? 0}</Text>
            </View>
          </View>

          {/* Service intro — [공간] 태그 제거 후 표시 */}
          {(() => {
            const raw = post.content || ""
            const m = raw.match(/\n*\[공간\]\s*([^\n]+)/)
            const cleaned = (m ? raw.replace(m[0], "") : raw).trim()
            if (!cleaned) return null
            return (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>서비스 소개</Text>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>{cleaned}</Text>
                </View>
              </View>
            )
          })()}

          {/* 사업장 위치 — 이사/청소/수리 와 동일하게 표시 (region 있을 때만) */}
          {!!region && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>사업장 위치</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color={lightColors.ink500} />
                <Text style={styles.locationText}>{region}</Text>
              </View>
              <View style={{ marginTop: spacing[2] }}>
                <AddressMapPreview
                  address={region}
                  height={220}
                  manualNaverToggle
                  hideOkBadge
                  initialLat={(post as any).lat ?? null}
                  initialLng={(post as any).lng ?? null}
                  persistTo={{ table: "interior_posts", id: post.id }}
                />
              </View>
            </View>
          )}

        </View>

        {/* 판매자 정보 — 가장 아래 */}
        {author && (
          <AuthorCard
            profile={{
              id: author.id,
              nickname: author.nickname,
              avatar_url: author.avatar_url,
              account_type: (author as any).account_type ?? null,
              created_at: (author as any).created_at ?? null,
            }}
            title="업체 정보"
            accentColor="#a855f7"
            extraBadge={{ label: "인테리어", color: "#a855f7" }}
          />
        )}
        <DetailLegalNotice variant="service" />
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        {!!post.contact_phone && (
          <Pressable style={styles.actionOutline} onPress={callPhone}>
            <Ionicons name="call-outline" size={18} color={lightColors.ink900} />
            <Text style={styles.actionOutlineText}>전화</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.actionPrimary, { flex: 1 }]}
          onPress={openChat}
          disabled={busy}
        >
          <Ionicons name="chatbubble-ellipses" size={18} color="#ffffff" />
          <Text style={styles.actionPrimaryText}>채팅하기</Text>
        </Pressable>
      </View>
      {share.element}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
    backgroundColor: lightColors.background,
    position: "relative",
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
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
    color: lightColors.ink900,
  },
  headerRight: { flexDirection: "row" },

  galleryFallback: { alignItems: "center", justifyContent: "center" },
  galleryFallbackLabel: {
    marginTop: 8,
    color: "#ffffff",
    fontWeight: "700",
  },
  galleryBadges: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#ffffff" },
  indicator: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: "#ffffff", width: 16 },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },
  price: {
    fontSize: 22,
    fontWeight: "700",
    color: lightColors.primary,
  },

  spaceBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.1)",
    marginTop: spacing[2],
  },
  spaceBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#a855f7",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
    paddingTop: spacing[3],
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: fontSize.xs, color: lightColors.ink500 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { fontSize: fontSize.sm, color: lightColors.ink900 },

  section: { paddingTop: spacing[4] },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },
  infoBox: {
    backgroundColor: lightColors.muted,
    padding: spacing[3],
    borderRadius: radius.md,
  },
  infoText: { fontSize: fontSize.sm, color: lightColors.ink900, lineHeight: 22 },

  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing[2],
    padding: spacing[3],
    paddingBottom: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  actionPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: lightColors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  actionPrimaryText: { color: "#ffffff", fontWeight: "700", fontSize: fontSize.md },
  actionOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  actionOutlineText: { fontWeight: "600", fontSize: fontSize.md, color: lightColors.ink900 },
})
