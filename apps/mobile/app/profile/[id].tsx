/**
 * 공개 프로필 — 광장 web /profile/[id] (mode="other") 미러.
 *
 * 정독 매핑 (web 의 ProfileShell mode="other"):
 *   - 헤더 (← 닉네임 + 공유)
 *   - 커버 + 프로필 카드 (아바타, 닉네임, account_type 뱃지, 한 줄 소개)
 *   - 카운터 (게시글 / 팔로워 / 팔로잉) — ProfileCard 내부에서 처리
 *   - 액션 버튼 (팔로우 / 메시지) ← 본인이면 숨김
 *   - 후기 진입
 *   - 탭 (게시글 / 매물 — agent 만)
 *   - 탭별 lazy-load
 *
 * 채팅 RN 미이전 — 외부 웹뷰 fallback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useShareModal } from "@/components/mypage/ShareModal"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import {
  countFollowers,
  countFollowing,
  countFollowersInPlaza,
  countFollowingInPlaza,
  getProfile,
  getProfileCard,
  isFollowing,
  blockUser,
  unblockUser,
  isUserBlocked,
  listHighlights,
  listMyPosts,
  listMyProperties,
  listReviews,
  type ProfileHighlight,
  PUBLIC_PROFILE_COLUMNS,
  toggleFollow,
  type ProfileCardData,
  type ProfileRow,
  type ReviewEntry,
  type UnifiedPost,
} from "@gwangjang/features/profile"
import { startDirectChat } from "@gwangjang/features/chat"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"

import { ProfileCard } from "@/components/mypage/ProfileCard"
import { HighlightsRow } from "@/components/mypage/HighlightsRow"
import { StoryViewer } from "@/components/mypage/StoryViewer"
import { ProfileCover } from "@/components/mypage/ProfileCover"
import { ProfileTabs } from "@/components/mypage/ProfileTabs"
import { ProfileSidebar, type SidebarData, type BusinessInfo } from "@/components/mypage/ProfileSidebar"
import { PostListRow } from "@/components/mypage/PostListRow"
import { ReviewsModal } from "@/components/mypage/ReviewsModal"
import { FollowModal } from "@/components/mypage/FollowModal"
import type { ListCardKind } from "@/components/ListCardMenu"

// UnifiedPost.kind → ListCardKind 매핑 (snake/short → URL slug)
const UNIFIED_TO_CARD_KIND: Record<string, ListCardKind> = {
  property: "properties",
  secondhand: "secondhand",
  sharing: "sharing",
  group_buying: "group-buying",
  new_store: "new-store",
  local_food: "local-food",
  club: "clubs",
  clubs: "clubs",
  interior: "interior",
  moving: "moving",
  cleaning: "cleaning",
  repair: "repair",
  jobs: "jobs",
  board: "board",
}
import {
  resolveRole,
  ROLE_EXCLUDE_FROM_POSTS,
  type ProfileTabDef,
  type ProfileTabId,
} from "@/components/mypage/role-config"
import { useCurrentPlaza, buildShareUrl } from "@/lib/plaza"

export default function PublicProfileScreen() {
  const currentPlaza = useCurrentPlaza()
  const params = useLocalSearchParams<{ id: string; plaza?: string }>()
  const id = params.id
  // 🅲 플라자 컨텍스트 — URL ?plaza= 가 있으면 그 광장 plaza_profile 사용
  // (cross-plaza 글에서 작성자 프로필 클릭 시 글의 plaza_id 전달)
  // 없으면 현재 광장으로 fallback
  const profilePlaza = params.plaza || currentPlaza
  const isCrossPlazaView =
    !!params.plaza && !!currentPlaza && params.plaza !== currentPlaza
  // DEFAULT_PLAZA 로 사용 — overlay 와 follow 등 모두 profilePlaza 기준
  const DEFAULT_PLAZA = profilePlaza
  const share = useShareModal()
  const router = useRouter()
  const { user } = useAuth()

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [card, setCard] = useState<ProfileCardData | null>(null)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [loading, setLoading] = useState(true)
  const [followingMe, setFollowingMe] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)

  const [activeTab, setActiveTab] = useState<ProfileTabId>("posts")
  const [posts, setPosts] = useState<UnifiedPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [properties, setProperties] = useState<UnifiedPost[]>([])
  const [propsLoading, setPropsLoading] = useState(false)

  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [reviews, setReviews] = useState<ReviewEntry[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null)
  const [highlights, setHighlights] = useState<ProfileHighlight[]>([])
  const [storyIndex, setStoryIndex] = useState<number | null>(null)
  const [bizInfo, setBizInfo] = useState<BusinessInfo | null>(null)

  const isSelf = !!user && user.id === id
  const role = useMemo(
    () => resolveRole(profile?.account_type ?? null),
    [profile?.account_type],
  )
  // 역할별 탭 — role-config 의 tabs 그대로 + "게시글"(posts) + "정보"(info) 보정.
  // 웹 tabsForMode("other") 와 동일.
  const tabs: ProfileTabDef[] = useMemo(() => {
    const roleTabs = role.tabs
    const hasPosts = roleTabs.some((t) => t.id === "posts")
    const merged: ProfileTabDef[] = [
      ...roleTabs.map((t) =>
        t.id === "posts" ? { ...t, label: "게시글" } : t,
      ),
    ]
    if (!hasPosts) {
      merged.push({ id: "posts", label: "게시글", icon: "newspaper-outline" })
    }
    merged.push({
      id: "info",
      label: "정보",
      icon: "information-circle-outline",
    })
    return merged
  }, [role])

  const cardData: ProfileCardData | null = useMemo(() => {
    if (!card) return null
    // ProfileCard 는 followers/following count 를 ProfileCardData 에 포함시켜 받음
    return {
      ...card,
      followers_count: followers,
      following_count: following,
    } as any
  }, [card, followers, following])

  // ── 초기 로드 ───────────────────────────────────────
  useEffect(() => {
    if (!id) return
    const supabase = getSupabase()
    Promise.all([
      // 타인 프로필 — phone/email 등 민감 필드 제외
      getProfile(supabase, id, PUBLIC_PROFILE_COLUMNS),
      getProfileCard(supabase, id, DEFAULT_PLAZA),
      // 광장 격리 — 현재 광장 plaza_profile overlay
      DEFAULT_PLAZA
        ? supabase
            .from("plaza_profiles")
            .select(
              "nickname, avatar_url, bio, background_url, account_type, business_hours, specialties, service_areas, website, kakao_id, location",
            )
            .eq("user_id", id)
            .eq("plaza_id", DEFAULT_PLAZA)
            .maybeSingle()
            .then((r) => r.data)
            .catch(() => null)
        : Promise.resolve(null),
      countFollowersInPlaza(supabase, id, DEFAULT_PLAZA).catch(() => 0),
      countFollowingInPlaza(supabase, id, DEFAULT_PLAZA).catch(() => 0),
      user ? isFollowing(supabase, user.id, id).catch(() => false) : Promise.resolve(false),
      listHighlights(supabase, id, DEFAULT_PLAZA).catch(() => []),
    ])
      .then(([pRow, pCard, plazaProfile, fers, fing, isFol, hls]) => {
        // 🅲 광장 strict overlay — plaza_profile 있으면 그 값만 (fallback X)
        const pp: any = plazaProfile || {}
        const hasPP = !!plazaProfile
        const merged = pRow
          ? hasPP
            ? {
                ...pRow,
                nickname: pp.nickname ?? null,
                avatar_url: pp.avatar_url ?? null,
                cover_url: pp.background_url ?? null,
                bio: pp.bio ?? null,
                location: pp.location ?? null,
                account_type: pp.account_type ?? "user",
                business_hours: pp.business_hours ?? null,
                specialties: pp.specialties ?? null,
                service_areas: pp.service_areas ?? null,
                website: pp.website ?? null,
                kakao_id: pp.kakao_id ?? null,
              }
            : pRow
          : pRow
        setProfile(merged as any)
        setCard(pCard)
        setFollowers(fers)
        setFollowing(fing)
        setFollowingMe(isFol)
        setHighlights(hls as ProfileHighlight[])
      })
      .finally(() => setLoading(false))
  }, [id, user])

  // ── 사업자 정보 — account_type 이 사업자 계정일 때만 fetch ───
  const BIZ_ACCOUNT_TYPES = useMemo(
    () => new Set(["agent", "business", "producer", "interior", "moving", "cleaning", "repair"]),
    [],
  )
  useEffect(() => {
    if (!id || !profile?.account_type || !BIZ_ACCOUNT_TYPES.has(profile.account_type)) {
      setBizInfo(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await (getSupabase() as any)
          .from("account_type_requests")
          .select("business_name, business_number, registration_number, office_address, contact_phone, requested_type")
          .eq("user_id", id)
          .eq("status", "approved")
          .order("reviewed_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!cancelled && data && (data.business_name || data.business_number || data.office_address)) {
          setBizInfo(data as BusinessInfo)
        }
      } catch {
        // silent
      }
    })()
    return () => { cancelled = true }
  }, [id, profile?.account_type, BIZ_ACCOUNT_TYPES])

  // ── 탭 lazy-load (외부에서 호출 가능하도록 분리) ───────────
  const loadPosts = useCallback(async () => {
    if (!id) return
    const supabase = getSupabase()
    setPostsLoading(true)
    try {
      const includeProperties = role.type !== "agent"
      const data = await listMyPosts(supabase, id, {
        includeProperties,
        plazaId: DEFAULT_PLAZA,
      })
      setPosts(data)
    } finally {
      setPostsLoading(false)
    }
  }, [id, role.type, DEFAULT_PLAZA])

  const loadProperties = useCallback(async () => {
    if (!id) return
    const supabase = getSupabase()
    setPropsLoading(true)
    try {
      const raw = await listMyProperties(supabase, id, DEFAULT_PLAZA)
      const items: UnifiedPost[] = (raw as any[]).map((p) => ({
        id: String(p.id),
        kind: "property",
        kindLabel: "매물",
        title: p.title || "(제목 없음)",
        excerpt: p.description || p.district || null,
        created_at: p.created_at,
        href: `/property/${p.id}`,
        image: Array.isArray(p.images) ? p.images[0] ?? null : null,
      }))
      setProperties(items)
    } finally {
      setPropsLoading(false)
    }
  }, [id, DEFAULT_PLAZA])

  useEffect(() => {
    if (!id || !activeTab) return
    if (activeTab === "posts") loadPosts()
    else if (activeTab === "listings") loadProperties()
    // products/portfolio/services 는 posts 데이터를 재사용해 렌더 단계에서 필터
    else if (
      activeTab === "products" ||
      activeTab === "portfolio" ||
      activeTab === "services"
    ) {
      loadPosts()
    }
  }, [id, activeTab, role.type])

  // 첫 탭을 역할별 첫 항목으로 설정 (중개사→매물, 생산자→상품, 인테리어→포트폴리오 …)
  useEffect(() => {
    const first = role.tabs[0]?.id
    if (first) setActiveTab(first)
  }, [role.type])

  // ── 핸들러 ──────────────────────────────────────────
  async function handleFollow() {
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    if (isSelf || !id) return
    const prev = followingMe
    // optimistic
    setFollowingMe(!prev)
    setFollowers((c) => c + (!prev ? 1 : -1))
    setFollowBusy(true)
    try {
      const next = await toggleFollow(getSupabase(), {
        viewerId: user.id,
        targetId: id,
        isFollowing: prev,
        plazaId: DEFAULT_PLAZA,
      })
      setFollowingMe(next)
    } catch (e: any) {
      // rollback
      setFollowingMe(prev)
      setFollowers((c) => c + (prev ? 1 : -1))
      Alert.alert("처리 실패", e?.message ?? "권한이 없거나 네트워크 문제일 수 있습니다.")
    } finally {
      setFollowBusy(false)
    }
  }

  async function handleShare() {
    if (!profile) return
    share.open({ title: profile.nickname || "프로필",
        message: `${profile.nickname || "프로필"}\n${buildShareUrl("profile", profile.id)}` })
  }

  // 차단 상태 로드 (본인 프로필 제외)
  useEffect(() => {
    if (!user || !id || isSelf) {
      setIsBlocked(false)
      return
    }
    let cancelled = false
    isUserBlocked(getSupabase(), { viewerId: user.id, targetId: id })
      .then((b) => { if (!cancelled) setIsBlocked(b) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user?.id, id, isSelf])

  function handleBlockToggle() {
    if (!user || !profile || isSelf || blockBusy) return
    const nm = profile.nickname || "이 사용자"
    if (isBlocked) {
      Alert.alert("차단 해제", `${nm}님의 차단을 해제하시겠습니까?`, [
        { text: "취소", style: "cancel" },
        {
          text: "차단 해제",
          onPress: async () => {
            setBlockBusy(true)
            try {
              await unblockUser(getSupabase(), { viewerId: user.id, targetId: id })
              setIsBlocked(false)
            } catch (e: any) {
              Alert.alert("실패", e?.message || "다시 시도해 주세요")
            } finally {
              setBlockBusy(false)
            }
          },
        },
      ])
    } else {
      Alert.alert("사용자 차단", `${nm}님을 차단하시겠습니까?\n\n차단하면 서로의 글·채팅이 보이지 않습니다.`, [
        { text: "취소", style: "cancel" },
        {
          text: "차단",
          style: "destructive",
          onPress: async () => {
            setBlockBusy(true)
            try {
              await blockUser(getSupabase(), { viewerId: user.id, targetId: id })
              setIsBlocked(true)
            } catch (e: any) {
              Alert.alert("실패", e?.message || "다시 시도해 주세요")
            } finally {
              setBlockBusy(false)
            }
          },
        },
      ])
    }
  }

  const messagingRef = useRef(false)
  async function openMessage() {
    if (!profile) return
    if (!user) {
      Alert.alert("로그인이 필요합니다")
      return
    }
    if (isSelf) return
    if (messagingRef.current) return // 더블탭 방지 — 중복 DM 방 생성 차단
    messagingRef.current = true
    try {
      // 🅲 cross-plaza DM — receiver 의 광장 컨텍스트 전달 (profile 페이지 ?plaza= = profilePlaza).
      // 칩 표시 시 sender 쪽에선 plaza_id (receiver plaza), receiver 쪽에선 buyer_plaza_id (sender plaza) 가 상대 광장.
      const r = await startDirectChat(getSupabase(), {
        currentUserId: user.id,
        otherUserId: profile.id,
        plazaId: DEFAULT_PLAZA,
        targetPlazaId: profilePlaza,
      })
      if (!r.ok || !r.roomId) {
        Alert.alert("메시지 실패", r.error ?? "")
        return
      }
      router.push(`/chat/${r.roomId}` as any)
    } finally {
      messagingRef.current = false
    }
  }

  function openReviews() {
    setReviewsOpen(true)
    if (reviews.length > 0 || !id) return
    setReviewsLoading(true)
    listReviews(getSupabase(), id)
      .then(setReviews)
      .finally(() => setReviewsLoading(false))
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator color={lightColors.primary} />
      </SafeAreaView>
    )
  }
  if (!profile) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Ionicons name="person-outline" size={48} color={lightColors.ink500} />
        <Text style={{ color: lightColors.ink500, marginTop: 12 }}>
          프로필을 찾을 수 없습니다
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile.nickname || "프로필"}
        </Text>
        <View style={styles.headerRight}>
          {!isSelf && !!user && (
            <Pressable
              onPress={handleBlockToggle}
              hitSlop={8}
              style={styles.headerBtn}
              disabled={blockBusy}
              accessibilityLabel={isBlocked ? "차단 해제" : "사용자 차단"}
              accessibilityRole="button"
            >
              <Ionicons
                name={isBlocked ? "ban" : "ban-outline"}
                size={22}
                color={isBlocked ? "#ef4444" : lightColors.ink900}
              />
            </Pressable>
          )}
          <Pressable onPress={handleShare} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="share-outline" size={22} color={lightColors.ink900} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ProfileCover
          coverUrl={(profile as any).cover_url ?? null}
          role={role}
          editable={false}
        />
        {cardData && (
          <ProfileCard
            data={cardData}
            role={role}
            isAdmin={false}
            isSuperAdmin={false}
            onCounterPress={(kind) => {
              if (kind === "followers") setFollowModal("followers")
              else if (kind === "following") setFollowModal("following")
            }}
            onShare={isSelf ? handleShare : undefined}
          />
        )}

        {/* Action Buttons (other only)
            🅲 광장 격리 — cross-plaza 보기일 땐 팔로우 X (광장 간 미연동),
            대신 "다른 광장 멤버" 라벨 + 메시지 버튼만 노출 */}
        {!isSelf && (
          <>
            <View style={styles.actions}>
              {isCrossPlazaView ? (
                <Pressable
                  onPress={openMessage}
                  style={[styles.actionBtn, { backgroundColor: lightColors.primary }]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color="#ffffff"
                  />
                  <Text style={[styles.actionBtnText, { color: "#ffffff" }]}>
                    메시지
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleFollow}
                  disabled={followBusy}
                  style={[
                    styles.actionBtn,
                    followingMe
                      ? { backgroundColor: lightColors.muted }
                      : { backgroundColor: lightColors.primary },
                  ]}
                >
                  <Ionicons
                    name={followingMe ? "checkmark" : "person-add"}
                    size={16}
                    color={followingMe ? lightColors.ink900 : "#ffffff"}
                  />
                  <Text
                    style={[
                      styles.actionBtnText,
                      followingMe && { color: lightColors.ink900 },
                    ]}
                  >
                    {followBusy ? "..." : followingMe ? "팔로잉" : "팔로우"}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleShare}
                style={[styles.actionBtn, { backgroundColor: lightColors.muted }]}
              >
                <Ionicons
                  name="share-outline"
                  size={16}
                  color={lightColors.ink900}
                />
                <Text style={[styles.actionBtnText, { color: lightColors.ink900 }]}>
                  공유
                </Text>
              </Pressable>
            </View>
            {isCrossPlazaView ? (
              <View style={[styles.crossPlazaBadge, { marginTop: 8 }]}>
                <Ionicons name="information-circle" size={14} color={lightColors.primary} />
                <Text style={styles.crossPlazaText}>
                  이 사용자는{" "}
                  <Text style={{ fontWeight: "700" }}>
                    {plazaLabel(profilePlaza)}
                  </Text>{" "}
                  멤버입니다. 광장 간 팔로우는 지원되지 않아요.
                </Text>
              </View>
            ) : (
              <View style={[styles.actions, { marginTop: 8 }]}>
                <Pressable
                  onPress={openMessage}
                  style={[styles.actionBtn, { backgroundColor: lightColors.muted, flex: 1 }]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color={lightColors.ink900}
                  />
                  <Text style={[styles.actionBtnText, { color: lightColors.ink900 }]}>
                    메시지
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {/* 하이라이트 — 타인 프로필이라 mode="other" (빈 배열이면 자동 숨김) */}
        <HighlightsRow
          items={highlights}
          mode="other"
          onOpen={(_h, i) => setStoryIndex(i)}
        />

        {/* Tabs */}
        <ProfileTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === "posts" && (() => {
          // 역할 전용 kind 는 자기 탭(listings/products/portfolio/services)에 이미 노출 → 중복 제외
          const excluded = ROLE_EXCLUDE_FROM_POSTS[role.type] ?? []
          const generalPosts = posts.filter((p) => !excluded.includes(p.kind))
          return (
            <View style={styles.tabContent}>
              {postsLoading ? (
                <ActivityIndicator color={lightColors.primary} />
              ) : generalPosts.length === 0 ? (
                <EmptyHint label="아직 게시글이 없어요" />
              ) : (
                generalPosts.map((p) => {
                  const cardKind = UNIFIED_TO_CARD_KIND[p.kind]
                  return (
                    <PostListRow
                      key={p.id}
                      title={p.title}
                      excerpt={p.excerpt ?? null}
                      image={(p as any).image ?? null}
                      kindLabel={p.kindLabel}
                      onPress={() => openExternalRoute(router, p.href)}
                      menuKind={cardKind}
                      postId={p.id}
                      authorId={id}
                      onChanged={loadPosts}
                    />
                  )
                })
              )}
            </View>
          )
        })()}

        {activeTab === "listings" && (
          <View style={styles.tabContent}>
            {propsLoading ? (
              <ActivityIndicator color={lightColors.primary} />
            ) : properties.length === 0 ? (
              <EmptyHint label="등록된 매물이 없어요" />
            ) : (
              properties.map((p) => (
                <PostListRow
                  key={p.id}
                  title={p.title}
                  excerpt={p.excerpt ?? null}
                  image={(p as any).image ?? null}
                  kindLabel={p.kindLabel}
                  onPress={() => openExternalRoute(router, p.href)}
                  menuKind="properties"
                  postId={p.id}
                  authorId={id}
                  onChanged={loadProperties}
                />
              ))
            )}
          </View>
        )}

        {(activeTab === "products" ||
          activeTab === "portfolio" ||
          activeTab === "services") && (
          <View style={styles.tabContent}>
            {postsLoading ? (
              <ActivityIndicator color={lightColors.primary} />
            ) : (() => {
              // 역할별 kind 매칭 — mypage 의 PostsTab 필터와 동일
              const allowed: string[] =
                role.type === "business"
                  ? ["group_buying"]
                  : role.type === "producer"
                  ? ["local_food"]
                  : role.type === "interior"
                  ? ["interior"]
                  : role.type === "moving"
                  ? ["moving"]
                  : role.type === "cleaning"
                  ? ["cleaning"]
                  : role.type === "repair"
                  ? ["repair"]
                  : []
              const filtered = posts.filter((p) => allowed.includes(p.kind))
              const emptyLabel =
                activeTab === "products"
                  ? "등록된 상품이 없어요"
                  : activeTab === "portfolio"
                  ? "등록된 포트폴리오가 없어요"
                  : "등록된 서비스가 없어요"
              if (filtered.length === 0) {
                return <EmptyHint label={emptyLabel} />
              }
              return filtered.map((p) => {
                const cardKind = UNIFIED_TO_CARD_KIND[p.kind]
                return (
                  <PostListRow
                    key={p.id}
                    title={p.title}
                    excerpt={p.excerpt ?? null}
                    image={(p as any).image ?? null}
                    kindLabel={p.kindLabel}
                    onPress={() => openExternalRoute(router, p.href)}
                    menuKind={cardKind}
                    postId={p.id}
                    authorId={id}
                    onChanged={loadPosts}
                  />
                )
              })
            })()}
          </View>
        )}

        {activeTab === "info" && profile && (
          <View style={styles.tabContent}>
            <ProfileSidebar
              data={profileToSidebar(profile)}
              role={role}
              mode="other"
              businessInfo={bizInfo}
            />
          </View>
        )}
      </ScrollView>

      <ReviewsModal
        visible={reviewsOpen}
        trustScore={(card as any)?.trust_score ?? null}
        reviewCount={(card as any)?.review_count ?? null}
        reviews={reviews}
        loading={reviewsLoading}
        onClose={() => setReviewsOpen(false)}
      />
      <FollowModal
        visible={!!followModal}
        kind={followModal ?? "followers"}
        userId={id ?? null}
        onClose={() => setFollowModal(null)}
      />
      <StoryViewer
        visible={storyIndex !== null}
        items={highlights as any}
        startIndex={storyIndex ?? 0}
        authorName={profile?.nickname ?? null}
        authorAvatar={profile?.avatar_url ?? null}
        onClose={() => setStoryIndex(null)}
      />
      {share.element}
    </SafeAreaView>
  )
}

// plaza id → 한글 라벨 (cross-plaza 표시용)
const PLAZA_NAME_MAP: Record<string, string> = {
  chuncheon: "춘천광장",
  gangneung: "강릉광장",
}
function plazaLabel(id: string | null | undefined): string {
  if (!id) return ""
  return PLAZA_NAME_MAP[id] ?? id
}

function EmptyHint({ label }: { label: string }) {
  return (
    <View style={{ padding: spacing[4], alignItems: "center" }}>
      <Text style={{ color: lightColors.ink500, fontSize: fontSize.sm }}>{label}</Text>
    </View>
  )
}

function openExternalRoute(
  router: ReturnType<typeof useRouter>,
  href: string,
) {
  // 모든 도메인이 RN 라우트로 마이그레이션 완료 — expo-router 가 처리.
  router.push(href as any)
}

function profileToSidebar(profile: any): SidebarData {
  const p = profile as any
  return {
    bio: profile?.bio ?? null,
    business_hours: p?.business_hours ?? null,
    specialties: Array.isArray(p?.specialties) ? p.specialties : null,
    service_areas: Array.isArray(p?.service_areas) ? p.service_areas : null,
    response_rate: p?.response_rate ?? null,
    avg_response_minutes: p?.avg_response_minutes ?? null,
    completed_deals: p?.completed_deals ?? null,
    is_verified_phone: p?.is_verified_phone ?? null,
    is_verified_business: p?.is_verified_business ?? null,
    is_verified_license: p?.is_verified_license ?? null,
    phone: p?.phone ?? null,
    website: p?.website ?? null,
    kakao_id: p?.kakao_id ?? null,
    location: profile?.location ?? null,
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  headerBtn: { padding: 6 },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginLeft: 4,
  },
  headerRight: { flexDirection: "row" },

  crossPlazaBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: "rgba(59,130,246,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
  },
  crossPlazaText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    marginVertical: spacing[3],
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  actionBtnText: { color: "#ffffff", fontWeight: "600", fontSize: fontSize.sm },

  reviewsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: lightColors.border,
  },
  reviewsLabel: { fontSize: fontSize.sm, fontWeight: "500", color: lightColors.ink900 },

  tabContent: { paddingHorizontal: spacing[4], paddingTop: spacing[2], gap: 8 },
})
