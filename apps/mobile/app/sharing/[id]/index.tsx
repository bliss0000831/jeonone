/**
 * 나눔 상세 — 광장 web /sharing/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 나눔 + 좋아요 / 공유 / 호스트 메뉴)
 *   - 이미지 캐러셀 + 상태 배지 (좌상단: 나눔중/예약중/나눔완료)
 *   - 제목
 *   - 메타 (위치 / 조회 / 좋아요 / 시간)
 *   - 나눔 설명 (description)
 *   - 나눔자 카드 (나눔 뱃지)
 *   - 액션 바 (채팅하기 / 나눔완료)
 *   - 호스트 메뉴: 나눔완료 / 수정 (웹) / 삭제
 *
 * 채팅 라우팅은 RN 미구현 — fallback 외부 웹뷰.
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
import { impactLight } from "@gwangjang/platform/haptics"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import {
  completeSharing,
  deleteSharingPost,
  getSharingPost,
  toggleSharingLike,
  type SharingAuthor,
  type SharingPost,
} from "@gwangjang/features/sharing"
import { startPostChat } from "@gwangjang/features/chat"
import { useAuth } from "@/lib/auth-context"
import { useLoginGate } from "@/components/LoginGate"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { PostReportModal } from "@/components/PostReportModal"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useTrackRecent } from "@/lib/recent-views"
import { useTrackView } from "@/lib/view-tracker"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AuthorCard } from "@/components/AuthorCard"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"
import { AddressMapPreview } from "@/components/AddressMapPreview"


const STATUS_BADGE: Record<string, { label: string; bg: string }> = {
  available: { label: "나눔중", bg: "#22c55e" },
  reserved: { label: "예약중", bg: "#eab308" },
  completed: { label: "나눔완료", bg: "#6b7280" },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "오늘"
  if (diff === 1) return "어제"
  if (diff < 7) return `${diff}일 전`
  return d.toLocaleDateString("ko-KR")
}

export default function SharingDetailScreen() {
  const styles = useThemedStyles(makeStyles)
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const { requireLogin } = useLoginGate()
  const { width } = useWindowDimensions()

  useTrackView("sharing_posts", id)

  const [post, setPost] = useState<SharingPost | null>(null)
  useTrackRecent({
    id: id as string,
    kind: "sharing",
    kindLabel: "나눔",
    title: post?.title,
    image: (post as any)?.images?.[0] ?? null,
    href: `/sharing/${id}`,
  })
  const [author, setAuthor] = useState<SharingAuthor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!id) return
    const supabase = getSupabase()
    setLoadError(false)
    try {
      const r = await getSharingPost(supabase, id, DEFAULT_PLAZA, user?.id ?? null)
      setPost(r.post)
      setAuthor(r.author)
      setLiked(r.is_liked)
    } catch (e) {
      console.warn("[sharing] load failed", e)
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
      const r = await toggleSharingLike(getSupabase(), {
        postId: post.id,
        userId: user.id,
        isLiked: liked,
        currentLikes: post.likes,
      })
      setLiked(r.liked)
      setPost({ ...post, likes: r.likes })
    } catch (e) {
      console.warn("[sharing] like failed", e)
      Alert.alert("오류", "좋아요 처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  async function handleShare() {
    if (!post) return
    share.open({ url: buildShareUrl("sharing", post.id), title: post.title,
        message: `${post.title}\n${buildShareUrl("sharing", post.id)}` })
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
      await deleteSharingPost(getSupabase(), post.id)
      router.back()
    } catch (e: any) {
      Alert.alert("삭제 실패", e?.message ?? "처리에 실패했습니다")
    } finally {
      setBusy(false)
    }
  }

  function confirmComplete() {
    Alert.alert("나눔완료", "이 나눔을 완료 처리할까요?", [
      { text: "취소", style: "cancel" },
      { text: "나눔완료", onPress: handleComplete },
    ])
  }

  async function handleComplete() {
    if (!post) return
    setBusy(true)
    try {
      await completeSharing(getSupabase(), post.id)
      setPost({ ...post, status: "completed" })
    } catch (e: any) {
      Alert.alert("처리 실패", e?.message ?? "")
    } finally {
      setBusy(false)
    }
  }

  function openHostMenu() {
    if (!post) return
    const isCompleted = post.status === "completed"
    const items: Array<{ text: string; style?: "destructive" | "cancel"; onPress?: () => void }> = []
    if (!isCompleted) {
      items.push({ text: "나눔완료", onPress: confirmComplete })
    }
    items.push({
      text: "수정하기",
      onPress: () => router.push(`/sharing/${post.id}/edit` as any),
    })
    items.push({ text: "삭제하기", style: "destructive", onPress: confirmDelete })
    items.push({ text: "취소", style: "cancel" })
    Alert.alert("관리", undefined, items)
  }

  async function openChat() {
    if (!post) return
    if (busy) return // 더블탭 방지 — 중복 채팅방 생성 차단
    if (!requireLogin("채팅") || !user) return
    if (user.id === post.user_id) {
      Alert.alert("알림", "본인 게시물에는 채팅할 수 없습니다")
      return
    }
    setBusy(true)
    try {
      const r = await startPostChat(
        (u, init) => gwangjangFetch(u, init as any),
        { postId: post.id, postType: "sharing" },
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
        <Ionicons name="gift-outline" size={48} color={lightColors.ink500} />
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
  const isCompleted = post.status === "completed"
  const status = STATUS_BADGE[post.status as string] ?? STATUS_BADGE.available
  const images = post.images ?? []

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>나눔</Text>
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
          {/* 액션 — 비작성자: 신고 / 작성자·관리자: ⋮ 메뉴 (sharing 은 올리기 미지원) */}
          {post && (
            <PostActionsMenu
              kind="sharing"
              postId={post.id}
              authorId={post.user_id}
              editHref={`/sharing/${post.id}/edit`}
              onDeleted={() => router.back()}
            />
          )}
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
              <Ionicons name="gift-outline" size={64} color="#16a34a" />
              <Text style={styles.galleryFallbackLabel}>나눔</Text>
            </View>
          )}

          <View style={styles.galleryBadges}>
            <View style={[styles.badge, { backgroundColor: status.bg }]}>
              <Ionicons name="gift" size={12} color="#ffffff" />
              <Text style={styles.badgeText}>{status.label}</Text>
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

          {/* Meta — 위치 제거(아래 섹션으로 이동), 조회/좋아요/시간만 */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="eye-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{post.views ?? 0}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="heart-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{post.likes ?? 0}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.metaText}>{formatDate((post as any).effective_at ?? (post as any).bumped_at ?? post.created_at)}</Text>
            </View>
          </View>

          {/* Description */}
          {post.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>나눔 설명</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{post.description}</Text>
              </View>
            </View>
          )}

          {/* 위치 — 매물 상세 톤(주소 + 지도) */}
          {post.location && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>나눔 위치</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color={lightColors.ink500} />
                <Text style={styles.locationText}>{post.location}</Text>
              </View>
              <View style={{ marginTop: spacing[2] }}>
                <AddressMapPreview
                  address={post.location}
                  height={220}
                  manualNaverToggle
                  hideOkBadge
                  initialLat={post.lat ?? null}
                  initialLng={post.lng ?? null}
                  persistTo={{ table: "sharing_posts", id: post.id }}
                />
              </View>
            </View>
          )}

        </View>

        {/* 작성자 정보 — 가장 아래 */}
        {author && (
          <AuthorCard
            profile={{
              id: author.id,
              nickname: author.nickname,
              avatar_url: author.avatar_url,
              account_type: (author as any).account_type ?? null,
              created_at: (author as any).created_at ?? null,
            }}
            title="나눔자 정보"
            extraBadge={{ label: "나눔", color: "#ef4444" }}
          />
        )}
        <DetailLegalNotice variant="neutral" />
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        {isCompleted ? (
          <Pressable style={[styles.actionOutline, { flex: 1 }]} disabled>
            <Text style={[styles.actionOutlineText, { color: lightColors.ink500 }]}>
              나눔완료
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.actionPrimary, { flex: 1 }]}
            onPress={openChat}
            disabled={busy}
          >
            <Ionicons name="chatbubble-ellipses" size={18} color="#ffffff" />
            <Text style={styles.actionPrimaryText}>채팅하기</Text>
          </Pressable>
        )}
      </View>
      {/* 신고 모달 */}
      {post && (
        <PostReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="sharing"
          targetId={post.id}
        />
      )}
      {share.element}
    </SafeAreaView>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
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
    color: colors.ink900,
  },
  headerRight: { flexDirection: "row" },

  galleryFallback: {
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryFallbackLabel: { marginTop: 8, color: "#16a34a", fontWeight: "700" },
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
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink900,
    marginBottom: spacing[2],
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
    paddingTop: spacing[2],
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: fontSize.xs, color: colors.ink500 },

  section: { paddingTop: spacing[4] },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
    marginBottom: spacing[2],
  },
  infoBox: {
    backgroundColor: colors.muted,
    padding: spacing[3],
    borderRadius: radius.md,
  },
  infoText: { fontSize: fontSize.sm, color: colors.ink900, lineHeight: 22 },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: fontSize.sm,
    color: colors.ink700,
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
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  actionPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
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
    borderColor: colors.border,
  },
  actionOutlineText: { fontWeight: "600", fontSize: fontSize.md, color: colors.ink900 },
})
}

const styles = makeStyles(lightColors)
