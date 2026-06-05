/**
 * 게시판 — 광장 web /board 1:1 미러.
 *
 * 동기화 (web):
 *   - board_categories 테이블 동적 로드 (마을 사랑방/맛집추천/생활정보/일상공유/질문답변)
 *   - board_posts 테이블에서 plaza_id + category_id + region 필터 (status 필터 X)
 *   - 지역 chips: 사용자 sub_region 우선 (전체광장/춘천/홍천/...)
 *   - is_pinned 우선, created_at desc 정렬
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Image } from "expo-image"
import { isVideoUrl } from "@/components/MediaItem"
import { VideoThumbnailImage } from "@/components/VideoThumbnailImage"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { getSupabase, gwangjangFetch } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { canRegisterDomain } from "@/lib/permissions"
import { HeaderActions } from "@/components/HeaderActions"
import { useCurrentPlaza } from "@/lib/plaza"

interface BoardCategory {
  id: string
  name: string
  slug: string
  icon?: string
}

interface BoardPost {
  id: string
  category_id: string
  title: string
  content: string
  author_name: string
  view_count: number
  like_count: number
  comment_count: number
  created_at: string
  is_pinned: boolean
  thumbnail_url: string | null
  images: string[] | null
  region?: string | null
}

interface HotPost {
  id: string
  title: string
  author_name?: string | null
  like_count?: number
  thumbnail_url?: string | null
  images?: string[] | null
}

interface Ranker {
  user_id: string
  nickname?: string | null
  avatar_url?: string | null
  posts: number
  comments: number
  likes: number
  score: number
}

/** 카테고리 slug → 아이콘 매핑 */
const CAT_ICON: Record<string, { name: string; color: string }> = {
  free: { name: "chatbubbles-outline", color: "#6366f1" },
  food: { name: "restaurant-outline", color: "#f97316" },
  life: { name: "bulb-outline", color: "#eab308" },
  daily: { name: "camera-outline", color: "#ec4899" },
  qna: { name: "help-circle-outline", color: "#0ea5e9" },
}

