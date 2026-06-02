/**
 * 모임 상세 — 광장 web /clubs/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - Hero (이미지 OR 스포츠 이모지 그라디언트 + 상태 배지 / 실력 / 종목 / 제목)
 *   - 작성자 카드 (모임장 뱃지)
 *   - 메타 (조회 / 좋아요)
 *   - Info Grid (장소 / 날짜 / 시간 / 인원)
 *   - 모집 현황 progress bar
 *   - 본문 (모임 소개)
 *   - 액션 바 (참여 / 취소 / 채팅방 입장 / 모집 마감 / 마감됨)
 *   - 헤더 우측 액션: 좋아요 / 공유 / 호스트 메뉴 (수정 placeholder + 삭제)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
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
import { useTrackView } from "@/lib/view-tracker"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  closeClub,
  deleteClub,
  getClubPost,
  isClubLiked,
  isClubMember,
  joinClubAtomic,
  leaveClub,
  toggleClubLike,
  type ClubPost,
  type ClubProfile,
} from "@gwangjang/features/clubs"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AuthorCard } from "@/components/AuthorCard"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"
import { AddressMapPreview } from "@/components/AddressMapPreview"
import { pickClubTheme } from "@/components/home/formatters"


const SPORT_ICON: Record<string, string> = {
  러닝: "🏃",
  배드민턴: "🏸",
  축구: "⚽",
  농구: "🏀",
  테니스: "🎾",
  등산: "⛰️",
  수영: "🏊",
  자전거: "🚴",
  요가: "🧘",
  기타: "🎯",
}

const SKILL_BG: Record<string, { bg: string; fg: string }> = {
  누구나: { bg: "rgba(249,115,22,0.15)", fg: "#ea580c" },
  초급: { bg: "rgba(34,197,94,0.15)", fg: "#16a34a" },
  중급: { bg: "rgba(234,179,8,0.15)", fg: "#ca8a04" },
  고급: { bg: "rgba(239,68,68,0.15)", fg: "#dc2626" },
}

function formatMeetingDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })
}

export default function ClubDetailScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const { width } = useWindowDimensions()
  useTrackView("clubs", id)

  const [post, setPost] = useState<ClubPost | null>(null)
  const [profile, setProfile] = useState<ClubProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [isMember, setIsMember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!id) return
    const supabase = getSupabase()
    setLoadError(false)
    try {
      // 3개 모두 id (+ user.id) 만 의존 — getClubPost 와 동시 fetch.
      const [postRes, lk, mb] = await Promise.all([
        getClubPost(supabase, id, DEFAULT_PLAZA),
        user ? isClubLiked(supabase, id, user.id) : Promise.resolve(false),
        user ? isClubMember(supabase, id, user.id) : Promise.resolve(false),
      ])
      const { post: p, profile: pr } = postRes
      setPost(p)
      setProfile(pr)
      setLikeCount(p?.like_count ?? 0)
      if (user && p) {
        setLiked(lk)
        setIsMember(mb)
      }
    } catch (e) {
      console.warn("[clubs] load failed", e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [id, user])

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

  const [likeBusy, setLikeBusy] = useState(false)
  async function handleLike() {
    if (!user || !post) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    if (likeBusy) return // 더블탭 방지 — 좋아요 수/상태 불일치 방지
    setLikeBusy(true)
    try {
      const supabase = getSupabase()
      const r = await toggleClubLike(supabase, {
        clubId: post.id,
        userId: user.id,
        isLiked: liked,
        currentCount: likeCount,
      })
      setLiked(r.liked)
      setLikeCount(r.count)
    } catch (e) {
      console.warn("[clubs] like failed", e)
      Alert.alert("오류", "좋아요 처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setLikeBusy(false)
    }
  }

  async function handleShare() {
    if (!post) return
    share.open({ title: post.title,
        message: `${post.title}\n${buildShareUrl("clubs", post.id)}` })
  }

  async function handleJoin() {
    if (!user || !post) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    setBusy(true)
    try {
      const r = await joinClubAtomic(getSupabase(), post.id, user.id)
      if (!r.ok) {
        Alert.alert("참여 실패", r.error ?? "처리에 실패했습니다")
        return
      }
      setIsMember(true)
      if (r.chatOpened) {
        Alert.alert("정원 마감", "채팅방이 열렸습니다!")
      }
      fetchAll()
    } catch (e: any) {
      Alert.alert("오류", e?.message || "처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
  }

  function confirmLeave() {
    if (!post) return
    const isAfterClose = post.status === "closed" || post.status === "full"
    const msg = isAfterClose
      ? "채팅방에서 나가면 다시 들어올 수 없습니다. 정말 나가시겠습니까?"
      : "정말 모임에서 나가시겠습니까?"
    Alert.alert("모임 나가기", msg, [
      { text: "취소", style: "cancel" },
      { text: "나가기", style: "destructive", onPress: handleLeave },
    ])
  }

  async function handleLeave() {
    if (!user || !post) return
    setBusy(true)
    try {
      const r = await leaveClub(getSupabase(), post.id, user.id)
      if (!r.ok) {
        Alert.alert("나가기 실패", r.error ?? "처리에 실패했습니다")
        return
      }
      setIsMember(false)
      if (post.status === "closed" || post.status === "full") {
        router.back()
        return
      }
      fetchAll()
    } catch (e: any) {
      Alert.alert("오류", e?.message || "처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
  }

  function confirmClose() {
    Alert.alert(
      "모집 마감",
      "지금 모집을 마감하고 채팅방을 열까요?\n(다시 모집으로 되돌릴 수 없습니다)",
      [
        { text: "취소", style: "cancel" },
        { text: "마감", style: "destructive", onPress: handleClose },
      ],
    )
  }

  async function handleClose() {
    if (!post) return
    setBusy(true)
    try {
      const r = await closeClub(getSupabase(), post.id)
      if (!r.ok) {
        Alert.alert("마감 실패", r.error ?? "처리에 실패했습니다")
        return
      }
      // 모임 채팅방 RN 라우트로 진입
      router.replace(`/chat/club/${post.id}` as any)
    } catch (e: any) {
      Alert.alert("오류", e?.message || "처리에 실패했습니다. 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
  }

  function confirmDelete() {
    Alert.alert("모임 삭제", "정말로 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: handleDelete },
    ])
  }

  async function handleDelete() {
    if (!post) return
    setBusy(true)
    try {
      await deleteClub(getSupabase(), post.id)
      router.back()
    } catch (e: any) {
      Alert.alert("삭제 실패", e?.message ?? "처리에 실패했습니다")
    } finally {
      setBusy(false)
    }
  }

  function openHostMenu() {
    Alert.alert("관리", undefined, [
      { text: "수정하기", onPress: () => router.push(`/clubs/${post?.id}/edit` as any) },
      { text: "삭제하기", style: "destructive", onPress: confirmDelete },
      { text: "취소", style: "cancel" },
    ])
  }

  function openChat() {
    if (!post) return
    router.push(`/chat/club/${post.id}` as any)
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
        <Ionicons name={loadError ? "alert-circle-outline" : "people-outline"} size={48} color={lightColors.ink500} />
        <Text style={{ color: lightColors.ink500, marginTop: 12 }}>
          {loadError ? "불러오지 못했습니다" : "모임을 찾을 수 없습니다"}
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

  const isOwner = !!user && post.user_id === user.id
  const isFull = post.current_members >= post.max_members
  const isClosed = post.status === "closed"
  const fillPct = Math.min((post.current_members / post.max_members) * 100, 100)
  const sportIcon = SPORT_ICON[post.sport_type ?? ""] ?? SPORT_ICON["기타"]
  const meetingDateText = formatMeetingDate(post.meeting_date)
  const skillStyle = SKILL_BG[post.skill_level] ?? SKILL_BG["누구나"]

  const statusBadge = (
    <View
      style={[
        styles.badge,
        isClosed || isFull
          ? { backgroundColor: "#f43f5e" }
          : { backgroundColor: lightColors.primary },
      ]}
    >
      <Text style={styles.badgeText}>
        {isClosed ? "마감" : isFull ? "정원마감" : "모집중"}
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>모임</Text>
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
            kind="clubs"
            postId={post.id}
            authorId={post.user_id}
            editHref={`/clubs/${post.id}/edit`}
            onDeleted={() => router.back()}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Hero */}
        <View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[3] }}>
          <View style={[styles.hero, { width: width - spacing[4] * 2 }]}>
            <Image
              source={{ uri: post.images?.[0] || pickClubTheme(post.sport_type ?? post.category ?? post.title ?? "").thumb }}
              cachePolicy="memory-disk"
              style={styles.heroImg}
            />
            <View style={styles.heroOverlay} />
            <View style={styles.heroBadges}>
              {statusBadge}
              <View style={[styles.badge, { backgroundColor: skillStyle.bg }]}>
                <Text style={[styles.badgeText, { color: skillStyle.fg }]}>
                  {post.skill_level}
                </Text>
              </View>
              {post.sport_type && (
                <View style={[styles.badge, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                  <Text style={[styles.badgeText, { color: "#ffffff" }]}>{post.sport_type}</Text>
                </View>
              )}
            </View>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroTitle} numberOfLines={3}>{post.title}</Text>
            </View>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="eye-outline" size={14} color={lightColors.ink500} />
            <Text style={styles.metaText}>조회 {post.view_count ?? 0}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="heart-outline" size={14} color={lightColors.ink500} />
            <Text style={styles.metaText}>좋아요 {likeCount}</Text>
          </View>
        </View>

        {/* Info Grid — 날짜/시간만 (장소→위치 섹션, 참여 인원→모집 현황 바로 중복 제거) */}
        <View style={styles.infoGrid}>
          {meetingDateText && (
            <InfoCell icon="calendar-outline" label="날짜" value={meetingDateText} />
          )}
          {post.meeting_time && (
            <InfoCell icon="time-outline" label="시간" value={post.meeting_time} />
          )}
        </View>

        {/* Progress */}
        <View style={styles.progressBox}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLabel}>모집 현황</Text>
            <Text style={[styles.progressVal, isFull && { color: "#f43f5e" }]}>
              {post.current_members}/{post.max_members}명
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${fillPct}%`, backgroundColor: isFull ? "#f43f5e" : lightColors.primary },
              ]}
            />
          </View>
          {isFull && (
            <View style={styles.fullWarn}>
              <Ionicons name="alert-circle" size={14} color="#f43f5e" />
              <Text style={styles.fullWarnText}>모집이 마감되었습니다</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {(post.content || post.description) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>모임 소개</Text>
            <View style={styles.descBox}>
              <Text style={styles.descText}>{post.content || post.description}</Text>
            </View>
          </View>
        )}

        {/* 위치 — 매물 상세 톤 (주소 + 지도) */}
        {!!post.location && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>모임 장소</Text>
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
                persistTo={{ table: "clubs", id: post.id }}
              />
            </View>
          </View>
        )}

        {/* 주최자 정보 — 가장 아래 */}
        {profile && (
          <AuthorCard
            profile={{
              id: profile.id,
              nickname: profile.nickname,
              avatar_url: profile.avatar_url,
              account_type: (profile as any).account_type ?? null,
              created_at: (profile as any).created_at ?? null,
            }}
            title="작성자 카드"
            extraBadge={{ label: "모임장", color: "#6366f1" }}
          />
        )}
        <DetailLegalNotice variant="neutral" />
      </ScrollView>

      {/* Sticky action bar */}
      <View style={styles.actionBar}>
        {(isClosed || isFull) && isMember ? (
          <>
            <Pressable
              style={[styles.actionPrimary, { flex: 1 }]}
              onPress={openChat}
              disabled={busy}
            >
              <Ionicons name="chatbubble-ellipses" size={18} color="#ffffff" />
              <Text style={styles.actionPrimaryText}>채팅방 입장</Text>
            </Pressable>
            {!isOwner && (
              <Pressable style={styles.actionOutline} onPress={confirmLeave} disabled={busy}>
                <Text style={styles.actionOutlineText}>{busy ? "..." : "나가기"}</Text>
              </Pressable>
            )}
          </>
        ) : !isFull && !isClosed && !isMember ? (
          <Pressable
            style={[styles.actionPrimary, { flex: 1 }]}
            onPress={handleJoin}
            disabled={busy}
          >
            <Ionicons name="people" size={18} color="#ffffff" />
            <Text style={styles.actionPrimaryText}>
              {busy ? "신청 중..." : "참여 신청하기"}
            </Text>
          </Pressable>
        ) : !isFull && !isClosed && isMember && !isOwner ? (
          <Pressable
            style={[styles.actionOutline, { flex: 1 }]}
            onPress={confirmLeave}
            disabled={busy}
          >
            <Ionicons name="people-outline" size={18} color={lightColors.primary} />
            <Text style={[styles.actionOutlineText, { color: lightColors.primary }]}>
              {busy ? "처리 중..." : "참여 취소"}
            </Text>
          </Pressable>
        ) : isOwner && !isFull && !isClosed ? (
          <Pressable
            style={[styles.actionOutline, styles.actionOwnerClose, { flex: 1 }]}
            onPress={confirmClose}
            disabled={busy}
          >
            <Ionicons name="lock-closed-outline" size={18} color={lightColors.primary} />
            <Text style={[styles.actionOutlineText, { color: lightColors.primary }]}>
              {busy ? "마감 중..." : "모집 마감하기"}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.actionOutline, { flex: 1 }]} disabled>
            <Ionicons name="lock-closed-outline" size={18} color={lightColors.ink500} />
            <Text style={[styles.actionOutlineText, { color: lightColors.ink500 }]}>
              마감된 모임
            </Text>
          </Pressable>
        )}
      </View>
      {share.element}
    </SafeAreaView>
  )
}

function InfoCell({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Ionicons name={icon} size={16} color={lightColors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoVal} numberOfLines={2}>{value}</Text>
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

  hero: {
    aspectRatio: 16 / 10,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#6366f1",
  },
  heroImg: { width: "100%", height: "100%" },
  heroEmoji: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366f1",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  heroBadges: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  heroTitleWrap: { position: "absolute", left: 16, right: 16, bottom: 16 },
  heroTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowRadius: 4,
  },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#ffffff" },

  section: { paddingHorizontal: spacing[4], paddingTop: spacing[4] },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: spacing[2],
  },

  metaRow: {
    flexDirection: "row",
    gap: spacing[4],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: fontSize.xs, color: lightColors.ink500 },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  infoCell: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: lightColors.muted,
    padding: 12,
    borderRadius: radius.md,
  },
  infoLabel: { fontSize: 11, color: lightColors.ink500 },
  infoVal: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900, marginTop: 2 },

  progressBox: {
    marginHorizontal: spacing[4],
    marginTop: spacing[4],
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  progressHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressLabel: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900 },
  progressVal: { fontSize: fontSize.sm, fontWeight: "700", color: lightColors.primary },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: lightColors.muted,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 5 },
  fullWarn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  fullWarnText: { fontSize: 11, color: "#f43f5e" },

  descBox: {
    backgroundColor: lightColors.muted,
    padding: spacing[3],
    borderRadius: radius.md,
  },
  descText: { fontSize: fontSize.sm, color: lightColors.ink900, lineHeight: 22 },

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
  actionOwnerClose: { borderColor: lightColors.primary },
  actionOutlineText: { fontWeight: "600", fontSize: fontSize.md, color: lightColors.ink900 },
})
