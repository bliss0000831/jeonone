/**
 * 구인구직 상세 — 광장 web /jobs/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 구인구직 + 좋아요 / 공유 / 호스트 메뉴)
 *   - 이미지 캐러셀 + 구인/구직 배지 (좌상단) + 모집마감 배지
 *   - 제목
 *   - 시급 강조 박스 (teal)
 *   - 메타 (위치 / 조회 / 좋아요 / 시간)
 *   - 근무 조건 그리드 (work_type / category / work_days / work_hours)
 *   - 상세 설명 (description)
 *   - 연락하기 박스 (contact)
 *   - 작성자 카드 (구인/구직 뱃지)
 *   - 액션 바 (채팅하기 teal / 모집마감 disabled)
 *   - 호스트 메뉴: 모집마감 / 수정 (웹) / 삭제
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
import { ImageLightbox } from "@/components/ImageLightbox"
import { useShareModal } from "@/components/mypage/ShareModal"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  closeJobsPost,
  deleteJobsPost,
  getJobsPost,
  toggleJobsLike,
  type JobsAuthor,
  type JobsPost,
} from "@gwangjang/features/jobs"
import { useAuth } from "@/lib/auth-context"
import { useLoginGate } from "@/components/LoginGate"
import { startPostChat } from "@gwangjang/features/chat"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useTrackRecent } from "@/lib/recent-views"
import { useTrackView } from "@/lib/view-tracker"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AuthorCard } from "@/components/AuthorCard"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"
import { AddressMapPreview } from "@/components/AddressMapPreview"

const TEAL = "#0d9488"

function formatDate(iso: string): string {
  const d = new Date(iso)
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "오늘"
  if (diff === 1) return "어제"
  if (diff < 7) return `${diff}일 전`
  return d.toLocaleDateString("ko-KR")
}

export default function JobsDetailScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const { requireLogin } = useLoginGate()
  const { width } = useWindowDimensions()

  useTrackView("jobs_posts", id)

  const [post, setPost] = useState<JobsPost | null>(null)
  useTrackRecent({
    id: id as string,
    kind: "jobs",
    kindLabel: "구인구직",
    title: post?.title,
    image: (post as any)?.images?.[0] ?? null,
    href: `/jobs/${id}`,
  })
  const [author, setAuthor] = useState<JobsAuthor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!id) return
    const supabase = getSupabase()
    setLoadError(false)
    try {
      const r = await getJobsPost(supabase, id, DEFAULT_PLAZA, user?.id ?? null)
      setPost(r.post)
      setAuthor(r.author)
      setLiked(r.is_liked)
    } catch (e) {
      console.warn("[jobs] load failed", e)
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
    const next = !liked
    setLiked(next)
    try {
      await toggleJobsLike(getSupabase(), {
        postId: post.id,
        userId: user.id,
        isLiked: liked,
      })
    } catch {
      setLiked(!next)
    }
  }

  async function handleShare() {
    if (!post) return
    share.open({ url: buildShareUrl("jobs", post.id), title: post.title,
        message: `${post.title}\n${buildShareUrl("jobs", post.id)}` })
  }

  function confirmClose() {
    Alert.alert("모집마감", "모집을 마감할까요?", [
      { text: "취소", style: "cancel" },
      { text: "마감", onPress: handleClose },
    ])
  }

  async function handleClose() {
    if (!post) return
    setBusy(true)
    try {
      await closeJobsPost(getSupabase(), post.id)
      setPost({ ...post, status: "closed" })
    } catch (e: any) {
      Alert.alert("처리 실패", e?.message ?? "")
    } finally {
      setBusy(false)
    }
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
      await deleteJobsPost(getSupabase(), post.id)
      router.back()
    } catch (e: any) {
      Alert.alert("삭제 실패", e?.message ?? "")
    } finally {
      setBusy(false)
    }
  }

  function openHostMenu() {
    if (!post) return
    const items: Array<{ text: string; style?: "destructive" | "cancel"; onPress?: () => void }> = []
    if (post.status !== "closed") {
      items.push({ text: "모집마감", onPress: confirmClose })
    }
    items.push({
      text: "수정하기",
      onPress: () => router.push(`/jobs/${post.id}/edit` as any),
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
        { postId: post.id, postType: "jobs" },
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
        <Ionicons name="briefcase-outline" size={48} color={lightColors.ink500} />
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
  const isClosed = post.status === "closed"
  const kindLabel = post.kind === "hiring" ? "구인" : "구직"
  const kindBg = post.kind === "hiring" ? "#3b82f6" : "#a855f7"
  const images = post.images ?? []

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>구인구직</Text>
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
            kind="jobs"
            postId={post.id}
            authorId={post.user_id}
            editHref={`/jobs/${post.id}/edit`}
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
              renderItem={({ item, index }) => (
                <Pressable onPress={() => { setImageIndex(index); setLightboxOpen(true) }}>
                  <MediaItem uri={item} style={{ width, aspectRatio: 4 / 3 }} />
                </Pressable>
              )}
            />
          ) : (
            <View
              style={[
                styles.galleryFallback,
                { width, aspectRatio: 4 / 3, backgroundColor: kindBg },
              ]}
            >
              <Ionicons name="briefcase-outline" size={64} color="#ffffff" />
              <Text style={styles.galleryFallbackLabel}>구인구직</Text>
            </View>
          )}

          <View style={styles.galleryBadges}>
            <View style={[styles.badge, { backgroundColor: kindBg }]}>
              <Ionicons name="briefcase" size={12} color="#ffffff" />
              <Text style={styles.badgeText}>{kindLabel}</Text>
            </View>
            {isClosed && (
              <View style={[styles.badge, { backgroundColor: "#1f2937" }]}>
                <Text style={styles.badgeText}>모집마감</Text>
              </View>
            )}
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

          {/* 시급 강조 */}
          <View style={styles.wageBox}>
            <Text style={styles.wageLabel}>시급</Text>
            <Text style={styles.wageVal}>
              {(post.hourly_wage || 0).toLocaleString("ko-KR")}원
            </Text>
          </View>

          {/* Meta — 위치 제거(아래 위치 섹션으로 이동) */}
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

          {/* 근무 조건 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>근무 조건</Text>
            <View style={styles.infoGrid}>
              {!!post.work_type && (
                <InfoChip icon="briefcase-outline" label="근무형태" value={post.work_type} />
              )}
              {!!post.category && (
                <InfoChip icon="briefcase-outline" label="카테고리" value={post.category} />
              )}
              {!!post.work_days && (
                <InfoChip icon="calendar-outline" label="근무일" value={post.work_days} />
              )}
              {!!post.work_hours && (
                <InfoChip icon="time-outline" label="근무시간" value={post.work_hours} />
              )}
            </View>
          </View>

          {/* 상세 설명 */}
          {!!post.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>상세 설명</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{post.description}</Text>
              </View>
            </View>
          )}

          {/* 연락하기 */}
          {!!post.contact && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>연락하기</Text>
              <View style={styles.contactBox}>
                <Ionicons name="call-outline" size={18} color={TEAL} />
                <Text style={styles.contactText}>{post.contact}</Text>
              </View>
            </View>
          )}

          {/* 위치 — 매물 상세 톤 (주소 + 지도) */}
          {!!post.location && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>근무지</Text>
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
                  persistTo={{ table: "jobs_posts", id: post.id }}
                />
              </View>
            </View>
          )}

        </View>

        {/* 구인 정보 — 가장 아래 */}
        {author && (
          <AuthorCard
            profile={{
              id: author.id,
              nickname: author.nickname,
              avatar_url: author.avatar_url,
              account_type: (author as any).account_type ?? null,
              created_at: (author as any).created_at ?? null,
            }}
            title="작성자 정보"
            extraBadge={
              post.kind === "hiring"
                ? { label: "구인", color: "#0d9488" }
                : { label: "구직", color: "#3b82f6" }
            }
          />
        )}
        <DetailLegalNotice variant="neutral" />
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        {isClosed ? (
          <Pressable style={[styles.actionOutline, { flex: 1 }]} disabled>
            <Text style={[styles.actionOutlineText, { color: lightColors.ink500 }]}>
              모집마감
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.actionPrimary, { flex: 1, backgroundColor: TEAL }]}
            onPress={openChat}
            disabled={busy}
          >
            <Ionicons name="chatbubble-ellipses" size={18} color="#ffffff" />
            <Text style={styles.actionPrimaryText}>채팅하기</Text>
          </Pressable>
        )}
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

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: any
  label: string
  value: string
}) {
  return (
    <View style={styles.infoChip}>
      <Ionicons name={icon} size={16} color={TEAL} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoChipLabel}>{label}</Text>
        <Text style={styles.infoChipVal} numberOfLines={2}>{value}</Text>
      </View>
    </View>
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
    fontSize: 20,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[3],
  },
  wageBox: {
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: "rgba(13,148,136,0.08)",
    borderWidth: 1,
    borderColor: "rgba(13,148,136,0.2)",
  },
  wageLabel: { fontSize: 12, color: lightColors.ink500, marginBottom: 4 },
  wageVal: { fontSize: 24, fontWeight: "700", color: TEAL },

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

  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  infoChip: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: lightColors.muted,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  infoChipLabel: { fontSize: 12, color: lightColors.ink500 },
  infoChipVal: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
    marginTop: 2,
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

  contactBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: lightColors.muted,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  contactText: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900 },

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