export default function BoardListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const styles = useThemedStyles(makeStyles)

  const [categories, setCategories] = useState<BoardCategory[]>([])
  const [selectedCat, setSelectedCat] = useState<string>("free") // slug
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userRegion, setUserRegion] = useState<string>("")
  const [regionFilter, setRegionFilter] = useState<string>("") // ""=내 지역, "all"=전체
  const [hotPosts, setHotPosts] = useState<HotPost[]>([])
  const [rankers, setRankers] = useState<Ranker[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [regionOptions, setRegionOptions] = useState<string[]>(["전체 광장"])

  // 광장 coverage → 지역 chips 동적 구성
  useEffect(() => {
    if (!plazaId) return
    ;(async () => {
      const { data } = await getSupabase()
        .from("plazas")
        .select("coverage")
        .eq("id", plazaId)
        .maybeSingle()
      const cov = (data as any)?.coverage
      if (Array.isArray(cov) && cov.length > 0) {
        setRegionOptions(["전체 광장", ...cov])
      }
    })()
  }, [plazaId])

  // 등록 권한 — account_type + admin 여부
  const [accountType, setAccountType] = useState<string>("user")
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    if (!user) { setAccountType("user"); setIsAdmin(false); return }
    let cancelled = false
    ;(async () => {
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase.from("profiles").select("account_type, role").eq("id", user.id).maybeSingle(),
        plazaId
          ? supabase.from("plaza_profiles").select("account_type").eq("user_id", user.id).eq("plaza_id", plazaId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      if (cancelled) return
      const data: any = profRes.data || {}
      const pp: any = ppRes?.data || {}
      const t = (pp.account_type ?? data.account_type) as string | undefined
      const r = data.role as string | undefined
      setAccountType(t || "user")
      setIsAdmin(r === "admin" || r === "superadmin")
    })()
    return () => { cancelled = true }
  }, [user, plazaId])
  const canRegister = user ? canRegisterDomain("/board", accountType, { isAdmin }) : false

  // 1) 카테고리 로드 (board_categories 테이블, plaza 필터)
  useEffect(() => {
    ;(async () => {
      let q = getSupabase()
        .from("board_categories")
        .select("*")
        .order("order_index", { ascending: true })
      if (plazaId) q = q.eq("plaza_id", plazaId)
      const { data, error } = await q
      if (!error && data && data.length > 0) {
        setCategories(data as BoardCategory[])
      } else {
        // 테이블 없거나 비어있을 때 fallback — web 기본값
        setCategories([
          { id: "free", slug: "free", name: "마을 사랑방" },
          { id: "food", slug: "food", name: "맛집추천" },
          { id: "life", slug: "life", name: "생활정보" },
          { id: "daily", slug: "daily", name: "일상공유" },
          { id: "qna", slug: "qna", name: "질문답변" },
        ])
      }
    })()
  }, [plazaId])

  // 2) 사용자 sub_region 자동 채움 — 🅲 광장 격리: plaza_profiles 우선
  useEffect(() => {
    if (!user) return
    ;(async () => {
      const supabase = getSupabase()
      const [profRes, ppRes] = await Promise.all([
        supabase.from("profiles").select("sub_region").eq("id", user.id).maybeSingle(),
        plazaId
          ? supabase.from("plaza_profiles").select("sub_region")
              .eq("user_id", user.id).eq("plaza_id", plazaId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])
      const pp: any = ppRes?.data
      const sr = pp?.sub_region ?? (profRes.data as any)?.sub_region
      if (sr) setUserRegion(sr)
    })()
  }, [user, plazaId])

  // 3) 게시글 로드
  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (categories.length === 0) {
        setPosts([])
        return
      }
      const supabase = getSupabase()
      const cat = categories.find((c) => c.slug === selectedCat)
      // BoardPost 인터페이스가 쓰는 컬럼만 — content/body 등 본문 컬럼을 줄여 리스트 페이로드 축소.
      const BOARD_COLS =
        "id, category_id, title, content, author_name, view_count, like_count, comment_count, created_at, is_pinned, thumbnail_url, images, region"
      let q: any = supabase
        .from("board_posts")
        .select(BOARD_COLS)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
      if (plazaId) q = q.eq("plaza_id", plazaId)
      if (cat?.id && cat.id !== cat.slug) q = q.eq("category_id", cat.id)
      // 지역 필터 (web 1:1) — region 컬럼 미존재 시 무시
      const effectiveRegion =
        regionFilter === "all" ? null : (regionFilter || userRegion)
      if (effectiveRegion) {
        q = q.or(`region.eq.${effectiveRegion},region.is.null`)
      }
      const { data, error } = await q
      if (error) {
        console.warn("[board] load error:", error.message)
        setPosts([])
        return
      }
      let filtered = (data ?? []) as BoardPost[]
      if (search) {
        const s = search.toLowerCase()
        filtered = filtered.filter(
          (p) =>
            (p.title ?? "").toLowerCase().includes(s) ||
            (p.content ?? "").toLowerCase().includes(s),
        )
      }
      setPosts(filtered)
    } catch (e: any) {
      console.warn("[board] load exception:", e?.message)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [categories, selectedCat, plazaId, regionFilter, userRegion, search])

  useEffect(() => {
    load()
  }, [load])

  // useFocusEffect 는 mount 시에도 fire — useEffect(load) 와 중복 호출 방지.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      load()
    }, [load]),
  )

  // 4) 핫글 + 수다왕 stats — supabase 직접 쿼리 (web /api/board/stats 1:1 미러)
  //    HTTP 우회로 CORS / cache / plaza 헤더 이슈 모두 회피
  useEffect(() => {
    if (user === undefined) return
    let alive = true
    setStatsLoading(true)
    ;(async () => {
      try {
        const supabase = getSupabase()
        const effectiveRegion =
          regionFilter === "all" ? null : (regionFilter || userRegion || null)

        // 핫글 — board_posts 좋아요 desc, 3개
        let hotQ: any = supabase
          .from("board_posts")
          .select(
            "id, title, content, author_name, author_avatar, user_id, like_count, comment_count, view_count, images, thumbnail_url, created_at, status",
          )
          .or("status.is.null,status.eq.active")
          .order("like_count", { ascending: false })
          .order("view_count", { ascending: false })
          .limit(3)
        if (plazaId) hotQ = hotQ.eq("plaza_id", plazaId)
        if (effectiveRegion) {
          hotQ = hotQ.or(`region.eq.${effectiveRegion},region.is.null`)
        }

        // 수다왕 RPC — web 과 동일
        const rankerP = supabase.rpc("board_stats_aggregate", {
          p_plaza_id: plazaId || null,
          p_region: effectiveRegion,
          p_days: 30,
        })

        const [hotRes, rankerRes] = await Promise.all([hotQ, rankerP])

        if (!alive) return

        // 핫글 — 좋아요 0인 글 제외 (web 동일)
        const hot = (hotRes.data || []).filter((p: any) => (p.like_count ?? 0) > 0)
        setHotPosts(hot)

        // 수다왕 — 점수 계산 + 상위 5
        const SCORE = { POST: 10, COMMENT: 3, LIKE: 1 }
        const rankerRows = Array.isArray(rankerRes.data) ? rankerRes.data : []
        const ranks = rankerRows
          .map((r: any) => ({
            user_id: r.user_id,
            nickname: r.nickname,
            avatar_url: r.avatar_url,
            posts: r.posts || 0,
            comments: r.comments || 0,
            likes: r.likes_received || 0,
            score:
              (r.posts || 0) * SCORE.POST +
              (r.comments || 0) * SCORE.COMMENT +
              (r.likes_received || 0) * SCORE.LIKE,
          }))
          .filter((s: any) => s.score > 0)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 5)
        setRankers(ranks)
      } catch (e: any) {
        console.warn("[board] stats direct query failed:", e?.message)
      } finally {
        if (alive) setStatsLoading(false)
      }
    })()
    return () => { alive = false }
  }, [userRegion, regionFilter, user, plazaId])

  /** 이미지 URL 만 반환 (동영상 URL 제외) */
  function getImageThumb(p: BoardPost): string | null {
    if (p.thumbnail_url) return p.thumbnail_url
    if (p.images && p.images.length > 0) {
      return p.images.find((u) => !isVideoUrl(u)) ?? null
    }
    return null
  }

  /** 첫 번째 동영상 URL 반환 */
  function getFirstVideo(p: BoardPost): string | null {
    return p.images?.find((u) => isVideoUrl(u)) ?? null
  }

  function hasVideo(p: BoardPost): boolean {
    return !!(p.images && p.images.some((u) => isVideoUrl(u)))
  }

  const renderPost = useCallback(({ item: p }: { item: BoardPost }) => {
    const thumb = getImageThumb(p)
    return (
      <Pressable
        onPress={() => router.push(`/board/${p.id}` as any)}
        style={({ pressed }) => [
          styles.postRow,
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.postTitle} numberOfLines={1}>
            {p.is_pinned && "📌 "}{p.title}
          </Text>
          <Text style={styles.postContent} numberOfLines={2}>
            {p.content}
          </Text>
          <View style={styles.postMeta}>
            <Text style={styles.postMetaText}>{p.author_name ?? "익명"}</Text>
            <Text style={styles.postMetaDot}>·</Text>
            <Text style={styles.postMetaText}>
              {new Date(p.created_at).toLocaleDateString("ko-KR", {
                month: "2-digit", day: "2-digit",
              })}
            </Text>
            <Text style={styles.postMetaDot}>·</Text>
            <Ionicons name="eye-outline" size={11} color={lightColors.ink500} />
            <Text style={styles.postMetaText}>{p.view_count ?? 0}</Text>
            <Text style={styles.postMetaDot}>·</Text>
            <Ionicons name="heart" size={11} color="#f43f5e" />
            <Text style={styles.postMetaText}>{p.like_count ?? 0}</Text>
            <Text style={styles.postMetaDot}>·</Text>
            <Ionicons name="chatbubble-outline" size={11} color={lightColors.ink500} />
            <Text style={styles.postMetaText}>{p.comment_count ?? 0}</Text>
          </View>
        </View>
        {thumb ? (
          <View>
            <Image source={{ uri: thumb }} cachePolicy="memory-disk" contentFit="cover" style={styles.postThumb} />
            {hasVideo(p) && (
              <View style={styles.videobadge}>
                <Ionicons name="play" size={10} color="#fff" />
              </View>
            )}
          </View>
        ) : hasVideo(p) ? (
          <View style={[styles.postThumb, styles.videoThumbFallback]}>
            <Ionicons name="videocam" size={22} color="#fff" />
          </View>
        ) : null}
        <View style={styles.postCommentBox}>
          <Text style={styles.postCommentCount}>{p.comment_count ?? 0}</Text>
          <Text style={styles.postCommentLabel}>댓글</Text>
        </View>
      </Pressable>
    )
  }, [router, styles])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle}>게시판</Text>
        <HeaderActions />
      </View>

      {/* 핫글 TOP 3 + 수다왕 — 가로 스크롤 카드 (web 1:1) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsRow}
        style={{ flexGrow: 0 }}
      >
        {/* 핫글 TOP 3 */}
        <View style={[styles.statsCard, styles.hotCard]}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderEmoji}>🔥</Text>
            <Text style={styles.statsHeaderTitle}>
              {userRegion ? `${userRegion} ` : ""}핫글 TOP 3
            </Text>
          </View>
          {statsLoading ? (
            <View style={styles.statsLoadingBox}>
              <ActivityIndicator size="small" color={lightColors.ink500} />
            </View>
          ) : hotPosts.length === 0 ? (
            <Text style={styles.statsEmpty}>아직 좋아요가 없어요</Text>
          ) : (
            hotPosts.map((p, idx) => {
              const hotImageThumb = p.thumbnail_url || p.images?.find((u: string) => !isVideoUrl(u)) || null
              const hotVideoUrl = !hotImageThumb ? (p.images?.find((u: string) => isVideoUrl(u)) ?? null) : null
              const rankBgs = ["#fbbf24", "#94a3b8", "#d97706"]
              const rowHighlight = idx === 0
                ? { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: 10 }
                : {}
              return (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/board/${p.id}` as any)}
                  style={({ pressed }) => [styles.hotRow, rowHighlight, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.hotRank, { backgroundColor: rankBgs[idx] }]}>
                    <Text style={styles.hotRankText}>{idx + 1}</Text>
                  </View>
                  {hotImageThumb ? (
                    <Image source={{ uri: hotImageThumb }} cachePolicy="memory-disk" contentFit="cover" style={styles.hotThumb} />
                  ) : hotVideoUrl ? (
                    <VideoThumbnailImage uri={hotVideoUrl} style={styles.hotThumb} />
                  ) : (
                    <View style={[styles.hotThumb, styles.hotThumbFallback]}>
                      <Ionicons name="chatbubble-outline" size={14} color={lightColors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.hotTitle, idx === 0 && { fontSize: 14 }]} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <Text style={styles.hotMeta} numberOfLines={1}>
                        {p.author_name || "익명"}
                      </Text>
                      <Ionicons name="heart" size={10} color="#f43f5e" />
                      <Text style={[styles.hotMeta, { color: "#f43f5e", fontWeight: "700" }]}>{p.like_count ?? 0}</Text>
                    </View>
                  </View>
                </Pressable>
              )
            })
          )}
        </View>

        {/* 수다왕 */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderEmoji}>👑</Text>
            <Text style={styles.statsHeaderTitle}>
              {userRegion ? `${userRegion} ` : ""}수다왕
            </Text>
            <Text style={styles.statsHeaderRule}>글×10·댓×3·♥×1</Text>
          </View>
          {statsLoading ? (
            <View style={styles.statsLoadingBox}>
              <ActivityIndicator size="small" color={lightColors.ink500} />
            </View>
          ) : rankers.length === 0 ? (
            <Text style={styles.statsEmpty}>활동 기록이 없어요</Text>
          ) : (
            rankers.map((r, idx) => {
              const medalIcons = ["trophy", "medal", "ribbon"] as const
              const medalColors = ["#f59e0b", "#94a3b8", "#fb923c"]
              const rowBgs = ["#fef3c7", "#f1f5f9", "#ffedd5"]
              const rowBorders = ["#fde68a", "#e2e8f0", "#fed7aa"]
              return (
                <Pressable
                  key={r.user_id}
                  onPress={() => router.push(`/profile/${r.user_id}` as any)}
                  style={({ pressed }) => [
                    styles.rankerRow,
                    {
                      backgroundColor: idx < 3 ? rowBgs[idx] : "#f8fafc",
                      borderColor: idx < 3 ? rowBorders[idx] : lightColors.border,
                    },
                    idx === 0 && styles.rankerRowFirst,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={styles.rankerMedal}>
                    {idx < 3 ? (
                      <Ionicons
                        name={medalIcons[idx] as any}
                        size={idx === 0 ? 16 : 14}
                        color={medalColors[idx]}
                      />
                    ) : (
                      <Text style={styles.rankerMedalNum}>{idx + 1}</Text>
                    )}
                  </View>
                  {r.avatar_url ? (
                    <Image source={{ uri: r.avatar_url }} cachePolicy="memory-disk" style={styles.rankerAvatar} />
                  ) : (
                    <View style={[styles.rankerAvatar, styles.rankerAvatarFallback]}>
                      <Text style={styles.rankerAvatarChar}>
                        {r.nickname?.[0] || "?"}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rankerName, idx === 0 && { fontSize: 14 }]} numberOfLines={1}>
                      {idx === 0 ? "👑 " : ""}{r.nickname || "익명"}
                    </Text>
                    <Text style={styles.rankerMeta} numberOfLines={1}>
                      글 {r.posts} · 댓 {r.comments} · ♥ {r.likes}
                    </Text>
                  </View>
                  <View style={styles.rankerScorePill}>
                    <Text style={styles.rankerScore}>{r.score}</Text>
                    <Text style={styles.rankerScoreUnit}>점</Text>
                  </View>
                </Pressable>
              )
            })
          )}
        </View>
      </ScrollView>

      {/* 검색바 */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={lightColors.ink500} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="제목, 내용 검색"
            placeholderTextColor={lightColors.ink500}
            style={styles.searchInput}
          />
        </View>
        {canRegister ? (
          <Pressable
            onPress={() => router.push("/board/create" as any)}
            hitSlop={6}
            style={styles.heroAddBtn}
          >
            <Ionicons name="add-circle" size={32} color={lightColors.primary} />
          </Pressable>
        ) : null}
      </View>

      {/* 카테고리 chips — 고정 height wrap, 정확한 chip height 36 */}
      {categories.length > 0 && (
        <View style={styles.chipRowWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={{ flexGrow: 0 }}
          >
            {categories.map((c) => {
              const on = selectedCat === c.slug
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedCat(c.slug)}
                  style={[styles.chip, on && styles.chipActive]}
                >
                  {CAT_ICON[c.slug] && (
                    <Ionicons
                      name={CAT_ICON[c.slug].name as any}
                      size={14}
                      color={on ? "#ffffff" : CAT_ICON[c.slug].color}
                    />
                  )}
                  <Text style={[styles.chipText, on && styles.chipTextActive]}>
                    {c.name}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      )}

      {/* 지역 chips — 고정 height wrap */}
      <View style={styles.chipRowSmallWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowSmall}
          style={{ flexGrow: 0 }}
        >
          {regionOptions.map((r) => {
            const value = r === "전체 광장" ? "all" : r
            const on =
              (regionFilter === "all" && value === "all") ||
              regionFilter === value ||
              (regionFilter === "" && value === userRegion)
            return (
              <Pressable
                key={r}
                onPress={() => setRegionFilter(value)}
                style={[styles.chipSmall, on && styles.chipSmallActive]}
              >
                <Text style={[styles.chipSmallText, on && styles.chipSmallTextActive]}>
                  {r}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* 게시글 목록 */}
      <FlatList
        data={loading ? [] : posts}
        keyExtractor={(p) => p.id}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        contentContainerStyle={{ padding: spacing[3], gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await load()
              setRefreshing(false)
            }}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <View style={styles.skeletonThumb} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={[styles.skeletonLine, { width: "70%" }]} />
                    <View style={[styles.skeletonLine, { width: "40%" }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={40} color={lightColors.primary} />
              </View>
              <Text style={styles.emptyTitle}>아직 마을 소식이 없어요</Text>
              <Text style={styles.emptySub}>첫 이웃이 되어{"\n"}우리 동네 이야기를 남겨보세요!</Text>
              {user ? (
                <Pressable style={styles.emptyCta} onPress={() => router.push("/board/create" as any)}>
                  <Ionicons name="add-circle" size={22} color="#fff" />
                  <Text style={styles.emptyCtaText}>첫 글 쓰기</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        renderItem={renderPost}
      />
    </SafeAreaView>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // 로딩 스켈레톤
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing[3],
    backgroundColor: colors.card,
    borderRadius: radius.md,
  },
  skeletonThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.muted,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    height: 52, paddingHorizontal: spacing[3],
  },
  headerTitle: { flex: 1, fontSize: fontSize.md, fontWeight: "700", color: colors.ink900, lineHeight: 24, marginLeft: 4 },

  // 핫글/수다왕 가로 스크롤 카드 (web 1:1)
  statsRow: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    gap: 10,
  },
  statsCard: {
    width: 320,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 8,
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  statsHeaderEmoji: { fontSize: 16 },
  statsHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink900,
    flex: 1,
  },
  statsHeaderRule: {
    fontSize: 12,
    color: colors.ink500,
  },
  statsLoadingBox: { paddingVertical: 16, alignItems: "center" },
  statsEmpty: {
    fontSize: 12,
    color: colors.ink500,
    textAlign: "center",
    paddingVertical: 16,
  },

  // Hot row
  hotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  hotRank: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: "center", justifyContent: "center",
  },
  hotRankText: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
  hotThumb: {
    width: 36, height: 36, borderRadius: 6,
    backgroundColor: colors.muted,
  },
  hotThumbFallback: {
    backgroundColor: colors.primary + "1A",
    alignItems: "center", justifyContent: "center",
  },
  hotTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink900,
  },
  hotMeta: {
    fontSize: 13,
    color: colors.ink500,
    marginTop: 2,
  },

  // Ranker row
  rankerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  rankerMedal: {
    width: 20,
    alignItems: "center", justifyContent: "center",
  },
  rankerMedalNum: { fontSize: 13, fontWeight: "700", color: colors.ink500 },
  rankerRowFirst: {
    borderWidth: 1.5,
    borderColor: "#fbbf24",
  },
  rankerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.muted,
  },
  rankerAvatarFallback: {
    backgroundColor: colors.primary + "1A",
    alignItems: "center", justifyContent: "center",
  },
  rankerAvatarChar: {
    fontSize: 13, fontWeight: "700",
    color: colors.primary,
  },
  rankerName: {
    fontSize: 13, fontWeight: "600",
    color: colors.ink900,
  },
  rankerMeta: {
    fontSize: 12,
    color: colors.ink500,
    marginTop: 2,
  },
  rankerScorePill: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 2,
  },
  rankerScore: {
    fontSize: 14,
    fontWeight: "800",
    color: "#059669",
  },
  rankerScoreUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
  },

  searchBarWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: spacing[3], paddingTop: spacing[3],
  },
  searchBar: {
    flex: 1, height: 40,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink900, padding: 0 },
  heroAddBtn: { justifyContent: "center", alignItems: "center", height: 40 },

  // 카테고리 chips wrap — 고정 height (chip 36 + 8*2 = 52)
  chipRowWrap: {
    height: 52,
    backgroundColor: colors.background,
  },
  chipRow: {
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    gap: 6,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  chipActive: { backgroundColor: colors.ink900 },
  chipText: {
    fontSize: 13, color: colors.ink700, fontWeight: "500",
    lineHeight: 16, includeFontPadding: false, textAlignVertical: "center",
  } as any,
  chipTextActive: { color: "#ffffff", fontWeight: "700" },

  // 지역 chips wrap — 고정 height (chip 36 + 6*2 = 48)
  chipRowSmallWrap: {
    height: 48,
    backgroundColor: colors.background,
  },
  chipRowSmall: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    gap: 6,
    alignItems: "center",
  },
  chipSmall: {
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSmallActive: {
    backgroundColor: colors.primary + "14",
    borderColor: colors.primary,
  },
  chipSmallText: {
    fontSize: 12, color: colors.ink700,
    lineHeight: 14, includeFontPadding: false, textAlignVertical: "center",
  } as any,
  chipSmallTextActive: { color: colors.primary, fontWeight: "700" },

  center: { paddingVertical: 60, alignItems: "center" },
  empty: { paddingVertical: 56, alignItems: "center", gap: 6 },
  emptyText: { fontSize: 13, color: colors.ink500 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary + "1A", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink900, textAlign: "center" },
  emptySub: { fontSize: 14, color: colors.ink500, textAlign: "center", lineHeight: 21, marginTop: 2 },
  emptyCta: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999, marginTop: 16 },
  emptyCtaText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  postRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    gap: 10,
    alignItems: "center",
  },
  postTitle: { fontSize: 14, fontWeight: "700", color: colors.ink900 },
  postContent: { fontSize: 14, color: colors.ink700 },
  postMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  postMetaText: { fontSize: 13, color: colors.ink500 },
  postMetaDot: { fontSize: 13, color: colors.ink500 },
  postThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.muted },
  videobadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoThumbFallback: {
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  postCommentBox: { alignItems: "center", justifyContent: "center", minWidth: 36 },
  postCommentCount: { fontSize: 16, fontWeight: "700", color: colors.ink900 },
  postCommentLabel: { fontSize: 12, color: colors.ink500 },
  // 핫글 카드 — 약간 골드 그라데이션 테두리
  hotCard: {
    borderColor: "#fde68a",
  },
})
}

const styles = makeStyles(lightColors)
