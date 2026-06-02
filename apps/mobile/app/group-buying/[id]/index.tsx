/**
 * 공동구매 상세 — 광장 web /group-buying/[id] 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더 (← 공동구매 + 공유 + 더보기/마감/재오픈/삭제 (호스트))
 *   - 이미지 캐러셀 (페이징)
 *   - 상태 뱃지 (모집중/모집완료/거래완료/취소됨)
 *   - 가격 (정가 line-through + 공구가 + 할인율)
 *   - 제목 + 상품명
 *   - 마감 카운트다운 + 참여 진행률 바 + min/현재/max
 *   - 작성자 카드 + 신뢰 통계 (성공 N회 / 취소 N회)
 *   - 위치 / 픽업·배송
 *   - 상세 설명
 *   - 참여자 목록 (more 시 모달)
 *   - 하단 sticky: 위시리스트 / 채팅 / 참여하기 (또는 참여취소)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  cancelJoin,
  closePost,
  deletePost,
  getHostStats,
  getPost,
  isJoined,
  isWishlisted,
  joinAtomic,
  listParticipants,
  reopenPost,
  toggleWishlist,
  type GbParticipant,
  type GbPost,
  type GbProfile,
} from "@gwangjang/features/group-buying"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { startPostChat } from "@gwangjang/features/chat"
import { PostReportModal } from "@/components/PostReportModal"
import { PostActionsMenu } from "@/components/PostActionsMenu"
import { useTrackRecent } from "@/lib/recent-views"
import { useTrackView } from "@/lib/view-tracker"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"
import { AuthorCard } from "@/components/AuthorCard"
import { DetailLegalNotice } from "@/components/legal/DetailLegalNotice"


const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  recruiting: { label: "모집중", color: "#ffffff", bg: lightColors.primary },
  confirmed: { label: "모집완료", color: "#ffffff", bg: "#3b82f6" },
  completed: { label: "거래완료", color: lightColors.ink500, bg: lightColors.muted },
  cancelled: { label: "취소됨", color: "#ffffff", bg: "#dc2626" },
}

function formatDeadline(iso: string | null): string {
  if (!iso) return "마감 정보 없음"
  const d = new Date(iso).getTime()
  const diff = d - Date.now()
  if (diff < 0) return "마감됨"
  const days = Math.floor(diff / 86_400_000)
  const hrs = Math.floor((diff % 86_400_000) / 3_600_000)
  const min = Math.floor((diff % 3_600_000) / 60_000)
  if (days > 0) return `${days}일 ${hrs}시간 남음`
  if (hrs > 0) return `${hrs}시간 ${min}분 남음`
  if (min > 0) return `${min}분 남음`
  return "곧 마감"
}

import { relativeDate } from "@/lib/relative-date"

export default function GbDetailScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { id } = useLocalSearchParams<{ id: string }>()
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()
  const { width, height: screenHeight } = useWindowDimensions()

  useTrackView("group_buying_posts", id)

  const [post, setPost] = useState<GbPost | null>(null)
  const [deadlineText, setDeadlineText] = useState("")
  useTrackRecent({
    id: id as string,
    kind: "group_buying",
    kindLabel: "공동구매",
    title: post?.title,
    image: (post as any)?.images?.[0] ?? null,
    href: `/group-buying/${id}`,
  })
  const [profile, setProfile] = useState<GbProfile | null>(null)
  const [participants, setParticipants] = useState<GbParticipant[]>([])
  const [hostStats, setHostStats] = useState<{
    success_count: number
    cancel_count: number
    total_count: number
    success_pct: number | null
  } | null>(null)
  const [joined, setJoined] = useState(false)
  const [wished, setWished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [imageIndex, setImageIndex] = useState(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // 마감 카운트다운 실시간 갱신 (30초마다)
  useEffect(() => {
    if (!post?.deadline) return
    setDeadlineText(formatDeadline(post.deadline))
    const timer = setInterval(() => {
      setDeadlineText(formatDeadline(post.deadline))
    }, 30_000)
    return () => clearInterval(timer)
  }, [post?.deadline])

  // 참여 폼
  const [joinForm, setJoinForm] = useState({
    quantity: 1,
    receive_method: "delivery" as "pickup" | "delivery",
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    recipient_address_detail: "",
  })

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoadError(false)
      try {
        const supabase = getSupabase()
        // 마감 시각 지났으면 자동 정리 (성사 / 미달 환불)
        try {
          const { finalizeExpiredGroupBuying } = await import("@gwangjang/features/group-buying")
          await finalizeExpiredGroupBuying(supabase, id)
        } catch {}
        const [{ post: p, profile: pr }, parts] = await Promise.all([
          getPost(supabase, id, DEFAULT_PLAZA),
          listParticipants(supabase, id),
        ])
        if (cancelled) return
        setPost(p)
        setProfile(pr)
        setParticipants(parts)
        // host stats + joined/wished 동시 fetch (p, user.id 만 의존 — 서로 독립).
        if (p) {
          const [stats, j, w] = await Promise.all([
            getHostStats(supabase, p.user_id),
            user ? isJoined(supabase, id, user.id) : Promise.resolve(false),
            user ? isWishlisted(supabase, id, user.id) : Promise.resolve(false),
          ])
          if (!cancelled) {
            setHostStats(stats)
            if (user) {
              setJoined(j)
              setWished(w)
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[group-buying] load failed", e)
          setLoadError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, user?.id, reloadKey])

  async function refresh() {
    if (!id) return
    const supabase = getSupabase()
    const [{ post: p }, parts, j] = await Promise.all([
      getPost(supabase, id, DEFAULT_PLAZA),
      listParticipants(supabase, id),
      user ? isJoined(supabase, id, user.id) : Promise.resolve(false),
    ])
    setPost(p)
    setParticipants(parts)
    if (user) setJoined(j)
  }

  // useFocusEffect 는 mount 시에도 fire — 위 useEffect 의 초기 로딩과 중복 방지.
  // 첫 focus 는 스킵, 이후 (탭 전환 후 돌아오기 등) 만 가벼운 refresh 수행.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      refresh()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, user?.id]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id])

  async function handleWish() {
    if (!user || !post) {
      Alert.alert("로그인 필요", "로그인 후 이용해주세요")
      return
    }
    try {
      const next = await toggleWishlist(getSupabase(), {
        postId: post.id,
        userId: user.id,
        isWishlisted: wished,
      })
      setWished(next)
    } catch (e: any) {
      Alert.alert("실패", e?.message || "다시 시도")
    }
  }

  function handleShare() {
    if (!post) return
    share.open({
      title: post.title,
      message: `${post.title} — ${post.group_price.toLocaleString()}원\n${buildShareUrl("group-buying", post.id)}`,
      url: `${buildShareUrl("group-buying", post.id)}`,
    })
  }

  const chatBusyRef = useRef(false)
  async function handleChat() {
    if (!user || !post) {
      Alert.alert("로그인 필요", "로그인 후 이용해주세요")
      return
    }
    if (user.id === post.user_id) {
      Alert.alert("알림", "본인 공구에는 문의할 수 없습니다")
      return
    }
    if (chatBusyRef.current) return // 더블탭 방지 — 중복 채팅방 생성 차단
    chatBusyRef.current = true
    try {
      // 🆕 주최자와 1:1 문의 채팅 — 참여자 아니어도 가능
      //  (이전엔 chat/group-buying/[postId] 그룹채팅 — 참여자만 가능했음)
      const r = await startPostChat(
        (u, init) => gwangjangFetch(u, init as any),
        { postId: post.id, postType: "group_buying" },
      )
      if (!r.ok || !r.roomId) {
        Alert.alert("문의 실패", r.error ?? "")
        return
      }
      router.push(`/chat/${r.roomId}` as any)
    } finally {
      chatBusyRef.current = false
    }
  }

  async function openJoin() {
    if (!user || !post) {
      Alert.alert("로그인 필요", "로그인 후 이용해주세요")
      return
    }
    if (user.id === post.user_id) {
      Alert.alert("알림", "본인 공구에는 참여할 수 없습니다")
      return
    }
    if (post.status !== "recruiting") {
      Alert.alert("알림", "모집이 마감된 공구입니다")
      return
    }
    // 공동구매는 항상 선결제 — 미참여면 checkout 으로
    if (!joined) {
      router.push(`/group-buying/${post.id}/checkout` as any)
      return
    }
    if (joined) {
      Alert.alert("이미 참여중", "참여를 취소하시겠습니까?", [
        { text: "닫기", style: "cancel" },
        {
          text: "취소",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true)
            try {
              await cancelJoin(getSupabase(), { postId: post.id, userId: user.id })
              await refresh()
            } catch (e: any) {
              Alert.alert("실패", e?.message || "취소 실패")
            } finally {
              setActionLoading(false)
            }
          },
        },
      ])
      return
    }
    setJoinForm({
      quantity: 1,
      receive_method: "delivery",
      recipient_name: "",
      recipient_phone: "",
      recipient_address: "",
      recipient_address_detail: "",
    })
    setJoinOpen(true)
  }

  async function submitJoin() {
    if (!user || !post) return
    if (joinForm.receive_method === "delivery") {
      if (!joinForm.recipient_name.trim() || !joinForm.recipient_phone.trim() || !joinForm.recipient_address.trim()) {
        Alert.alert("입력 필요", "수령인 이름·연락처·주소는 필수입니다")
        return
      }
    }
    setActionLoading(true)
    try {
      const result = await joinAtomic(getSupabase(), post.id, user.id, {
        quantity: joinForm.quantity,
        receive_method: joinForm.receive_method,
        recipient_name: joinForm.recipient_name.trim() || undefined,
        recipient_phone: joinForm.recipient_phone.trim() || undefined,
        recipient_address: joinForm.recipient_address.trim() || undefined,
        recipient_address_detail: joinForm.recipient_address_detail.trim() || undefined,
      } as any)
      if (!result.ok) {
        Alert.alert("실패", result.error || "참여 실패")
        return
      }
      setJoinOpen(false)
      await refresh()
      Alert.alert("참여 완료", "공구에 참여하였습니다.")
    } catch (e: any) {
      // 네트워크 오류 — 모달/폼 유지하여 재시도 가능 (입력 데이터 보존)
      console.warn("[group-buying] join failed", e)
      Alert.alert("네트워크 오류", "참여 처리에 실패했습니다. 입력 내용은 유지되니 다시 시도해주세요.")
    } finally {
      setActionLoading(false)
    }
  }

  function handleHostMenu() {
    if (!post) return
    const opts: any[] = []
    if (post.status === "recruiting") {
      opts.push({
        text: "모집 마감",
        onPress: async () => {
          try {
            await closePost(getSupabase(), post.id)
            await refresh()
          } catch (e: any) {
            Alert.alert("실패", e?.message || "모집 마감에 실패했습니다")
          }
        },
      })
    }
    if (post.status === "confirmed" || post.status === "cancelled") {
      opts.push({
        text: "다시 모집",
        onPress: async () => {
          try {
            await reopenPost(getSupabase(), post.id)
            await refresh()
          } catch (e: any) {
            Alert.alert("실패", e?.message || "다시 모집에 실패했습니다")
          }
        },
      })
    }
    opts.push({
      text: "수정하기",
      onPress: () => router.push(`/group-buying/${post.id}/edit` as any),
    })
    opts.push({
      text: "공구 삭제",
      style: "destructive",
      onPress: () => {
        Alert.alert("삭제", "정말 삭제하시겠습니까?", [
          { text: "취소", style: "cancel" },
          {
            text: "삭제",
            style: "destructive",
            onPress: async () => {
              try {
                await deletePost(getSupabase(), post.id)
                router.back()
              } catch (e: any) {
                Alert.alert("실패", e?.message || "삭제에 실패했습니다")
              }
            },
          },
        ])
      },
    })
    opts.push({ text: "닫기", style: "cancel" })
    Alert.alert("호스트 메뉴", undefined, opts)
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
  if (!post) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Ionicons name={loadError ? "alert-circle-outline" : "cube-outline"} size={48} color={lightColors.ink500} />
        <Text style={{ color: lightColors.ink500, marginTop: 12 }}>
          {loadError ? "불러오지 못했습니다" : "공구를 찾을 수 없습니다"}
        </Text>
        {loadError ? (
          <Pressable
            onPress={() => { setLoadError(false); setLoading(true); setReloadKey((k) => k + 1) }}
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

  const isOwner = user?.id === post.user_id
  const images = post.images ?? []
  const status = STATUS[post.status]
  const minP = post.min_participants
  const maxP = post.max_participants ?? minP
  const curP = post.current_participants
  const fillPct = Math.min(100, Math.round((curP / Math.max(minP, 1)) * 100))
  const minMet = curP >= minP
  const discountPct =
    post.original_price && post.original_price > post.group_price
      ? Math.round(((post.original_price - post.group_price) / post.original_price) * 100)
      : 0

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>공동구매</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          {/* 위시리스트 (찜) — web 헤더 ❤️ */}
          <Pressable onPress={handleWish} hitSlop={8} style={styles.headerBtn}>
            <Ionicons
              name={wished ? "heart" : "heart-outline"}
              size={20}
              color={wished ? "#ef4444" : lightColors.ink900}
            />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="공유" onPress={handleShare} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="share-social-outline" size={20} color={lightColors.ink900} />
          </Pressable>
          {/* 액션 — 비작성자: 사이렌 신고 / 작성자·관리자: ⋮ 메뉴 */}
          {post && (
            <PostActionsMenu
              kind="group-buying"
              postId={post.id}
              authorId={post.user_id}
              editHref={`/group-buying/${post.id}/edit`}
              bumpable
              onDeleted={() => router.back()}
              onAction={() => {
                setPost((prev) => prev ? { ...prev, bumped_at: new Date().toISOString(), effective_at: new Date().toISOString() } as any : prev)
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
        {/* 이미지 */}
        {images.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))
              }}
            >
              {images.map((img, i) => (
                <MediaItem key={i} uri={img} style={{ width, aspectRatio: 1 }} />
              ))}
            </ScrollView>
            {images.length > 1 && (
              <View style={styles.indicator}>
                <Text style={styles.indicatorText}>{imageIndex + 1} / {images.length}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.placeholder, { width, aspectRatio: 1 }]}>
            <Ionicons name="image-outline" size={48} color={lightColors.ink300} />
          </View>
        )}

        {/* 본문 */}
        <View style={styles.body}>
          {/* 상태 + 마감 */}
          <View style={styles.topRow}>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
            <View style={styles.deadlineRow}>
              <Ionicons name="time-outline" size={12} color={lightColors.ink500} />
              <Text style={styles.deadlineText}>{deadlineText || formatDeadline(post.deadline)}</Text>
            </View>
          </View>

          {/* 제목 + 상품명 — 가격보다 먼저 (무엇을 파는지가 우선) */}
          <Text style={styles.title}>{post.title}</Text>
          {post.product_name && (
            <Text style={styles.productName}>{post.product_name}</Text>
          )}

          {/* 가격 — 로컬푸드 톤: 할인% · 원가(취소선) · 판매가 한 줄 인라인 */}
          <View style={styles.priceWrap}>
            {post.original_price && discountPct > 0 && (
              <>
                <Text style={styles.discountPct}>{discountPct}%</Text>
                <Text style={styles.originalPrice}>{post.original_price.toLocaleString()}원</Text>
              </>
            )}
            <Text style={styles.groupPrice}>{post.group_price.toLocaleString()}원</Text>
          </View>

          {/* 배송비 — 배송 전용이므로 항상 노출 */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing[2] }}>
            <Ionicons name="cube-outline" size={14} color={lightColors.ink500} />
            <Text style={{ fontSize: 13, color: lightColors.ink500 }}>배송비</Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: post.delivery_fee_mode === "free" ? "#10b981" : lightColors.ink900 }}>
              {post.delivery_fee_mode === "free" || !post.delivery_fee
                ? "무료배송"
                : post.delivery_fee_mode === "included"
                  ? "상품가 포함"
                  : `${(post.delivery_fee || 0).toLocaleString()}원 별도`}
            </Text>
          </View>

          {/* 진행률 */}
          <View style={styles.progressWrap}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>
                <Text style={{ fontWeight: "700", color: lightColors.ink900 }}>{curP}명</Text>
                {" "} / 최소 {minP}명{maxP > minP ? ` (최대 ${maxP}명)` : ""}
              </Text>
              <Text
                style={[styles.progressPct, { color: minMet ? "#16a34a" : lightColors.primary }]}
              >
                {minMet ? "달성!" : `${fillPct}%`}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${fillPct}%`, backgroundColor: minMet ? "#16a34a" : lightColors.primary },
                ]}
              />
            </View>
            {participants.length > 0 && (
              <Pressable
                onPress={() => setParticipantsOpen(true)}
                hitSlop={6}
                style={{ marginTop: 8, alignSelf: "flex-start" }}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 12, color: lightColors.primary, fontWeight: "600" }}>
                  참여자 {participants.length}명 보기 ›
                </Text>
              </Pressable>
            )}
          </View>

          {/* 메타 */}
          <Text style={styles.metaText}>
            조회 {post.views.toLocaleString()} · {relativeDate((post as any).effective_at ?? (post as any).bumped_at ?? post.created_at)}
          </Text>
        </View>

        {/* 설명 — 홈즈 톤(회색 박스 + 둥근 모서리) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>상세 설명</Text>
          <View style={styles.descriptionBox}>
            <Text style={styles.description}>{post.description}</Text>
          </View>
        </View>

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
            authorPlazaId={(post as any)?.plaza_id ?? null}
            title="작성자 카드"
            extra={
              hostStats && hostStats.total_count > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    gap: spacing[3],
                    paddingTop: spacing[2],
                    borderTopWidth: 1,
                    borderTopColor: lightColors.border,
                  }}
                >
                  <Text style={{ fontSize: 12, color: lightColors.ink700 }}>
                    성공 {hostStats.success_count}회
                  </Text>
                  <Text style={{ fontSize: 12, color: lightColors.ink700 }}>
                    취소 {hostStats.cancel_count}회
                  </Text>
                  {hostStats.success_pct != null && (
                    <Text style={{ fontSize: 12, color: lightColors.ink700 }}>
                      성공률 {hostStats.success_pct}%
                    </Text>
                  )}
                </View>
              ) : null
            }
          />
        )}
        <DetailLegalNotice variant="neutral" />
      </ScrollView>

      {/* 하단 sticky — 로컬푸드 패턴: 좌측 문의 + 우측 참여하기 */}
      <View style={styles.actionBar}>
        <Pressable onPress={handleChat} style={styles.iconAction} hitSlop={6}>
          <Ionicons name="chatbubble-outline" size={20} color={lightColors.ink900} />
          <Text style={styles.iconActionText}>문의</Text>
        </Pressable>
        {isOwner ? (
          <View style={[styles.mainBtn, { backgroundColor: lightColors.muted }]}>
            <Text style={[styles.mainBtnText, { color: lightColors.ink500 }]}>본인 공구</Text>
          </View>
        ) : (
          <Pressable
            onPress={openJoin}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.mainBtn,
              joined && { backgroundColor: "#dc2626" },
              (actionLoading || pressed) && { opacity: 0.85 },
              post.status !== "recruiting" && !joined && { backgroundColor: lightColors.muted },
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text
                style={[
                  styles.mainBtnText,
                  post.status !== "recruiting" && !joined && { color: lightColors.ink500 },
                ]}
              >
                {joined
                  ? "참여 취소"
                  : post.status !== "recruiting"
                  ? "모집 마감"
                  : "참여하기"}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {/* 참여자 모달 */}
      <Modal
        visible={participantsOpen}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setParticipantsOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setParticipantsOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>참여자 ({participants.length}명)</Text>
            <FlatList
              data={participants}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ padding: spacing[3] }}
              ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
              renderItem={({ item }) => (
                <View style={styles.participantRowFull}>
                  <View style={[styles.participantAvatar, { width: 36, height: 36 }]}>
                    {item.profile?.avatar_url ? (
                      <Image source={{ uri: item.profile.avatar_url }} cachePolicy="memory-disk" style={styles.avatarImg} />
                    ) : (
                      <Text style={[styles.participantLetter, { fontSize: 14 }]}>
                        {(item.profile?.nickname?.[0] ?? "?").toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.participantName}>{item.profile?.nickname ?? "이웃"}</Text>
                  <Text style={styles.participantTime}>{relativeDate(item.created_at)}</Text>
                </View>
              )}
            
              removeClippedSubviews={true}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={11}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 참여 폼 모달 */}
      <Modal
        visible={joinOpen}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setJoinOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setJoinOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>공구 참여</Text>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={0}
            >
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: screenHeight * 0.6 }} contentContainerStyle={{ padding: spacing[4] }}>
                <Text style={styles.formLabel}>수량</Text>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => setJoinForm((f) => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
                    style={styles.qtyBtn}
                  >
                    <Ionicons name="remove" size={18} color={lightColors.ink900} />
                  </Pressable>
                  <Text style={styles.qtyText}>{joinForm.quantity}</Text>
                  <Pressable
                    onPress={() => setJoinForm((f) => ({ ...f, quantity: f.quantity + 1 }))}
                    style={styles.qtyBtn}
                  >
                    <Ionicons name="add" size={18} color={lightColors.ink900} />
                  </Pressable>
                </View>

                {/* 수령 방법 토글 제거 — 배송 전용 */}

                {joinForm.receive_method === "delivery" && (
                  <>
                    <Text style={[styles.formLabel, { marginTop: spacing[3] }]}>수령인 이름 *</Text>
                    <TextInput
                      style={styles.input}
                      value={joinForm.recipient_name}
                      onChangeText={(v) => setJoinForm((f) => ({ ...f, recipient_name: v }))}
                      placeholder="홍길동"
                      placeholderTextColor={lightColors.ink500}
                    />
                    <Text style={[styles.formLabel, { marginTop: spacing[3] }]}>연락처 *</Text>
                    <TextInput
                      style={styles.input}
                      value={joinForm.recipient_phone}
                      onChangeText={(v) => setJoinForm((f) => ({ ...f, recipient_phone: v }))}
                      placeholder="010-0000-0000"
                      placeholderTextColor={lightColors.ink500}
                      keyboardType="phone-pad"
                    />
                    <Text style={[styles.formLabel, { marginTop: spacing[3] }]}>주소 *</Text>
                    <TextInput
                      style={styles.input}
                      value={joinForm.recipient_address}
                      onChangeText={(v) => setJoinForm((f) => ({ ...f, recipient_address: v }))}
                      placeholder="강원특별자치도 춘천시 ..."
                      placeholderTextColor={lightColors.ink500}
                    />
                    <Text style={[styles.formLabel, { marginTop: spacing[3] }]}>상세 주소</Text>
                    <TextInput
                      style={styles.input}
                      value={joinForm.recipient_address_detail}
                      onChangeText={(v) => setJoinForm((f) => ({ ...f, recipient_address_detail: v }))}
                      placeholder="동, 호수 등"
                      placeholderTextColor={lightColors.ink500}
                    />
                  </>
                )}

                <Pressable
                  onPress={submitJoin}
                  disabled={actionLoading}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    (actionLoading || pressed) && { opacity: 0.85 },
                  ]}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitText}>
                      {joinForm.quantity}개 참여하기 ·{" "}
                      {(post.group_price * joinForm.quantity).toLocaleString()}원
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
      {/* 신고 모달 */}
      {post && (
        <PostReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="group_buying"
          targetId={post.id}
        />
      )}
      {share.element}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: {
    flex: 1,
    backgroundColor: lightColors.background,
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
    borderBottomColor: lightColors.border,
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

  placeholder: {
    backgroundColor: lightColors.muted,
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
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[3],
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: "700" },
  deadlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  deadlineText: { fontSize: 12, color: lightColors.ink500 },

  priceWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    marginBottom: spacing[3],
    gap: 8,
  },
  discountPct: {
    fontSize: 16,
    fontWeight: "800",
    color: "#dc2626",
  },
  originalPrice: {
    fontSize: 13,
    color: lightColors.ink500,
    textDecorationLine: "line-through",
  },
  groupPrice: {
    fontSize: 28,
    fontWeight: "800",
    color: lightColors.ink900,
    letterSpacing: -0.5,
  },

  title: {
    fontSize: 20,
    fontWeight: "700",
    color: lightColors.ink900,
    lineHeight: 28,
    marginBottom: 4,
  },
  productName: {
    fontSize: 13,
    color: lightColors.ink500,
    marginBottom: spacing[3],
  },

  progressWrap: { marginVertical: spacing[3] },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: { fontSize: 12, color: lightColors.ink500 },
  progressPct: { fontSize: 12, fontWeight: "700" },
  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: lightColors.muted,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 999 },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  location: { fontSize: 13, color: lightColors.ink500 },
  metaText: { fontSize: 13, color: lightColors.ink500, marginTop: 8 },

  avatarImg: { width: "100%", height: "100%" },

  section: { padding: spacing[4] },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[3],
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  moreLink: { fontSize: 12, color: lightColors.primary, fontWeight: "500" },
  description: { fontSize: 14, lineHeight: 22, color: lightColors.ink900 },
  descriptionBox: {
    backgroundColor: lightColors.muted,
    padding: spacing[3],
    borderRadius: radius.md,
  },

  participantRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  participantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  participantLetter: { fontSize: 12, fontWeight: "700", color: lightColors.primary },

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
    backgroundColor: lightColors.background,
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
  },
  iconAction: {
    minWidth: 64,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  iconActionText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  mainBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: lightColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  mainBtnText: { fontSize: fontSize.md, fontWeight: "700", color: "#ffffff" },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing[4],
    maxHeight: "85%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightColors.border,
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },

  participantRowFull: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
  },
  participantName: { flex: 1, fontSize: 13, color: lightColors.ink900 },
  participantTime: { fontSize: 11, color: lightColors.ink500 },

  formLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.ink900,
    marginBottom: 6,
  },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },

  methodRow: { flexDirection: "row", gap: 8 },
  methodBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  methodText: { fontSize: 13, color: lightColors.ink900, fontWeight: "500" },

  input: {
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
  },

  submitBtn: {
    height: 48,
    backgroundColor: lightColors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[4],
  },
  submitText: { fontSize: fontSize.md, fontWeight: "700", color: "#ffffff" },
})
