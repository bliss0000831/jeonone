/**
 * 마이페이지 메인 탭 — 광장 web ProfileShell 풀 미러.
 *
 * 모든 탭 콘텐츠를 인라인 렌더 (sub-route 단축키 폐기).
 * 헤더 / Cover / Card / Highlights / Tabs / Tab content
 * + 햄버거 시트 / Reviews 모달 / Follow 모달 / Share API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, useLocalSearchParams } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import {
  countFollowers,
  countFollowing,
  countFollowersInPlaza,
  countFollowingInPlaza,
  getPointBalance,
  getProfile,
  getProfileCard,
  listFavorites,
  listHighlights,
  listMyPosts,
  listMyProperties,
  listReviews,
  updateProfile,
  type ProfileCardData,
  type ProfileHighlight,
  type ProfileRow,
  type ReviewEntry,
  type SavedItem,
  type UnifiedPost,
} from "@gwangjang/features/profile"
import { useAuth } from "@/lib/auth-context"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { buildShareUrl, useCurrentPlaza } from "@/lib/plaza"
import { ProfileCard } from "@/components/mypage/ProfileCard"
import { ProfileTabs } from "@/components/mypage/ProfileTabs"
import { HamburgerSheet } from "@/components/mypage/HamburgerSheet"
import { RegisterSheet } from "@/components/RegisterSheet"
import { HeaderActions } from "@/components/HeaderActions"
import { HighlightsRow } from "@/components/mypage/HighlightsRow"
import { PostListRow } from "@/components/mypage/PostListRow"
import type { ListCardKind } from "@/components/ListCardMenu"

// UnifiedPost.kind → ListCardKind (URL slug). 메뉴/공유/올리기 라우팅에 사용.
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
import { CategoryChips } from "@/components/mypage/CategoryChips"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { SkeletonMypage } from "@/components/Skeleton"
import { ReviewsModal } from "@/components/mypage/ReviewsModal"
import { FollowModal } from "@/components/mypage/FollowModal"
import { ShareModal } from "@/components/mypage/ShareModal"
import { ProfileSidebar, type SidebarData, type BusinessInfo } from "@/components/mypage/ProfileSidebar"
import { StoryViewer } from "@/components/mypage/StoryViewer"
import { useIsAdmin } from "@/lib/useIsAdmin"
import {
  INTERIOR_GROUP,
  POSTS_CATEGORIES_BY_ROLE,
  ROLE_EXCLUDE_FROM_POSTS,
  SAVED_CATEGORIES,
  resolveRole,
  tabsForSelf,
  type AccountType,
  type ProfileTabId,
} from "@/components/mypage/role-config"

export default function MyPageTab() {
  const styles = useThemedStyles(makeStyles)
  const { user, signOut } = useAuth()
  const plazaId = useCurrentPlaza()
  const router = useRouter()

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [card, setCard] = useState<ProfileCardData | null>(null)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [points, setPoints] = useState<number | null>(null)
  const [highlights, setHighlights] = useState<ProfileHighlight[]>([])
  const [storyIndex, setStoryIndex] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<ProfileTabId | null>(null)

  // URL 쿼리 ?tab=saved → 찜 탭 자동 활성 (web 1:1 — UserMenu 의 "찜 목록" 클릭)
  const params = useLocalSearchParams<{ tab?: string }>()
  useEffect(() => {
    if (params.tab && params.tab !== activeTab) {
      setActiveTab(params.tab as ProfileTabId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab])

  // Tab data
  const [posts, setPosts] = useState<UnifiedPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsCategory, setPostsCategory] = useState("all")
  const [properties, setProperties] = useState<UnifiedPost[]>([])
  const [propsLoading, setPropsLoading] = useState(false)
  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [savedCategory, setSavedCategory] = useState("all")
  const [reviews, setReviews] = useState<ReviewEntry[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)

  // 사업자 정보
  const [bizInfo, setBizInfo] = useState<BusinessInfo | null>(null)

  // Modals
  const [menuOpen, setMenuOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  const [unreadNotif, setUnreadNotif] = useState(0)
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  // 글 메뉴 (올리기/수정/삭제 등) 동작 후 리스트 강제 재로드 — version bump.
  const [reloadVersion, setReloadVersion] = useState(0)
  const reloadList = () => setReloadVersion((v) => v + 1)

  // 안 읽은 알림 카운트 — 🅲 광장 격리
  useEffect(() => {
    if (!user) return
    ;(async () => {
      let q: any = getSupabase()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null)
      if (plazaId) q = q.eq("plaza_id", plazaId)
      const { count } = await q
      setUnreadNotif(count ?? 0)
    })()
  }, [user, plazaId])

  // 사업자 정보 조회 — account_type 이 사업자 유형일 때만
  useEffect(() => {
    if (!profile?.id || !profile.account_type || profile.account_type === "user" || profile.account_type === "individual") {
      setBizInfo(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data } = await (getSupabase() as any)
          .from("account_type_requests")
          .select("business_name, business_number, registration_number, office_address, contact_phone, requested_type")
          .eq("user_id", profile.id)
          .eq("status", "approved")
          .order("reviewed_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (alive && data && (data.business_name || data.business_number || data.office_address)) {
          setBizInfo(data as BusinessInfo)
        } else if (alive) {
          setBizInfo(null)
        }
      } catch {}
    })()
    return () => { alive = false }
  }, [profile?.id, profile?.account_type])

  const role = useMemo(
    () => resolveRole(profile?.account_type ?? null),
    [profile?.account_type],
  )
  const tabs = useMemo(() => tabsForSelf(role), [role])
  const isAdmin = useIsAdmin()

  // 🅲 광장 격리 — 캐시 키 광장별 + v2 (이전 raw-pRow 캐시 무효화)
  const myCacheKey = user?.id && plazaId ? `mypage:cache:v2:${user.id}:${plazaId}` : null

  // 광장 전환 시 이전 데이터 즉시 초기화
  const prevPlazaRef = useRef(plazaId)
  useEffect(() => {
    if (prevPlazaRef.current === plazaId) return
    prevPlazaRef.current = plazaId
    setProfile(null)
    setCard(null)
    setFollowers(0)
    setFollowing(0)
    setPoints(null)
    setHighlights([])
    setPosts([])
    setProperties([])
    setSavedItems([])
    setReviews([])
    setLoading(true)
  }, [plazaId])

  // 1) 초기 데이터
  const fetchAll = useCallback(async () => {
    if (!user) return
    try {
      const supabase = getSupabase()
      // 광장 통합 프로필: global profiles + plaza_profiles account_type만
      const [pRow, pCard, ppAccountType, fers, fing, balance, hl] =
        await Promise.all([
          getProfile(supabase, user.id),
          getProfileCard(supabase, user.id, plazaId),
          plazaId
            ? (supabase as any)
                .from("plaza_profiles")
                .select("account_type")
                .eq("user_id", user.id)
                .eq("plaza_id", plazaId)
                .maybeSingle()
                .then((r: any) => r.data?.account_type ?? null)
                .catch(() => null)
            : Promise.resolve(null),
          countFollowersInPlaza(supabase, user.id, plazaId).catch(() => 0),
          countFollowingInPlaza(supabase, user.id, plazaId).catch(() => 0),
          getPointBalance(supabase, user.id, plazaId).catch(() => null),
          listHighlights(supabase, user.id, plazaId).catch(() => []),
        ])
      const mergedProfile = pRow
        ? { ...pRow, account_type: ppAccountType ?? "user" }
        : pRow
      setProfile(mergedProfile)
      setCard(pCard)
      setFollowers(fers)
      setFollowing(fing)
      setPoints(balance)
      setHighlights(hl)
      // 캐시 저장 — 광장 격리 위해 mergedProfile (strict overlay 결과) 저장
      // 이전엔 raw pRow 저장해서 다른 광장 데이터가 잠깐 보였음
      if (myCacheKey) {
        AsyncStorage.setItem(
          myCacheKey,
          JSON.stringify({
            pRow: mergedProfile,
            pCard,
            fers,
            fing,
            balance,
            hl,
            ts: Date.now(),
          }),
        ).catch(() => {})
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user, plazaId, myCacheKey])

  // 마운트 시 캐시 즉시 hydrate — spinner 없이 바로 보이게 (백그라운드 fresh fetch)
  useEffect(() => {
    if (!myCacheKey) return
    let cancelled = false
    AsyncStorage.getItem(myCacheKey)
      .then((raw) => {
        if (cancelled || !raw) return
        try {
          const c = JSON.parse(raw)
          if (c.pRow) setProfile(c.pRow)
          if (c.pCard) setCard(c.pCard)
          if (typeof c.fers === "number") setFollowers(c.fers)
          if (typeof c.fing === "number") setFollowing(c.fing)
          if (c.balance != null) setPoints(c.balance)
          if (Array.isArray(c.hl)) setHighlights(c.hl)
          setLoading(false)
        } catch {}
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [myCacheKey])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // 첫 탭 활성화
  useEffect(() => {
    if (!activeTab && tabs.length > 0) setActiveTab(tabs[0].id)
  }, [tabs, activeTab])

  // 2) 탭별 lazy-load
  useEffect(() => {
    if (!user || !activeTab) return
    let cancelled = false
    const supabase = getSupabase()

    async function load() {
      if (cancelled || !user) return
      switch (activeTab) {
        case "posts": {
          // 광장 web 동작: agent 가 아닌 모든 역할은 properties 도 합산
          // (매물도 "내 글" 에 표시). agent 는 매물 탭이 별도라 제외.
          const includeProperties = role.type !== "agent"
          setPostsLoading(true)
          try {
            const data = await listMyPosts(supabase, user.id, { includeProperties, plazaId })
            if (!cancelled) setPosts(data)
          } finally {
            if (!cancelled) setPostsLoading(false)
          }
          break
        }
        case "listings": {
          setPropsLoading(true)
          try {
            const raw = await listMyProperties(supabase, user.id, plazaId)
            // PostListRow 호환 포맷으로 변환
            const items: UnifiedPost[] = (raw as any[]).map((p) => ({
              id: String(p.id),
              kind: "property",
              kindLabel: "매물",
              title: p.title || "(제목 없음)",
              excerpt: p.description || p.district || null,
              // 올리기 반영 — effective_at 우선 (= COALESCE(bumped_at, created_at))
              created_at: (p as any).effective_at ?? (p as any).bumped_at ?? p.created_at,
              href: `/property/${p.id}`,
              image: Array.isArray(p.images) ? p.images[0] ?? null : null,
            }))
            if (!cancelled) setProperties(items)
          } finally {
            if (!cancelled) setPropsLoading(false)
          }
          break
        }
        case "saved": {
          setSavedLoading(true)
          try {
            const data = await listFavorites(supabase, user.id, plazaId)
            if (!cancelled) setSavedItems(data)
          } finally {
            if (!cancelled) setSavedLoading(false)
          }
          break
        }
        case "products":
        case "portfolio":
        case "services": {
          // 역할 전용 탭 — listMyPosts 결과 재활용 (필터는 렌더 단계에서)
          setPostsLoading(true)
          try {
            const data = await listMyPosts(supabase, user.id, { plazaId })
            if (!cancelled) setPosts(data)
          } finally {
            if (!cancelled) setPostsLoading(false)
          }
          break
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user, activeTab, role.type, reloadVersion])

  // ── Handlers ──────────────────────────────────────

  function openReviews() {
    setReviewsOpen(true)
    if (reviews.length > 0 || !user) return
    setReviewsLoading(true)
    listReviews(getSupabase(), user.id)
      .then(setReviews)
      .finally(() => setReviewsLoading(false))
  }

  function handleShare() {
    setShareOpen(true)
  }

  async function pickAndUpload(kind: "avatar" | "cover") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다")
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: kind === "avatar" ? [1, 1] : [16, 7],
      quality: 0.85,
    })
    if (res.canceled || !res.assets?.[0]) return
    const asset = res.assets[0]

    try {
      // 5MB 제한 (web edit 1:1)
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        Alert.alert("파일 크기는 5MB 이하여야 합니다")
        return
      }
      const fd = new FormData()
      // 확장자 추론 → mime (HEIC/JPEG)
      const ext = (asset.uri.split(".").pop() ?? "jpg").toLowerCase()
      const mime =
        ext === "png" ? "image/png" :
        ext === "webp" ? "image/webp" :
        ext === "heic" ? "image/heic" :
        ext === "heif" ? "image/heif" :
        "image/jpeg"
      fd.append("file", {
        uri: asset.uri,
        name: `${kind}.${ext === "png" || ext === "webp" || ext === "heic" || ext === "heif" ? ext : "jpg"}`,
        type: mime,
      } as any)
      // ALLOWED_FOLDERS: avatar/profile (cover 는 profile 폴더로 — 동일 user-related)
      fd.append("folder", kind === "avatar" ? "avatar" : "profile")
      // web 1:1: /api/upload (R2 + WebP 변환 + 리사이즈)
      const upRes = await gwangjangFetch("/api/upload", {
        method: "POST",
        body: fd,
      })
      const data = await upRes.json().catch(() => ({}))
      if (!upRes.ok) {
        throw new Error(data?.error || "업로드 실패")
      }
      const url = data.url
      if (!url) throw new Error("업로드 실패 — URL 없음")
      if (!user) return
      // 광장 격리 — plaza_profiles 에 광장별 아바타/배경 저장
      const supabase = getSupabase()
      if (plazaId) {
        const ppPayload: Record<string, any> = {
          user_id: user.id,
          plaza_id: plazaId,
          is_active: true,
        }
        if (kind === "avatar") ppPayload.avatar_url = url
        else ppPayload.background_url = url
        await supabase
          .from("plaza_profiles")
          .upsert(ppPayload, { onConflict: "user_id,plaza_id" })
      }
      // 동시에 global profiles 도 업데이트 (없는 광장에서도 fallback 으로 표시)
      await updateProfile(supabase, user.id, {
        [kind === "avatar" ? "avatar_url" : "cover_url"]: url,
      })
      setProfile((p) => (p ? { ...p, [kind === "avatar" ? "avatar_url" : "cover_url"]: url } : p))
      setCard((c) => (c ? { ...c, [kind === "avatar" ? "avatar_url" : "cover_url"]: url } : c))
    } catch (e: any) {
      Alert.alert("업로드 실패", e?.message || "다시 시도해주세요")
    }
  }

  function onLogout() {
    Alert.alert("로그아웃", "정말 로그아웃 하시겠어요?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          await signOut()
          router.replace("/(tabs)" as any)
        },
      },
    ])
  }

  // ── Render ────────────────────────────────────────

  // 비로그인 — 로그인 유도 화면
  if (!user) {
    return (
      <SafeAreaView style={styles.loading} edges={["top"]}>
        <Ionicons name="person-circle-outline" size={64} color={lightColors.ink300} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: lightColors.ink900, marginTop: 16 }}>
          로그인이 필요해요
        </Text>
        <Text style={{ fontSize: 13, color: lightColors.ink500, marginTop: 6, textAlign: "center", paddingHorizontal: 32 }}>
          마이페이지를 이용하려면 로그인 해주세요
        </Text>
        <Pressable
          onPress={() => router.push("/auth/login")}
          style={{
            marginTop: 20,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: lightColors.primary,
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>
            로그인/회원가입 하기
          </Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <SkeletonMypage />
      </SafeAreaView>
    )
  }

  if (!profile || !card) {
    return (
      <SafeAreaView style={styles.loading} edges={["top"]}>
        <Text style={{ color: lightColors.ink500 }}>프로필을 불러오지 못했습니다</Text>
      </SafeAreaView>
    )
  }

  // 카드 데이터에 실시간 카운터 반영
  const cardWithLive: ProfileCardData = {
    ...card,
    followersCount: followers,
    followingCount: following,
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            style={styles.pointBadge}
            onPress={() => router.push("/mypage/points")}
            hitSlop={6}
          >
            <View style={styles.pointBadgeIcon}>
              <Text style={styles.pointBadgeIconText}>P</Text>
            </View>
            <Text style={styles.pointBadgeValue}>
              {points != null ? points.toLocaleString() : "0"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.headerTitle}>마이프로필</Text>
        <HeaderActions />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              fetchAll()
            }}
          />
        }
      >
        <ProfileCard
          data={cardWithLive}
          role={role}
          isAdmin={isAdmin}
          onCounterPress={(kind) => {
            if (kind === "followers") setFollowModal("followers")
            else if (kind === "following") setFollowModal("following")
            else if (kind === "trust") openReviews()
          }}
          onEditProfile={() => router.push("/mypage/edit")}
          onShare={handleShare}
          onAvatarPress={() => pickAndUpload("avatar")}
        />

        <HighlightsRow
          items={highlights}
          onAdd={() => router.push("/mypage/highlights")}
          onOpen={(_h, i) => setStoryIndex(i)}
        />

        {activeTab && (
          <ProfileTabs
            tabs={tabs}
            active={activeTab}
            counts={{
              posts: posts.length,
              listings: properties.length,
              saved: savedItems.length,
            }}
            onChange={setActiveTab}
          />
        )}

        <View style={styles.tabContent}>
          {activeTab === "posts" && (
            <PostsTab
              items={posts}
              loading={postsLoading}
              role={role.type}
              category={postsCategory}
              onCategoryChange={setPostsCategory}
              onOpen={(href) => openExternalRoute(router, href)}
              userId={user?.id}
              onChanged={reloadList}
            />
          )}
          {activeTab === "listings" && (
            <ListingsTab
              items={properties}
              loading={propsLoading}
              onOpen={(href) => openExternalRoute(router, href)}
              userId={user?.id}
              onChanged={reloadList}
            />
          )}
          {(activeTab === "products" ||
            activeTab === "portfolio" ||
            activeTab === "services") && (
            <PostsTab
              items={posts.filter((p) =>
                role.type === "business"
                  ? p.kind === "group_buying"
                  : role.type === "producer"
                  ? p.kind === "local_food"
                  : INTERIOR_GROUP.includes(p.kind),
              )}
              loading={postsLoading}
              role={role.type}
              hideChips
              onOpen={(href) => openExternalRoute(router, href)}
              userId={user?.id}
              onChanged={reloadList}
            />
          )}
          {activeTab === "saved" && (
            <SavedTab
              items={savedItems}
              loading={savedLoading}
              category={savedCategory}
              onCategoryChange={setSavedCategory}
              onOpen={(href) => openExternalRoute(router, href)}
            />
          )}
          {activeTab === "info" && (
            <ProfileSidebar
              data={profileToSidebar(profile)}
              role={role}
              mode="self"
              onEdit={() => router.push("/mypage/edit")}
              businessInfo={bizInfo}
            />
          )}
        </View>

        <View style={{ height: spacing[8] }} />
      </ScrollView>

      <HamburgerSheet
        visible={menuOpen}
        nickname={profile.nickname}
        pointsBalance={points}
        onClose={() => setMenuOpen(false)}
        onProfile={() => router.push("/mypage/edit")}
        onPoints={() => router.push("/mypage/points")}
        onCompose={() => setRegisterOpen(true)}
        onMypage={() => {}}
        onSaved={() => setActiveTab("saved")}
        onChat={() => router.push("/(tabs)/chat")}
        onOrders={() => router.push("/mypage/orders")}
        onSales={() => router.push("/mypage/sales")}
        onSubscription={() => router.push("/mypage/subscription")}
        onSettlement={() => router.push("/mypage/settlement")}
        onVerify={() => router.push("/mypage/verify")}
        onAccountUpgrade={() => router.push("/mypage/account-upgrade")}
        onSettings={() => router.push("/mypage/settings")}
        onLogout={onLogout}
      />

      <ReviewsModal
        visible={reviewsOpen}
        trustScore={profile.trust_score ?? null}
        reviewCount={profile.review_count ?? null}
        reviews={reviews}
        loading={reviewsLoading}
        onClose={() => setReviewsOpen(false)}
      />

      <FollowModal
        visible={followModal !== null}
        kind={followModal ?? "followers"}
        userId={user?.id ?? null}
        onClose={() => setFollowModal(null)}
      />

      <RegisterSheet
        visible={registerOpen}
        onClose={() => setRegisterOpen(false)}
      />

      <ShareModal
        visible={shareOpen}
        url={buildShareUrl("profile", user?.id ?? "")}
        title={`${profile?.nickname || "프로필"} · 광장`}
        message={profile?.bio || `${role.label} 프로필`}
        onClose={() => setShareOpen(false)}
      />

      <StoryViewer
        visible={storyIndex !== null}
        items={highlights as any}
        startIndex={storyIndex ?? 0}
        authorName={profile?.nickname ?? null}
        authorAvatar={profile?.avatar_url ?? null}
        canDelete
        onDelete={async (hid) => {
          const supabase = getSupabase()
          await supabase.from("profile_highlights").delete().eq("id", hid)
          setHighlights((arr) => arr.filter((x) => x.id !== hid))
        }}
        onClose={() => setStoryIndex(null)}
      />
    </SafeAreaView>
  )
}

// ─── Tab content components ────────────────────────────

function PostsTab({
  items,
  loading,
  role,
  category,
  onCategoryChange,
  hideChips,
  onOpen,
  userId,
  onChanged,
}: {
  items: UnifiedPost[]
  loading: boolean
  role: AccountType
  category?: string
  onCategoryChange?: (c: string) => void
  hideChips?: boolean
  onOpen: (href: string) => void
  userId?: string
  onChanged?: () => void
}) {
  // 광장 web 동작: 역할 전용 콘텐츠는 "내 글" 에서 제외
  // (각자의 role tab 에 이미 표시됨 — 중복 방지).
  const exclude = ROLE_EXCLUDE_FROM_POSTS[role] ?? []
  const filtered = exclude.length > 0
    ? items.filter((p) => !exclude.includes(p.kind))
    : items

  // 역할별 칩 매트릭스
  const categories = POSTS_CATEGORIES_BY_ROLE[role] ?? POSTS_CATEGORIES_BY_ROLE.user
  const showChips = !hideChips && categories.length > 1

  // 카테고리별 카운트 (필터 후 기준)
  const counts: Record<string, number> = { all: filtered.length }
  for (const p of filtered) counts[p.kind] = (counts[p.kind] || 0) + 1

  const activeCategory = category ?? "all"
  const visible =
    activeCategory === "all"
      ? filtered
      : filtered.filter((p) => p.kind === activeCategory)

  return (
    <View>
      {showChips && onCategoryChange && (
        <CategoryChips
          items={categories.map((c) => ({ ...c, count: counts[c.key] }))}
          active={activeCategory}
          onChange={onCategoryChange}
        />
      )}
      <View style={{ marginTop: spacing[2] }}>
        {loading && filtered.length === 0 ? (
          <ActivityIndicator style={{ marginVertical: 40 }} color={lightColors.primary} />
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>
            {showChips && activeCategory !== "all"
              ? "해당 카테고리에 작성한 글이 없습니다"
              : "작성한 게시물이 없습니다"}
          </Text>
        ) : (
          visible.map((p) => (
            <PostListRow
              key={`${p.kind}-${p.id}`}
              title={p.title}
              excerpt={p.excerpt}
              image={p.image}
              kindLabel={p.kindLabel}
              metaRight={new Date(p.created_at).toLocaleDateString("ko-KR")}
              onPress={() => onOpen(p.href)}
              menuKind={UNIFIED_TO_CARD_KIND[p.kind]}
              postId={p.id}
              authorId={userId ?? null}
              onChanged={onChanged}
            />
          ))
        )}
      </View>
    </View>
  )
}

function ListingsTab({
  items,
  loading,
  onOpen,
  userId,
  onChanged,
}: {
  items: UnifiedPost[]
  loading: boolean
  onOpen: (href: string) => void
  userId?: string
  onChanged?: () => void
}) {
  if (loading && items.length === 0) {
    return <ActivityIndicator style={{ marginVertical: 40 }} color={lightColors.primary} />
  }
  if (items.length === 0) {
    return <Text style={styles.empty}>등록된 매물이 없습니다</Text>
  }
  return (
    <View style={{ marginTop: spacing[2] }}>
      {items.map((p) => (
        <PostListRow
          key={p.id}
          title={p.title}
          excerpt={p.excerpt}
          image={p.image}
          kindLabel={p.kindLabel}
          highlight
          metaRight={new Date(p.created_at).toLocaleDateString("ko-KR")}
          onPress={() => onOpen(p.href)}
          menuKind={UNIFIED_TO_CARD_KIND[p.kind] ?? "properties"}
          postId={p.id}
          authorId={userId ?? null}
          onChanged={onChanged}
        />
      ))}
    </View>
  )
}

function SavedTab({
  items,
  loading,
  category,
  onCategoryChange,
  onOpen,
}: {
  items: SavedItem[]
  loading: boolean
  category: string
  onCategoryChange: (c: string) => void
  onOpen: (href: string) => void
}) {
  // 카운트 (홈즈는 interior/moving/cleaning/repair 합산)
  const counts: Record<string, number> = { all: items.length }
  for (const it of items) {
    const bucket = INTERIOR_GROUP.includes(it.kind) ? "interior" : it.kind
    counts[bucket] = (counts[bucket] || 0) + 1
  }
  const filtered =
    category === "all"
      ? items
      : category === "interior"
      ? items.filter((i) => INTERIOR_GROUP.includes(i.kind))
      : items.filter((i) => i.kind === category)

  return (
    <View>
      <CategoryChips
        items={SAVED_CATEGORIES.map((c) => ({ ...c, count: counts[c.key] }))}
        active={category}
        onChange={onCategoryChange}
      />
      <View style={{ marginTop: spacing[2] }}>
        {loading && items.length === 0 ? (
          <ActivityIndicator style={{ marginVertical: 40 }} color={lightColors.primary} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>찜한 항목이 없습니다</Text>
        ) : (
          filtered.map((it) => (
            <PostListRow
              key={`${it.kind}-${it.id}`}
              title={it.title}
              excerpt={it.meta}
              image={it.image}
              kindLabel={it.kindLabel}
              metaRight={new Date(it.created_at).toLocaleDateString("ko-KR") + " 찜"}
              onPress={() => onOpen(it.href)}
            />
          ))
        )}
      </View>
    </View>
  )
}

/**
 * ProfileRow → SidebarData 매핑.
 * profiles 테이블의 추가 컬럼 (business_hours, specialties 등) 은 ProfileRow
 * 타입에 없을 수 있으므로 옵션 체이닝.
 */
