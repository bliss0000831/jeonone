/**
 * 서비스 상세 공용 컴포넌트 — moving / cleaning / repair 라우트가 thin wrapper 로 사용.
 * 광장 web /<kind>/[id] 1:1 미러.
 *
 *   - 헤더 (← + 좋아요 / 공유 / 호스트 메뉴)
 *   - 이미지 캐러셀 + 카테고리 배지 (좌상단)
 *   - 제목 + 가격 (formatServicePrice)
 *   - 메타 (지역 / 조회 / 좋아요)
 *   - 서비스 소개 (content)
 *   - 업체 정보 카드
 *   - 액션 바 (전화하기 + 채팅하기)
 */

import { useCallback, useEffect, useState } from "react"
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
import { ImageLightbox } from "@/components/ImageLightbox"
import { useShareModal } from "../mypage/ShareModal"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  SERVICE_META,
  deleteServicePost,
  formatServicePrice,
  getServicePost,
  toggleServiceLike,
  type ServiceAuthor,
  type ServiceKind,
  type ServicePost,
} from "@gwangjang/features/services"
import { startPostChat } from "@gwangjang/features/chat"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { PostActionsMenu, type PostKind } from "@/components/PostActionsMenu"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { useTrackRecent } from "@/lib/recent-views"
import { AuthorCard } from "@/components/AuthorCard"
import { AddressMapPreview } from "@/components/AddressMapPreview"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"

const TABLE_BY_KIND: Record<ServiceKind, string> = {
  interior: "interior_posts",
  moving: "moving_posts",
  cleaning: "cleaning_posts",
  repair: "repair_posts",
}


const KIND_ACCENT: Record<ServiceKind, { color: string; label: string }> = {
  interior: { color: "#8b5cf6", label: "인테리어" },
  moving: { color: "#eab308", label: "이사" },
  cleaning: { color: "#ec4899", label: "청소" },
  repair: { color: "#ea580c", label: "수리" },
}

const KIND_ICON: Record<ServiceKind, any> = {
  interior: "color-palette-outline",
  moving: "car-outline",
  cleaning: "sparkles-outline",
  repair: "construct-outline",
}

interface Props {
  kind: ServiceKind
  id: string
}

