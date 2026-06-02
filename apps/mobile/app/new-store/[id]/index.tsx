/**
 * 신장개업 상세 — 광장 web /new-store/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 신장개업 + 좋아요 / 공유 / 호스트 메뉴)
 *   - 이미지 캐러셀 + 카테고리 배지 (좌상단)
 *   - 가게명 (store_name)
 *   - 메타 (주소 / 조회 / 좋아요 / 오픈일)
 *   - 오픈 이벤트 강조 박스 (opening_event)
 *   - 가게 소개 (description)
 *   - 사장님 카드 (신장개업 뱃지)
 *   - 액션 바 (전화하기 + 채팅하기)
 *
 * 채팅은 post-chat RN 미이전 — 외부 웹뷰 fallback.
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
import { MediaItem } from "@/components/MediaItem"
import { useShareModal } from "@/components/mypage/ShareModal"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { impactLight } from "@gwangjang/platform/haptics"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  deleteNewStorePost,
  getNewStorePost,
  toggleNewStoreLike,
  type NewStoreAuthor,
  type NewStorePost,
} from "@gwangjang/features/new-store"
import { startPostChat } from "@gwangjang/features/chat"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useTrackRecent } from "@/lib/recent-views"
import { useTrackView } from "@/lib/view-tracker"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AuthorCard } from "@/components/AuthorCard"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"
import { AddressMapPreview } from "@/components/AddressMapPreview"


function formatOpeningDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default function NewStoreDetailScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const { width } = useWindowDimensions()

  useTrackView("new_store_posts", id)

  const [post, setPost] = useState<NewStorePost | null>(null)
  useTrackRecent({
    id: id as string,
    kind: "new_store",
    kindLabel: "신장개업",
    title: (post as any)?.store_name ?? null,
    image: (post as any)?.images?.[0] ?? null,
    href: `/new-store/${id}`,
  })
  const [author, setAuthor] = useState<NewStoreAuthor | null>(null)
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
      const r = await getNewStorePost(supabase, id, DEFAULT_PLAZA, user?.id ?? null)
      setPost(r.post)
      setAuthor(r.author)
      setLiked(r.is_liked)
    } catch (e) {
      console.warn("[new-store] load failed", e)
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
      const r = await toggleNewStoreLike(getSupabase(), {
        postId: post.id,
        userId: user.id,
        isLiked: liked,
        currentLikes: post.likes,
        plazaId: DEFAULT_PLAZA,
      })
      setLiked(r.liked)
      setPost({ ...post, likes: r.likes })
    } catch (e) {
      console.warn("[new-store] like failed", e)
      Alert.alert("오류", "좋아요 처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  async function handleShare() {
    if (!post) return
    share.open({ title: post.store_name,
        message: `${post.store_name}\n${buildShareUrl("new-store", post.id)}` })
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
      await deleteNewStorePost(getSupabase(), post.id)
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
      {
        text: "수정하기",
        onPress: () => router.push(`/new-store/${post.id}/edit` as any),
      },
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
        { postId: post.id, postType: "new_store" },
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
    if (!post?.phone) return
    Linking.openURL(`tel:${post.phone}`).catch(() => {})
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
        <Ionicons name="storefront-outline" size={48} color={lightColors.ink500} />
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
  const category = post.category || "신장개업"
  const images = post.images ?? []
  const openingDateText = formatOpeningDate(post.opening_date)

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>신장개업</Text>
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
            kind="new-store"
            postId={post.id}
            authorId={post.user_id}
            editHref={`/new-store/${post.id}/edit`}
            bumpable
            onDeleted={() => router.back()}
            onAction={() => {
              setPost((prev) => prev ? { ...prev, bumped_at: new Date().toISOString(), effective_at: new Date().toISOString() } as any : prev)
            }}
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
                <MediaItem uri={item} style={{ width, aspectRatio: 4 / 3 }} />
              )}
            />
          ) : (
            <View style={[styles.galleryFallback, { width, aspectRatio: 4 / 3 }]}>
              <Ionicons name="storefront-outline" size={64} color="#ffffff" />
              <Text style={styles.galleryFallbackLabel}>{category}</Text>
            </View>
          )}

          <View style={styles.galleryBadges}>
            <View style={[styles.badge, { backgroundColor: "#3b82f6" }]}>
              <Ionicons name="storefront" size={12} color="#ffffff" />
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
          <Text style={styles.title}>{post.store_name}</Text>

          {/* Meta — 주소 제거(아래 위치 섹션으로 이동) */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="eye-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{post.views ?? 0}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="heart-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{post.likes ?? 0}</Text>
            </View>
            {!!openingDateText && (
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={14} color={lightColors.ink500} />
                <Text style={styles.metaText}>오픈 {openingDateText}</Text>
              </View>
            )}
          </View>

          {/* Opening event */}
          {!!post.opening_event && (
            <View style={styles.eventBox}>
              <View style={styles.eventHead}>
                <Ionicons name="storefront" size={14} color={lightColors.primary} />
                <Text style={styles.eventTitle}>오픈 이벤트</Text>
              </View>
              <Text style={styles.eventBody}>{post.opening_event}</Text>
            </View>
          )}

          {/* Description */}
          {!!post.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>가게 소개</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{post.description}</Text>
              </View>
            </View>
          )}

          {/* 위치 — 매물 상세 톤 (주소 + 지도) */}
          {!!post.address && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>매장 위치</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color={lightColors.ink500} />
                <Text style={styles.locationText}>{post.address}</Text>
              </View>
              <View style={{ marginTop: spacing[2] }}>
                <AddressMapPreview
                  address={post.address}
                  height={220}
                  manualNaverToggle
                  hideOkBadge
                  initialLat={post.lat ?? null}
                  initialLng={post.lng ?? null}
                  persistTo={{ table: "new_store_posts", id: post.id }}
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
            title="사장님 정보"
            extraBadge={{ label: "신장개업", color: "#f97316" }}
          />
        )}
        <DetailLegalNotice variant="neutral" />
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        {!!post.phone && (
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

  galleryFallback: {
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryFallbackLabel: { marginTop: 8, color: "#ffffff", fontWeight: "700" },
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
    fontSize: 22,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
    paddingTop: spacing[2],
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: fontSize.xs, color: lightColors.ink500 },

  eventBox: {
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.3)",
    backgroundColor: "rgba(249,115,22,0.08)",
  },
  eventHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  eventTitle: { fontSize: fontSize.sm, fontWeight: "700", color: lightColors.primary },
  eventBody: { fontSize: fontSize.sm, color: lightColors.ink900, lineHeight: 22 },

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

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: fontSize.sm,
    color: lightColors.ink700,
    flexShrink: 1,
  },

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