function profileToSidebar(profile: ProfileRow): SidebarData {
  const p = profile as any
  return {
    bio: profile.bio ?? null,
    business_hours: p.business_hours ?? null,
    specialties: Array.isArray(p.specialties) ? p.specialties : null,
    service_areas: Array.isArray(p.service_areas) ? p.service_areas : null,
    response_rate: p.response_rate ?? null,
    avg_response_minutes: p.avg_response_minutes ?? null,
    completed_deals: p.completed_deals ?? null,
    is_verified_phone: p.is_verified_phone ?? null,
    is_verified_business: p.is_verified_business ?? null,
    is_verified_license: p.is_verified_license ?? null,
    phone: p.phone ?? null,
    website: p.website ?? null,
    kakao_id: p.kakao_id ?? null,
    location: profile.location ?? null,
  }
}

function openExternalRoute(router: ReturnType<typeof useRouter>, href: string) {
  // 모든 도메인이 RN 라우트로 마이그레이션 완료 — expo-router 가 처리.
  router.push(href as any)
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f6f0" },
  loading: {
    flex: 1,
    backgroundColor: "#f7f6f0",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    height: 52,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    justifyContent: "flex-end",
  },
  // 홈 헤더 1:1 — 알림 + 아바타 + 햄버거
  headerBtn: { padding: 6, position: "relative" },
  notifBadge: {
    position: "absolute", top: 2, right: 2,
    minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 999,
    backgroundColor: "#ef4444",
    alignItems: "center", justifyContent: "center",
  },
  notifBadgeText: { color: "#ffffff", fontSize: 9, fontWeight: "700" },
  avatarBtn: {
    width: 32, height: 32, borderRadius: 999,
    overflow: "hidden",
    borderWidth: 2, borderColor: "rgba(244,63,94,0.6)",
    backgroundColor: colors.muted,
    alignItems: "center", justifyContent: "center",
    marginLeft: 6,
  },
  avatarImg: { width: "100%", height: "100%" },
  headerTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
    pointerEvents: "none",
  },
  iconBtn: {
    padding: 6,
    borderRadius: 18,
  },
  pointBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#fef3c7",
    borderRadius: 999,
  },
  pointBadgeIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  pointBadgeIconText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 11,
  },
  pointBadgeValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink900,
    paddingRight: 4,
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#fda4af",
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink900,
  },
  tabContent: {
    minHeight: 200,
    backgroundColor: colors.background,
    paddingHorizontal: spacing[4],
  },
  empty: {
    textAlign: "center",
    color: colors.ink500,
    paddingVertical: spacing[6],
  },
  infoRow: {
    flexDirection: "row",
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    width: 80,
    fontSize: fontSize.sm,
    color: colors.ink500,
  },
  infoValue: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.ink900,
  },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