export function ServiceDetail({ kind, id }: Props) {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const share = useShareModal()
  const { user } = useAuth()
  const { width } = useWindowDimensions()

  const [post, setPost] = useState<ServicePost | null>(null)
  useTrackRecent({
    id: id as string,
    kind,
    kindLabel: KIND_ACCENT[kind].label,
    title: post?.title,
    image: (post as any)?.images?.[0] ?? null,
    href: `/${kind}/${id}`,
  })
  const [author, setAuthor] = useState<ServiceAuthor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)

  const meta = SERVICE_META[kind]
  const kindIcon = KIND_ICON[kind]

  const fetchAll = useCallback(async () => {
    if (!id) return
    const supabase = getSupabase()
    setLoadError(false)
    try {
      const r = await getServicePost(
        supabase,
        kind,
        id,
        DEFAULT_PLAZA,
        user?.id ?? null,
      )
      setPost(r.post)
      setAuthor(r.author)
      setLiked(r.is_liked)
    } catch (e) {
      console.warn("[service] load failed", e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [kind, id, user?.id])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useFocusEffect(
    useCallback(() => {
      fetchAll()
    }, [fetchAll]),
  )

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await fetchAll() } finally { setRefreshing(false) }
  }, [fetchAll])

  async function handleLike() {
    if (!user || !post) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    try {
      const r = await toggleServiceLike(getSupabase(), {
        kind,
        postId: post.id,
        userId: user.id,
        isLiked: liked,
        currentLikes: post.likes,
      })
      setLiked(r.liked)
      setPost({ ...post, likes: r.likes })
    } catch (e) {
      console.warn("[ServiceDetail] like failed", e)
      Alert.alert("오류", "좋아요 처리에 실패했습니다. 다시 시도해 주세요.")
    }
  }

  async function handleShare() {
    if (!post) return
    share.open({ url: buildShareUrl(kind, post.id), title: post.title,
        message: `${post.title}\n${buildShareUrl(kind, post.id)}` })
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
      await deleteServicePost(getSupabase(), kind, post.id)
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
        onPress: () => router.push(`/${kind}/${post.id}/edit` as any),
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
        { postId: post.id, postType: kind },
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

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: lightColors.background }} edges={["top"]}>
        <View style={{ height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing[3] }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }} accessibilityLabel="뒤로가기" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={lightColors.primary} />
        </View>
      </SafeAreaView>
    )
  }
  if (!post) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Ionicons name={kindIcon} size={48} color={lightColors.ink500} />
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
  const category = post.category || meta.defaultBadge
  const images = post.images ?? []
  const region = `${post.service_region ?? ""} ${post.service_district ?? ""}`.trim()
  // 인테리어 공간 — content 의 "[공간] X" 태그 추출 후 본문에서 제거
  const spaceMatch = (post.content || "").match(/\n*\[공간\]\s*([^\n]+)/)
  const spaceTag = spaceMatch ? spaceMatch[1].trim() : null
  const cleanContent = spaceMatch
    ? (post.content || "").replace(spaceMatch[0], "").trim()
    : post.content

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>{meta.label}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={handleLike} hitSlop={8} style={styles.headerBtn} accessibilityLabel={liked ? "좋아요 해제" : "좋아요"} accessibilityRole="button">
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={22}
              color={liked ? "#ef4444" : lightColors.ink900}
            />
          </Pressable>
          <Pressable onPress={handleShare} hitSlop={8} style={styles.headerBtn} accessibilityLabel="공유하기" accessibilityRole="button">
            <Ionicons name="share-social-outline" size={22} color={lightColors.ink900} />
          </Pressable>
          <PostActionsMenu
            kind={kind as PostKind}
            postId={post.id}
            authorId={post.user_id}
            editHref={`/${kind}/${post.id}/edit`}
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
              renderItem={({ item, index }) => (
                <Pressable onPress={() => { setImageIndex(index); setLightboxOpen(true) }}>
                  <Image source={{ uri: item }} style={{ width, aspectRatio: 4 / 3 }} />
                </Pressable>
              )}
            />
          ) : (
            <View
              style={[
                styles.galleryFallback,
                { width, aspectRatio: 4 / 3, backgroundColor: meta.bg },
              ]}
            >
              <Ionicons name={kindIcon} size={64} color="#ffffff" />
              <Text style={styles.galleryFallbackLabel}>{category}</Text>
            </View>
          )}

          <View style={styles.galleryBadges}>
            <View style={[styles.badge, { backgroundColor: meta.bg }]}>
              <Ionicons name={kindIcon} size={12} color="#ffffff" />
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
          <Text style={styles.price}>{formatServicePrice(post)}</Text>

          {/* Meta — 위치 제거(아래 위치 섹션으로 이동). 인테리어 공간 뱃지 노출 */}
          <View style={styles.metaRow}>
            {!!spaceTag && (
              <View style={[styles.metaItem, styles.spaceBadge]}>
                <Ionicons name="home-outline" size={12} color={KIND_ACCENT[kind].color} />
                <Text style={[styles.spaceBadgeText, { color: KIND_ACCENT[kind].color }]}>
                  {spaceTag}
                </Text>
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

          {cleanContent && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>서비스 소개</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{cleanContent}</Text>
              </View>
            </View>
          )}

          {/* 위치 — 매물 상세 톤 (서비스 지역 + 지도) */}
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
                  interactive
                  hideOkBadge
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
            accentColor={KIND_ACCENT[kind].color}
            extraBadge={{
              label: KIND_ACCENT[kind].label,
              color: KIND_ACCENT[kind].color,
            }}
          />
        )}
        <DetailLegalNotice variant="service" />
      </ScrollView>

      <View style={styles.actionBar}>
        {!!post.contact_phone && (
          <Pressable style={styles.actionOutline} onPress={callPhone} accessibilityLabel="전화하기" accessibilityRole="button">
            <Ionicons name="call-outline" size={18} color={lightColors.ink900} />
            <Text style={styles.actionOutlineText}>전화</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.actionPrimary, { flex: 1 }]}
          onPress={openChat}
          disabled={busy}
          accessibilityLabel="채팅하기"
          accessibilityRole="button"
        >
          <Ionicons name="chatbubble-ellipses" size={18} color="#ffffff" />
          <Text style={styles.actionPrimaryText}>채팅하기</Text>
        </Pressable>
      </View>
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
    fontSize: 18,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },
  price: { fontSize: 22, fontWeight: "700", color: lightColors.primary },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
    paddingTop: spacing[3],
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: fontSize.xs, color: lightColors.ink500 },
  spaceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  spaceBadgeText: { fontSize: 11, fontWeight: "700" },

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
