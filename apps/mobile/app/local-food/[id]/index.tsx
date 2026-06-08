/**
 * 로컬푸드 상세 — 광장 web /local-food/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 로컬푸드 + 좋아요 / 공유 / 호스트 메뉴)
 *   - 이미지 캐러셀 + 카테고리 배지 (좌상단) + 품절 배지
 *   - 제목 + 가격 (할인 % / 원가 strike / 현재가 / 단위)
 *   - 메타 (지역 / 조회 / 좋아요 / 시간)
 *   - 상품 요약 (description)
 *   - 상세 설명 (content)
 *   - 생산자 카드 (생산자 뱃지)
 *   - 액션 바 (품절 / 판매 관리 / 문의 + 바로 구매)
 *
 * 결제(checkout)는 RN 미구현 — fallback 외부 웹뷰.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  deleteLocalFoodPost,
  getLocalFoodPost,
  toggleLocalFoodLike,
  type LocalFoodAuthor,
  type LocalFoodPost,
} from "@gwangjang/features/local-food"
import { startPostChat } from "@gwangjang/features/chat"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useTrackRecent } from "@/lib/recent-views"
import { useTrackView } from "@/lib/view-tracker"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AuthorCard } from "@/components/AuthorCard"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"


function formatDate(iso: string): string {
  const d = new Date(iso)
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "오늘"
  if (diff === 1) return "어제"
  if (diff < 7) return `${diff}일 전`
  return d.toLocaleDateString("ko-KR")
}

export default function LocalFoodDetailScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const { width } = useWindowDimensions()

  useTrackView("local_food_posts", id)

  const [post, setPost] = useState<LocalFoodPost | null>(null)
  useTrackRecent({
    id: id as string,
    kind: "local_food",
    kindLabel: "로컬푸드",
    title: post?.title,
    image: (post as any)?.images?.[0] ?? null,
    href: `/local-food/${id}`,
  })
  const [author, setAuthor] = useState<LocalFoodAuthor | null>(null)
  const [loading, setLoading] = useState(true)
  const [imageIndex, setImageIndex] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!id) return
    const supabase = getSupabase()
    try {
      const r = await getLocalFoodPost(supabase, id, DEFAULT_PLAZA, user?.id ?? null)
      setPost(r.post)
      setAuthor(r.author)
      setLiked(r.user_liked)
      setLikeCount(r.post?.like_count ?? 0)
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
    const next = !liked
    setLiked(next)
    setLikeCount((c) => Math.max(0, next ? c + 1 : c - 1))
    try {
      await toggleLocalFoodLike(getSupabase(), {
        postId: post.id,
        userId: user.id,
        isLiked: liked,
      })
    } catch {
      // 실패 시 롤백
      setLiked(!next)
      setLikeCount((c) => Math.max(0, !next ? c + 1 : c - 1))
    }
  }

  async function handleShare() {
    if (!post) return
    share.open({ title: post.title,
        message: `${post.title}\n${buildShareUrl("local-food", post.id)}` })
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
      await deleteLocalFoodPost(getSupabase(), post.id)
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
      { text: "수정하기", onPress: () => router.push(`/local-food/${post.id}/edit` as any) },
      { text: "삭제하기", style: "destructive", onPress: confirmDelete },
      { text: "취소", style: "cancel" },
    ])
  }

  function openCheckout() {
    if (!post) return
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    router.push(`/local-food/${post.id}/checkout` as any)
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
        { postId: post.id, postType: "local_food" },
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
        <Ionicons name="leaf-outline" size={48} color={lightColors.ink500} />
        <Text style={{ color: lightColors.ink500, marginTop: 12 }}>
          게시글을 찾을 수 없습니다
        </Text>
      </SafeAreaView>
    )
  }

  const isOwner = !!user && user.id === post.user_id
  const isSoldOut = post.status === "sold_out"
  const safePrice = Number(post.price) || 0
  const safeOriginal = Number(post.original_price) || 0
  const discount =
    safeOriginal > safePrice ? Math.round((1 - safePrice / safeOriginal) * 100) : 0
  const images = post.images ?? []

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>로컬푸드</Text>
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
            kind="local-food"
            postId={post.id}
            authorId={post.user_id}
            editHref={`/local-food/${post.id}/edit`}
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
                <MediaItem uri={item} style={{ width, aspectRatio: 1 }} />
              )}
            />
          ) : (
            <View style={[styles.galleryFallback, { width, aspectRatio: 1 }]}>
              <Ionicons name="leaf-outline" size={64} color="#16a34a" />
              <Text style={styles.galleryFallbackLabel}>{post.category}</Text>
            </View>
          )}

          {/* Top-left badges */}
          <View style={styles.galleryBadges}>
            <View style={[styles.badge, { backgroundColor: "#22c55e" }]}>
              <Ionicons name="leaf" size={12} color="#ffffff" />
              <Text style={styles.badgeText}>{post.category}</Text>
            </View>
            {isSoldOut && (
              <View style={[styles.badge, { backgroundColor: "#1f2937" }]}>
                <Text style={styles.badgeText}>품절</Text>
              </View>
            )}
          </View>

          {/* Page indicator */}
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
          {post.description && (
            <Text style={styles.productName}>{post.description}</Text>
          )}
          <View style={styles.priceRow}>
            {discount > 0 && (
              <Text style={styles.discount}>{discount}%</Text>
            )}
            {safeOriginal > safePrice && (
              <Text style={styles.priceOrig}>
                {safeOriginal.toLocaleString()}원
              </Text>
            )}
            <Text style={styles.priceMain}>
              {safePrice.toLocaleString()}원
            </Text>
            {post.unit && <Text style={styles.priceUnit}>/{post.unit}</Text>}
          </View>

          {/* Meta — 농가명 제거(별도 섹션으로), 조회/좋아요/시간만 */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="eye-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{post.view_count ?? 0}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="heart-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{likeCount}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{formatDate((post as any).effective_at ?? (post as any).bumped_at ?? post.created_at)}</Text>
            </View>
          </View>

          {/* 배송비 — 공구 detail 처럼 compact 한 줄 */}
          {(() => {
            const free = (post as any).free_shipping || !(post as any).shipping_fee
            const fee = (post as any).shipping_fee as number | undefined
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing[2] }}>
                <Ionicons name="cube-outline" size={14} color={lightColors.ink500} />
                <Text style={{ fontSize: 13, color: lightColors.ink500 }}>배송비</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: free ? "#10b981" : lightColors.ink900 }}>
                  {free ? "무료배송" : `${(fee ?? 0).toLocaleString()}원`}
                </Text>
              </View>
            )
          })()}

          {/* 원산지 · 농장 — 상세 설명 위 별도 섹션 */}
          {(!!(post as any).farm_name || !!post.location) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>원산지 · 판매처</Text>
              <View style={styles.originRow}>
                {!!post.location && (
                  <View style={styles.originCell}>
                    <Text style={styles.originLabel}>원산지</Text>
                    <Text style={styles.originValue}>{post.location}</Text>
                  </View>
                )}
                {!!(post as any).farm_name && (
                  <View style={styles.originCell}>
                    <Text style={styles.originLabel}>판매처</Text>
                    <View style={styles.originValueRow}>
                      <Ionicons name="leaf-outline" size={14} color="#16a34a" />
                      <Text style={styles.originValue}>{(post as any).farm_name}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Content — 상세 설명 (홈즈 톤: 회색 박스) */}
          {post.content && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>상세 설명</Text>
              <View style={styles.infoBox}>
                <Text style={styles.contentText}>{post.content}</Text>
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
            authorPlazaId={(post as any)?.plaza_id ?? null}
            title="생산자 정보"
          />
        )}
        <DetailLegalNotice variant="neutral" />
      </ScrollView>

      {/* Sticky action bar */}
      <View style={styles.actionBar}>
        {isSoldOut ? (
          <Pressable style={[styles.actionOutline, { flex: 1 }]} disabled>
            <Text style={[styles.actionOutlineText, { color: lightColors.ink500 }]}>
              품절
            </Text>
          </Pressable>
        ) : isOwner ? (
          <Pressable
            style={[styles.actionOutline, { flex: 1 }]}
            onPress={() => router.push("/(tabs)/mypage" as any)}
          >
            <Text style={styles.actionOutlineText}>판매 관리</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={styles.actionOutline}
              onPress={openChat}
              disabled={busy}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={lightColors.ink900} />
              <Text style={styles.actionOutlineText}>문의</Text>
            </Pressable>
            <Pressable
              style={[styles.actionPrimary, { flex: 1 }]}
              onPress={openCheckout}
            >
              <Ionicons name="bag-handle" size={18} color="#ffffff" />
              <Text style={styles.actionPrimaryText}>바로 구매</Text>
            </Pressable>
          </>
        )}
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
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryFallbackLabel: {
    marginTop: 8,
    color: "#16a34a",
    fontWeight: "600",
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
    fontWeight: "600",
    color: lightColors.ink900,
    marginBottom: 4,
  },
  productName: {
    fontSize: 13,
    color: lightColors.ink500,
    marginBottom: spacing[2],
    lineHeight: 18,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 6 },
  discount: { fontSize: 20, fontWeight: "700", color: "#ef4444" },
  priceOrig: {
    fontSize: 14,
    color: lightColors.ink500,
    textDecorationLine: "line-through",
  },
  priceMain: { fontSize: 26, fontWeight: "700", color: lightColors.primary },
  priceUnit: { fontSize: 13, color: lightColors.ink500 },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
    paddingTop: spacing[3],
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: fontSize.xs, color: lightColors.ink500 },

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
  contentText: {
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    lineHeight: 22,
  },
  originRow: {
    flexDirection: "row",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  originCell: { flex: 1, gap: 4 },
  originLabel: { fontSize: 11, color: lightColors.ink500, fontWeight: "600" },
  originValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  originValue: { fontSize: fontSize.sm, color: lightColors.ink900, fontWeight: "500" },

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
