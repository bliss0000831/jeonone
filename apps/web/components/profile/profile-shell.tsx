"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, MoreVertical, Shield } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { useSiteBranding } from "@/components/site-branding-client"
import { Button } from "@/components/ui/button"
import { HeaderActions } from "@/components/header-actions"
import { PointCoin } from "@/components/point-coin"
import { PropertyCard } from "@/components/property-card"
import { ServiceCard, type ServicePost } from "@/components/service-card"
import { ShareSheet } from "@/components/detail/share-sheet"
import { dbToProperty, type DbProperty, type Review } from "@/types/app"
import { cn } from "@/lib/utils"

import { MyPointsBalance } from "@/components/my-points-balance"

import { ProfileCard, type ProfileCardData } from "./profile-card"
import { ProfileHighlights, type Highlight } from "./profile-highlights"
import { StoryViewer } from "./story-viewer"
import { ProfileSidebar, type SidebarData } from "./profile-sidebar"
import { getBusinessInfo, type BusinessInfo } from "@/lib/services/business-info"
import { ProfileTabs } from "./profile-tabs"
import { FollowListModal, type FollowListKind } from "./follow-list-modal"
import { ReviewsModal } from "./reviews-modal"
import {
  resolveRole,
  tabsForMode,
  type ProfileTabId,
  type AccountType,
} from "./role-config"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────
interface ProfileRow extends SidebarData {
  id: string
  nickname: string | null
  phone: string | null
  avatar_url: string | null
  cover_url: string | null
  bio: string | null
  location: string | null
  website: string | null
  kakao_id: string | null
  created_at: string
  account_type: string | null
  role: string | null
  trust_score: number | null
  review_count: number | null
  posts_public?: boolean | null
}

/** 통합 게시물 아이템 — posts 탭에서 모든 내 글을 한 줄씩 표시 */
interface UnifiedPost {
  id: string
  kind: string
  kindLabel: string
  title: string
  excerpt: string | null
  created_at: string
  href: string
  image?: string | null
}

/** 찜 탭 통합 아이템 */
type SavedKind =
  | "property"
  | "board"
  | "local-food"
  | "group-buying"
  | "club"
  | "interior"
  | "sharing"
  | "new-store"
  | "moving"
  | "cleaning"
  | "repair"
interface SavedItem {
  id: string
  kind: SavedKind
  kindLabel: string
  title: string
  subtitle?: string | null
  image?: string | null
  href: string
  created_at: string // 찜한 시각
}

interface ProfileShellProps {
  userId: string
  mode: "self" | "other"
  currentUserId: string | null
  initialProfile?: ProfileRow | null
}

const SERVICE_TABLE: Partial<Record<AccountType, string>> = {
  interior: "interior_posts",
  moving: "moving_posts",
  cleaning: "cleaning_posts",
  repair: "repair_posts",
}

/**
 * 게시물 카운트 & 통합 리스트 대상 테이블.
 * user_id 컬럼을 가진 게시물류 테이블만 열거.
 * 주의: `properties` 는 "내 매물" 탭이 별도로 존재하므로 여기서 제외한다.
 */
const POSTS_SOURCES: Array<{
  table: string
  kind: string
  kindLabel: string
  /** 상세 페이지 링크 prefix (`${prefix}${id}`) */
  hrefPrefix: string
  imageField?: string
  /** select 컬럼 오버라이드 (해당 테이블에 content 컬럼이 없는 경우 등) */
  cols?: string
}> = [
  // 전원일기 핵심 도메인 — 농기구(중고거래) · 일손(구인구직). content 컬럼 없음 → description 만 select.
  { table: "secondhand_posts",   kind: "secondhand",   kindLabel: "농기구",   hrefPrefix: "/secondhand/",   imageField: "images", cols: "id, title, description, images, created_at, status" },
  { table: "jobs_posts",         kind: "jobs",         kindLabel: "일손",     hrefPrefix: "/jobs/",         imageField: "images", cols: "id, title, description, images, created_at, status" },
  { table: "board_posts",        kind: "board",        kindLabel: "게시판",   hrefPrefix: "/board/",        imageField: "images" },
  { table: "sharing_posts",      kind: "sharing",      kindLabel: "나눔",     hrefPrefix: "/sharing/",      imageField: "images" },
  { table: "group_buying_posts", kind: "group-buying", kindLabel: "공동구매", hrefPrefix: "/group-buying/", imageField: "images" },
  { table: "new_store_posts",    kind: "new-store",    kindLabel: "신장개업", hrefPrefix: "/new-store/",    imageField: "images" },
  { table: "local_food",         kind: "local-food",   kindLabel: "로컬푸드", hrefPrefix: "/local-food/",   imageField: "images" },
  { table: "clubs",              kind: "club",         kindLabel: "모임",     hrefPrefix: "/clubs/",        imageField: "images" },
  { table: "interior_posts",     kind: "interior",     kindLabel: "인테리어", hrefPrefix: "/interior/",     imageField: "images" },
  { table: "moving_posts",       kind: "moving",       kindLabel: "이사",     hrefPrefix: "/moving/",       imageField: "images" },
  { table: "cleaning_posts",     kind: "cleaning",     kindLabel: "청소",     hrefPrefix: "/cleaning/",     imageField: "images" },
  { table: "repair_posts",       kind: "repair",       kindLabel: "수리",     hrefPrefix: "/repair/",       imageField: "images" },
]

// ─── Main ─────────────────────────────────────────────────
export function ProfileShell({
  userId,
  mode,
  currentUserId,
  initialProfile,
}: ProfileShellProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { name: plazaBrandName } = useSiteBranding()
  // 멀티-광장 격리 — 모든 콘텐츠 쿼리에 plaza_id 필터 자동 주입
  const plaza = useMemo(() => getCurrentPlazaClient(), [])
  const withPlaza = useMemo(
    () => (q: any) => (plaza ? q.eq("plaza_id", plaza) : q),
    [plaza],
  )

  const [profile, setProfile] = useState<ProfileRow | null>(initialProfile ?? null)
  const [loading, setLoading] = useState(!initialProfile)

  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null)

  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [properties, setProperties] = useState<DbProperty[]>([])
  const [favorites, setFavorites] = useState<DbProperty[]>([])
  const [servicePosts, setServicePosts] = useState<ServicePost[]>([])
  const [reviews, setReviews] = useState<Review[]>([])

  // 찜 탭 — 전체 카테고리에서 찜한 항목 통합
  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [savedCategory, setSavedCategory] = useState<SavedKind | "all">("all")

  // 내 글 탭 카테고리 필터 (일반인 계정 전용: 매물/게시판/나눔/모임/신장개업)
  const [postsCategory, setPostsCategory] = useState<string>("all")

  // 사장님(business) "내 메뉴·상품" 탭 — 공동구매 글 목록
  const [businessProducts, setBusinessProducts] = useState<UnifiedPost[]>([])

  const [activeTab, setActiveTab] = useState<ProfileTabId | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [storyIndex, setStoryIndex] = useState<number | null>(null)

  // 게시물 총합 (모든 게시물류 테이블 카운트 합산)
  const [totalPostsCount, setTotalPostsCount] = useState(0)
  // 매물(또는 서비스 포토폴리오) 카운트 — 상단 "게시물" 카운터에 합산
  const [listingsCount, setListingsCount] = useState(0)

  // posts 탭 통합 리스트
  const [unifiedPosts, setUnifiedPosts] = useState<UnifiedPost[]>([])
  const [unifiedLoading, setUnifiedLoading] = useState(false)

  // 팔로워/팔로잉 모달
  const [followModal, setFollowModal] = useState<FollowListKind | null>(null)

  // 후기 모달
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsLoaded, setReviewsLoaded] = useState(false)

  const role = useMemo(() => resolveRole(profile?.account_type), [profile?.account_type])
  const tabs = useMemo(() => tabsForMode(role, mode), [role, mode])

  // 1) 초기 로드 — 프로필 + 팔로워 + 게시물 카운트 + 하이라이트를 병렬 fetch
  useEffect(() => {
    let cancelled = false
    async function load() {
      // --- 프로필 로드 (initialProfile 없을 때만) ---
      const profilePromise = initialProfile
        ? Promise.resolve(initialProfile)
        : supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single()
            .then(({ data }) => data as ProfileRow | null)

      // --- 팔로워/팔로잉/내가 팔로우 중인지 ---
      const isOther = !!currentUserId && currentUserId !== userId
      const followPromise = Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
        isOther
          ? supabase
              .from("follows")
              .select("follower_id")
              .eq("follower_id", currentUserId)
              .eq("following_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])

      // --- 게시물 총합 (모든 테이블 병렬 count) ---
      const postsCountPromise = Promise.all(
        POSTS_SOURCES.map(async (src) => {
          try {
            let q: any = (supabase as any)
              .from(src.table)
              .select("*", { count: "exact", head: true })
              .eq("user_id", userId)
            q = withPlaza(q)
            if (mode === "other" && src.table === "properties") {
              q = q.eq("status", "active")
            }
            const { count } = await q
            return count ?? 0
          } catch {
            return 0
          }
        }),
      )

      // --- 하이라이트 (광장별 격리) ---
      const highlightsPromise = (async () => {
        let q: any = supabase
          .from("profile_highlights")
          .select("id, title, cover_url, media_url, media_type, duration_ms, link_url, sort_order")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
        q = withPlaza(q)
        const { data } = await q
        return data as Highlight[] | null
      })()

      // 모두 병렬 실행
      const [profileData, followData, postsCountData, highlightsData] = await Promise.all([
        profilePromise,
        followPromise,
        postsCountPromise,
        highlightsPromise,
      ])

      if (cancelled) return

      // 프로필
      if (profileData) setProfile(profileData as ProfileRow)
      setLoading(false)

      // 팔로워/팔로잉
      const [followersRes, followingRes, meRes] = followData
      setFollowers(followersRes.count ?? 0)
      setFollowing(followingRes.count ?? 0)
      if (isOther) setIsFollowing(!!meRes.data)

      // 게시물 총합
      const total = postsCountData.reduce((a, b) => a + b, 0)
      setTotalPostsCount(total)

      // 하이라이트
      if (highlightsData) setHighlights(highlightsData)
    }
    load()
    return () => { cancelled = true }
  }, [supabase, userId, initialProfile, currentUserId, mode, withPlaza])

  // 1-b) 프로필 의존 데이터 — 사업자 정보 + 매물/포토폴리오 카운트를 병렬 fetch
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function load() {
      if (!profile) return

      // --- 사업자 정보 ---
      const needsBusiness = profile.account_type
        && profile.account_type !== "individual"
        && profile.account_type !== "user"
      const businessPromise = needsBusiness
        ? getBusinessInfo(supabase as any, profile.id)
        : Promise.resolve(null)

      // --- 매물/포토폴리오 카운트 ---
      const acct = (profile.account_type || "user") as AccountType
      const table = SERVICE_TABLE[acct] || "properties"
      const listingsPromise = (async () => {
        try {
          let q: any = (supabase as any)
            .from(table)
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
          q = withPlaza(q)
          if (mode === "other") {
            q = q.eq("status", "active")
          }
          const { count } = await q
          return count ?? 0
        } catch {
          return 0
        }
      })()

      const [businessData, listingsData] = await Promise.all([
        businessPromise,
        listingsPromise,
      ])

      if (cancelled) return
      setBusinessInfo(businessData)
      setListingsCount(listingsData)
    }
    load()
    return () => { cancelled = true }
  }, [supabase, userId, mode, profile, withPlaza])

  // 4) 탭 초기값 결정 + URL 쿼리 변화 반응
  //    ?tab= 쿼리가 들어오면 그 탭으로 바꾸고, 탭 위치까지 자동 스크롤
  //    이미 스크롤한 wantedTab 은 다시 스크롤하지 않도록 ref 로 추적 (chip/필터 변경 등으로
  //    effect 재실행돼도 스크롤이 다시 발동되지 않게)
  const wantedTab = searchParams?.get("tab") as ProfileTabId | null
  const scrolledForTabRef = useRef<string | null>(null)
  useEffect(() => {
    if (!profile) return
    if (wantedTab && tabs.some((t) => t.id === wantedTab)) {
      if (wantedTab !== activeTab) setActiveTab(wantedTab)
      // 같은 wantedTab 으로 이미 스크롤 했다면 스킵
      if (scrolledForTabRef.current === wantedTab) return
      scrolledForTabRef.current = wantedTab
      setTimeout(() => {
        const el = document.getElementById("profile-tabs")
        if (!el) return
        el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" })
      }, 500)
      return
    }
    if (!activeTab) setActiveTab(tabs[0]?.id ?? "posts")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, tabs, wantedTab])

  // 5) 탭 전환 시 데이터 lazy-load
  useEffect(() => {
    if (!profile || !activeTab) return
    let cancelled = false

    async function loadTab() {
      if (!profile || !activeTab) return
      const acct = (profile.account_type || "user") as AccountType

      if (activeTab === "listings" || (activeTab === "posts" && acct === "user") || activeTab === "saved") {
        // properties 필요
      }

      switch (activeTab) {
        case "listings": {
          // limit 추가 — 매물 많은 중개사 프로필에서 무제한 fetch 방지 (2026-04 audit, #11).
          // 50개면 보통 충분. 더 보고 싶으면 무한스크롤은 추후 작업.
          // 정렬: 올리기 반영 → effective_at (= COALESCE(bumped_at, created_at)) DESC.
          let q: any = supabase.from("properties").select("*").eq("user_id", userId)
          q = withPlaza(q)
          if (mode === "other") q = q.eq("status", "active")
          const { data } = await q.order("effective_at", { ascending: false }).limit(50)
          if (!cancelled && data) setProperties(data as DbProperty[])
          break
        }
        case "posts": {
          // 타인 프로필에서 비공개면 로드 건너뜀
          if (mode === "other" && profile.posts_public === false) {
            if (!cancelled) setUnifiedPosts([])
            break
          }
          setUnifiedLoading(true)
          try {
            // 올리기(bump) 기능 있는 테이블 — effective_at(= COALESCE(bumped_at, created_at)) 로 정렬
            const BUMPABLE_TABLES = new Set([
              "group_buying_posts", "new_store_posts", "local_food",
              "interior_posts", "moving_posts", "cleaning_posts", "repair_posts",
            ])
            const results = await Promise.all(
              POSTS_SOURCES.map(async (src) => {
                try {
                  const isBumpable = BUMPABLE_TABLES.has(src.table)
                  const cols = src.cols
                    ? src.cols
                    : isBumpable
                    ? "id, title, content, description, images, created_at, bumped_at, effective_at, status"
                    : "id, title, content, description, images, created_at, status"
                  let q: any = (supabase as any)
                    .from(src.table)
                    .select(cols)
                    .eq("user_id", userId)
                    .order(isBumpable ? "effective_at" : "created_at", { ascending: false })
                    .limit(20)
                  q = withPlaza(q)
                  if (mode === "other" && src.table === "properties") {
                    q = q.eq("status", "active")
                  }
                  const { data } = await q
                  return (data || []).map((row: any) => {
                    const imgs = Array.isArray(row[src.imageField || "images"])
                      ? (row[src.imageField || "images"] as string[])
                      : null
                    return {
                      id: String(row.id),
                      kind: src.kind,
                      kindLabel: src.kindLabel,
                      title: row.title || row.name || "(제목 없음)",
                      excerpt: row.content || row.description || null,
                      // 카드의 "방금 전" 표시도 bump 반영 — effective_at 우선
                      created_at: row.effective_at ?? row.bumped_at ?? row.created_at,
                      href: `${src.hrefPrefix}${row.id}`,
                      image: imgs && imgs.length > 0 ? imgs[0] : null,
                    } as UnifiedPost
                  })
                } catch {
                  return [] as UnifiedPost[]
                }
              }),
            )
            // 매물 권한 있는 계정의 본인 매물도 "내 글" 에 포함 (kind="property")
            // agent 는 "매물"이 별도 탭(listings) 이므로 제외
            let propertyPosts: UnifiedPost[] = []
            if (acct !== "agent") {
              try {
                let pq: any = supabase
                  .from("properties")
                  .select("id, title, description, images, created_at, bumped_at, effective_at, status, district")
                  .eq("user_id", userId)
                  .order("effective_at", { ascending: false })
                  .limit(50)
                pq = withPlaza(pq)
                if (mode === "other") pq = pq.eq("status", "active")
                const { data: props } = await pq
                propertyPosts = (props || []).map((row: any) => ({
                  id: String(row.id),
                  kind: "property",
                  kindLabel: "매물",
                  title: row.title || "(제목 없음)",
                  excerpt: row.description || row.district || null,
                  created_at: row.effective_at ?? row.bumped_at ?? row.created_at,
                  href: `/property/${row.id}`,
                  image: Array.isArray(row.images) && row.images.length > 0 ? row.images[0] : null,
                }))
              } catch {
                propertyPosts = []
              }
            }

            // 역할 전용 콘텐츠는 "내 글" 에서 제외 (각자의 role tab 에 이미 표시됨)
            const excludeKinds = ROLE_EXCLUDE_FROM_POSTS[acct] ?? []
            const merged = [...results.flat(), ...propertyPosts]
              .filter((p) => !excludeKinds.includes(p.kind))
              .sort(
                (a, b) =>
                  Date.parse(b.created_at) -
                  Date.parse(a.created_at),
              )
            if (!cancelled) {
              setUnifiedPosts(merged)
            }
          } finally {
            if (!cancelled) setUnifiedLoading(false)
          }
          break
        }
        case "portfolio":
        case "services":
        case "products": {
          // 사장님: 공동구매를 "내 메뉴·상품" 탭에 표시
          if (acct === "business" && activeTab === "products") {
            let gq: any = supabase
              .from("group_buying_posts")
              .select("id, title, description, images, created_at, bumped_at, effective_at, status")
              .eq("user_id", userId)
              .order("effective_at", { ascending: false })
              .limit(50)
            gq = withPlaza(gq)
            if (mode === "other") gq = gq.eq("status", "active")
            const { data } = await gq
            if (!cancelled) {
              setBusinessProducts(
                (data || []).map((row: any) => ({
                  id: String(row.id),
                  kind: "group-buying",
                  kindLabel: "공동구매",
                  title: row.title || "(제목 없음)",
                  excerpt: row.description || null,
                  created_at: row.created_at,
                  href: `/group-buying/${row.id}`,
                  image: Array.isArray(row.images) && row.images.length > 0 ? row.images[0] : null,
                })),
              )
              setServicePosts([])
            }
            break
          }
          const table = SERVICE_TABLE[acct]
          if (!table) { if (!cancelled) setServicePosts([]); break }
          let q: any = (supabase as any).from(table).select("*").eq("user_id", userId)
          q = withPlaza(q)
          if (mode === "other") q = q.eq("status", "active")
          // 인테리어/이사/청소/수리 모두 bump 가능 — effective_at 정렬
          const { data } = await q.order("effective_at", { ascending: false })
          if (!cancelled && data) setServicePosts(data as ServicePost[])
          break
        }
        case "saved": {
          if (mode !== "self") break
          setSavedLoading(true)
          try {
            // 11개 카테고리 찜 병렬 로드 (테이블 없을 때는 빈 배열 fallback)
            const safeQuery = async <T,>(p: Promise<{ data: T | null; error: any }>) => {
              try {
                const r = await p
                return { data: r.data, error: r.error }
              } catch (e) {
                return { data: null, error: e }
              }
            }
            const [
              propRes,
              boardRes,
              foodRes,
              groupRes,
              clubRes,
              interiorRes,
              sharingRes,
              newStoreRes,
              movingRes,
              cleaningRes,
              repairRes,
            ] = await Promise.all([
              // 모든 like/favorite 테이블에 plaza_id 컬럼 존재 (마이그레이션 13).
              // 광장 도메인이면 그 광장 찜만 노출.
              safeQuery(
                withPlaza(
                  supabase
                    .from("favorites")
                    .select("created_at, property_id, properties(*)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("board_post_likes")
                    .select("created_at, post_id, board_posts(id, title, content, category, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("local_food_likes")
                    .select("created_at, local_food_id, local_food(id, title, description, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("group_buying_wishlist")
                    .select("created_at, post_id, group_buying_posts(id, title, description, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("club_likes")
                    .select("created_at, club_id, clubs(id, title, sport_type, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("interior_favorites")
                    .select("created_at, post_id, interior_posts(id, title, content, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("sharing_likes")
                    .select("created_at, post_id, sharing_posts(id, title, description, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("new_store_likes")
                    .select("created_at, post_id, new_store_posts(id, store_name, description, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("moving_favorites")
                    .select("created_at, post_id, moving_posts(id, title, content, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("cleaning_favorites")
                    .select("created_at, post_id, cleaning_posts(id, title, content, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
              safeQuery(
                withPlaza(
                  supabase
                    .from("repair_favorites")
                    .select("created_at, post_id, repair_posts(id, title, content, images, created_at)")
                    .eq("user_id", userId),
                ).order("created_at", { ascending: false }).limit(50),
              ),
            ])

            // 각 응답을 SavedItem 통일 포맷으로 변환 (테이블 없어서 에러 난 경우 무시)
            const items: SavedItem[] = []

            for (const r of (propRes.data || []) as any[]) {
              const p = r.properties
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "property",
                kindLabel: "부동산",
                title: p.title,
                subtitle: p.district,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/property/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (boardRes.data || []) as any[]) {
              const p = r.board_posts
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "board",
                kindLabel: "게시판",
                title: p.title,
                subtitle: p.category || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/board/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (foodRes.data || []) as any[]) {
              const p = r.local_food
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "local-food",
                kindLabel: "로컬푸드",
                title: p.title,
                subtitle: p.description?.slice(0, 40) || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/local-food/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (groupRes.data || []) as any[]) {
              const p = r.group_buying_posts
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "group-buying",
                kindLabel: "공동구매",
                title: p.title,
                subtitle: p.description?.slice(0, 40) || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/group-buying/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (clubRes.data || []) as any[]) {
              const p = r.clubs
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "club",
                kindLabel: "모임",
                title: p.title,
                subtitle: p.sport_type || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/clubs/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (interiorRes.data || []) as any[]) {
              const p = r.interior_posts
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "interior",
                kindLabel: "홈즈",
                title: p.title,
                subtitle: (p.content || "").slice(0, 40) || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/interior/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (sharingRes.data || []) as any[]) {
              const p = r.sharing_posts
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "sharing",
                kindLabel: "나눔",
                title: p.title,
                subtitle: p.description?.slice(0, 40) || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/sharing/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (newStoreRes.data || []) as any[]) {
              const p = r.new_store_posts
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "new-store",
                kindLabel: "신장개업",
                title: p.store_name,
                subtitle: p.description?.slice(0, 40) || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/new-store/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (movingRes.data || []) as any[]) {
              const p = r.moving_posts
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "moving",
                kindLabel: "이사",
                title: p.title,
                subtitle: (p.content || "").slice(0, 40) || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/moving/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (cleaningRes.data || []) as any[]) {
              const p = r.cleaning_posts
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "cleaning",
                kindLabel: "청소",
                title: p.title,
                subtitle: (p.content || "").slice(0, 40) || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/cleaning/${p.id}`,
                created_at: r.created_at,
              })
            }
            for (const r of (repairRes.data || []) as any[]) {
              const p = r.repair_posts
              if (!p) continue
              items.push({
                id: String(p.id),
                kind: "repair",
                kindLabel: "수리",
                title: p.title,
                subtitle: (p.content || "").slice(0, 40) || null,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                href: `/repair/${p.id}`,
                created_at: r.created_at,
              })
            }

            // 찜한 시각 내림차순 정렬
            items.sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )

            // 기존 호환 (favorites 상태는 부동산만 유지)
            if (!cancelled) {
              setFavorites(
                ((propRes.data || []) as any[])
                  .map((f: any) => f.properties)
                  .filter(Boolean) as DbProperty[],
              )
              setSavedItems(items)
            }
          } finally {
            if (!cancelled) setSavedLoading(false)
          }
          break
        }
      }
    }
    loadTab()
    return () => { cancelled = true }
  }, [supabase, userId, activeTab, mode, profile])

  // ─── Handlers ─────────────────────────────────────────
  const handleFollowToggle = async () => {
    if (!currentUserId) { router.push(`/auth/login?redirect=/profile/${userId}`); return }
    if (currentUserId === userId) return
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", userId)
      setIsFollowing(false); setFollowers((n) => Math.max(0, n - 1))
    } else {
      await (supabase as any).from("follows").insert({ follower_id: currentUserId, following_id: userId })
      setIsFollowing(true); setFollowers((n) => n + 1)
    }
  }

  const handleMessage = async () => {
    if (!currentUserId) { router.push(`/auth/login?redirect=/profile/${userId}`); return }
    if (currentUserId === userId) return // 자기 자신엔 메시지 불가

    // 다이렉트 메시지 — 매물/게시글 무관 1:1 채팅
    // 기존 direct 방 찾기 — 두 사용자 ID 페어 (양방향) + post_type='direct'
    const { data: existing } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("post_type", "direct")
      .is("property_id", null)
      .or(
        `and(buyer_id.eq.${currentUserId},seller_id.eq.${userId}),and(buyer_id.eq.${userId},seller_id.eq.${currentUserId})`,
      )
      .limit(1)
      .maybeSingle()
    if (existing) { router.push(`/chat/${existing.id}`); return }

    // 새 direct 방 생성 — 현재 사용자가 buyer, 상대가 seller (의미 없음 — 단순 ID 보관)
    const { data: created, error } = await supabase
      .from("chat_rooms")
      .insert({
        property_id: null,
        post_type: "direct",
        buyer_id: currentUserId,
        seller_id: userId,
      })
      .select()
      .single()
    if (error) {
      console.error("[profile/message] create direct room failed:", error)
      toast.error("메시지 시작에 실패했습니다")
      return
    }
    if (created) router.push(`/chat/${created.id}`)
  }

  const handleCall = () => {
    if (profile?.phone) window.location.href = `tel:${profile.phone}`
  }

  const handleShare = () => setShareOpen(true)

  const openReviews = async () => {
    setReviewsOpen(true)
    if (reviewsLoaded) return
    setReviewsLoading(true)
    try {
      const { data } = await supabase
        .from("reviews")
        .select("id, reviewer_id, reviewed_user_id, response_speed, accuracy, kindness, total_score, content, created_at, profiles!reviews_reviewer_id_fkey(nickname)")
        .eq("reviewed_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
      if (data) {
        setReviews(
          data.map((r: any) => ({ ...r, reviewer_name: r.profiles?.nickname || "익명" })) as Review[],
        )
      }
      setReviewsLoaded(true)
    } finally {
      setReviewsLoading(false)
    }
  }

  // Avatar/Cover 업로드 (self 모드 전용)
  async function uploadToMedia(file: File): Promise<string> {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/board/upload", { method: "POST", body: fd })
    if (!res.ok) throw new Error("업로드 실패")
    const { url } = await res.json()
    return url as string
  }
  const handleAvatarUpload = async (file: File) => {
    try {
      const url = await uploadToMedia(file)
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId)
      if (error) throw error
      setProfile((p) => (p ? { ...p, avatar_url: url } : p))
    } catch (e: any) {
      toast.error(e?.message || "프로필 사진 업로드 실패")
    }
  }

  // ─── Render ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f6f0] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f7f6f0] flex flex-col items-center justify-center">
        <p className="text-muted-foreground">사용자를 찾을 수 없습니다</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>돌아가기</Button>
      </div>
    )
  }

  const cardData: ProfileCardData = {
    id: profile.id,
    nickname: profile.nickname,
    avatar_url: profile.avatar_url,
    cover_url: profile.cover_url,
    bio: profile.bio,
    location: profile.location,
    role: profile.role,
    postsCount: 0, // counters.posts 는 탭 카운트와 별개. 아래에서 덮어씀.
    followersCount: followers,
    followingCount: following,
    trustScore: profile.trust_score,
    reviewCount: profile.review_count,
  }

  // 게시물 수 (상단 카운터) = 매물/포토폴리오 + 내 글
  cardData.postsCount = listingsCount + totalPostsCount

  const tabCounts: Partial<Record<ProfileTabId, number>> = {
    listings: properties.length,
    portfolio: servicePosts.length,
    services: servicePosts.length,
    products: servicePosts.length,
    posts: totalPostsCount,
    saved: favorites.length,
  }

  // 타인 프로필에서 게시물 비공개 설정
  const postsHiddenForOthers =
    mode === "other" && profile.posts_public === false

  return (
    <div className="min-h-screen bg-[#f7f6f0] pb-20">
      {/* 마이페이지 전용 단일 헤더
          [← 포인트 (admin)]   마이페이지   [🔔 👤 ☰] */}
      <header className="safe-top sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto relative flex items-center px-3 h-14">
          {/* 좌측: 뒤로 + 포인트 + (관리자만) admin */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-1 rounded-full hover:bg-secondary"
              aria-label="뒤로"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            {mode === "self" && <MyPointsBalance showLabel={false} />}
            {mode === "self" && (profile.role === "admin" || profile.role === "superadmin") && (
              <Link href="/admin" className="p-1.5 rounded-full hover:bg-secondary" title="관리자">
                <Shield className="w-5 h-5 text-primary" />
              </Link>
            )}
          </div>

          {/* 가운데 타이틀 — absolute 정확한 중앙 */}
          <h1 className="absolute left-1/2 -translate-x-1/2 font-semibold text-base truncate max-w-[40%] pointer-events-none">
            {mode === "self" ? "마이페이지" : profile.nickname || "프로필"}
          </h1>

          {/* 우측: 알림 / 사용자 / 햄버거 — 홈 헤더와 동일 클러스터 */}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
            {mode === "self" && (
              <HeaderActions
                user={currentUserId ? { id: currentUserId } : null}
                userRole={profile.role}
                userAccountType={profile.account_type}
              />
            )}
            {mode === "other" && (
              <button className="p-2 -mr-1 rounded-full hover:bg-secondary" aria-label="더보기">
                <MoreVertical className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 단일 컬럼 컨테이너 (모바일과 동일 비율 · PC에서도 모바일 폭 유지) */}
      <div className="max-w-3xl mx-auto">
        {/* 커버(배너) 제거 — 어르신 가독성 우선 (전원일기) */}
        <ProfileCard
          data={cardData}
          role={role}
          mode={mode}
          isFollowing={isFollowing}
          onFollowToggle={handleFollowToggle}
          onMessage={handleMessage}
          onShare={handleShare}
          onCall={handleCall}
          onInquiry={handleMessage}
          onAvatarUpload={mode === "self" ? handleAvatarUpload : undefined}
          onCounterClick={(kind) => {
            if (kind === "posts") {
              setActiveTab("posts")
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 320, behavior: "smooth" })
              }
            } else if (kind === "trust") {
              openReviews()
            } else {
              setFollowModal(kind)
            }
          }}
        />

        <ProfileHighlights
          items={highlights}
          mode={mode}
          onAdd={() => router.push("/mypage/highlights")}
          onOpen={(_h, i) => setStoryIndex(i)}
        />

        {activeTab && (
          <div id="profile-tabs" className="scroll-mt-14">
            <ProfileTabs
              tabs={tabs}
              active={activeTab}
              onChange={setActiveTab}
              counts={tabCounts}
            />
          </div>
        )}

        <div className="px-4 py-4 pb-6 min-h-[100vh]">
          {activeTab === "info" ? (
            <ProfileSidebar data={profile} role={role} mode={mode} businessInfo={businessInfo} />
          ) : (
            renderTabContent({
              activeTab,
              profile,
              properties,
              favorites,
              servicePosts,
              unifiedPosts,
              unifiedLoading,
              postsHiddenForOthers,
              reviews,
              currentUserId,
              mode,
              savedItems,
              savedLoading,
              savedCategory,
              onSavedCategoryChange: setSavedCategory,
              postsCategory,
              onPostsCategoryChange: setPostsCategory,
              businessProducts,
            })
          )}
        </div>
      </div>

      {/* Story viewer */}
      {storyIndex !== null && highlights.length > 0 && (
        <StoryViewer
          items={highlights}
          startIndex={storyIndex}
          authorName={profile.nickname}
          authorAvatar={profile.avatar_url}
          canDelete={mode === "self"}
          onDelete={(id) =>
            setHighlights((arr) => arr.filter((h) => h.id !== id))
          }
          onClose={() => setStoryIndex(null)}
        />
      )}

      {/* Reviews modal — 신뢰지수 카운터 클릭 시 오픈 */}
      <ReviewsModal
        open={reviewsOpen}
        onClose={() => setReviewsOpen(false)}
        trustScore={profile.trust_score}
        reviewCount={profile.review_count}
        reviews={reviews}
        loading={reviewsLoading}
      />

      {/* Follower / Following list modal */}
      <FollowListModal
        open={followModal !== null}
        kind={followModal ?? "followers"}
        targetUserId={userId}
        currentUserId={currentUserId}
        onClose={() => setFollowModal(null)}
      />

      {/* Share bottom sheet */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        meta={{
          title: `${profile.nickname || "프로필"} · ${plazaBrandName}`,
          description: profile.bio || `${role.label} 프로필 보기`,
          imageUrl: profile.avatar_url || undefined,
        }}
      />
    </div>
  )
}

// ─── Tab content renderer ────────────────────────────────
interface RenderArgs {
  activeTab: ProfileTabId | null
  profile: ProfileRow
  properties: DbProperty[]
  favorites: DbProperty[]
  servicePosts: ServicePost[]
  unifiedPosts: UnifiedPost[]
  unifiedLoading: boolean
  postsHiddenForOthers: boolean
  reviews: Review[]
  currentUserId: string | null
  mode: "self" | "other"
  savedItems: SavedItem[]
  savedLoading: boolean
  savedCategory: SavedKind | "all"
  onSavedCategoryChange: (c: SavedKind | "all") => void
  postsCategory: string
  onPostsCategoryChange: (c: string) => void
  businessProducts: UnifiedPost[]
}

function renderTabContent(args: RenderArgs) {
  const {
    activeTab, profile, properties, favorites, servicePosts,
    unifiedPosts, unifiedLoading, postsHiddenForOthers,
    reviews, currentUserId, mode,
    savedItems, savedLoading, savedCategory, onSavedCategoryChange,
    postsCategory, onPostsCategoryChange,
    businessProducts,
  } = args

  switch (activeTab) {
    case "listings":
      return (
        <Grid empty={properties.length === 0} emptyText="등록된 매물이 없습니다">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={dbToProperty(p)} currentUserId={currentUserId || undefined} />
          ))}
        </Grid>
      )

    case "portfolio":
    case "services":
    case "products": {
      const acct = (profile.account_type || "user") as AccountType
      // 사장님: "내 메뉴·상품" 탭에서 본인의 공동구매 글 목록 표시
      if (acct === "business" && activeTab === "products") {
        if (businessProducts.length === 0) return <Empty text="등록된 공동구매가 없습니다" />
        return (
          <ul className="space-y-2">
            {businessProducts.map((p) => (
              <li key={`${p.kind}-${p.id}`}>
                <Link
                  href={p.href}
                  className="flex gap-3 p-3 bg-card rounded-xl border border-border hover:bg-secondary/50 transition-colors"
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-secondary"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-600">
                        {p.kindLabel}
                      </span>
                      <h4 className="font-medium text-sm truncate flex-1">{p.title}</h4>
                    </div>
                    {p.excerpt && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.excerpt}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      }
      if (!["interior", "moving", "cleaning", "repair"].includes(acct)) {
        return <Empty text="등록된 콘텐츠가 없습니다" />
      }
      return (
        <Grid empty={servicePosts.length === 0} emptyText="등록된 글이 없습니다">
          {servicePosts.map((post) => (
            <ServiceCard
              key={post.id}
              post={post}
              serviceType={acct as "interior" | "moving" | "cleaning" | "repair"}
              currentUserId={currentUserId || undefined}
            />
          ))}
        </Grid>
      )
    }

    case "posts": {
      if (postsHiddenForOthers) {
        return (
          <div className="py-16 text-center">
            <p className="text-muted-foreground">이 사용자는 게시물을 비공개로 설정했습니다</p>
          </div>
        )
      }

      const acct = (profile.account_type || "user") as AccountType
      // 역할별 권한 카테고리 매트릭스로 필터칩 노출
      const categories = POSTS_CATEGORIES_BY_ROLE[acct] ?? BASE_POSTS_CATEGORIES
      // 카테고리가 "전체" 하나뿐이면 필터 숨김
      const showPostsFilter = categories.length > 1
      const filteredPosts = showPostsFilter && postsCategory !== "all"
        ? unifiedPosts.filter((p) => p.kind === postsCategory)
        : unifiedPosts

      // 카테고리별 카운트 (탭 라벨 옆 숫자)
      const postsCounts: Record<string, number> = { all: unifiedPosts.length }
      for (const p of unifiedPosts) {
        postsCounts[p.kind] = (postsCounts[p.kind] || 0) + 1
      }

      return (
        <div className="space-y-4">
          {showPostsFilter && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
              {categories.map((c) => {
                const active = postsCategory === c.key
                const count = postsCounts[c.key] || 0
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onPostsCategoryChange(c.key)}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/50",
                    )}
                  >
                    <span>{c.label}</span>
                    {count > 0 && (
                      <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {unifiedLoading && unifiedPosts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">불러오는 중…</div>
          ) : filteredPosts.length === 0 ? (
            <Empty text={
              showPostsFilter && postsCategory !== "all"
                ? "해당 카테고리에 작성한 글이 없습니다"
                : "작성한 게시물이 없습니다"
            } />
          ) : (
            <ul className="space-y-2">
              {filteredPosts.map((p) => (
                <li key={`${p.kind}-${p.id}`}>
                  <Link
                    href={p.href}
                    className="flex gap-3 p-3 bg-card rounded-xl border border-border hover:bg-secondary/50 transition-colors"
                  >
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-secondary"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                          {p.kindLabel}
                        </span>
                        <h4 className="font-medium text-sm truncate flex-1">{p.title}</h4>
                      </div>
                      {p.excerpt && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.excerpt}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }

    case "saved": {
      if (mode !== "self") return null
      return (
        <SavedTab
          items={savedItems}
          loading={savedLoading}
          category={savedCategory}
          onCategoryChange={onSavedCategoryChange}
          favorites={favorites}
          currentUserId={currentUserId}
        />
      )
    }

    case "chats":
      return (
        <div className="py-12 text-center">
          <Link href="/chat" className="text-primary hover:underline text-sm">
            채팅 목록으로 이동 →
          </Link>
        </div>
      )

    case "moim":
    case "gift":
    case "group-buying":
      return <Empty text="준비 중입니다" />

    default:
      return null
  }
}

// ─── 내 글 탭 — 역할별 카테고리 필터 ───────────────────
// 권한 매트릭스와 1:1 매칭. 역할 전용 콘텐츠(매물 for agent, 로컬푸드 for producer,
// 인테리어/이사/청소/수리)는 각자의 role tab 에 이미 있으므로 "내 글"에서 제외.
// key 는 UnifiedPost.kind 와 동일하게 맞춤.
type PostsCategory = { key: string; label: string }

const BASE_POSTS_CATEGORIES: PostsCategory[] = [
  { key: "all",        label: "전체" },
  { key: "secondhand", label: "농기구" },
  { key: "local-food", label: "로컬푸드" },
  { key: "jobs",       label: "일손" },
  { key: "board",      label: "마을소식" },
  { key: "sharing",    label: "나눔" },
]

const POSTS_CATEGORIES_BY_ROLE: Record<AccountType, PostsCategory[]> = {
  user:     BASE_POSTS_CATEGORIES,
  // 공인중개사: 매물은 별도 탭이므로 제외
  agent:    BASE_POSTS_CATEGORIES.filter((c) => c.key !== "property"),
  // 생산자: 로컬푸드는 별도 탭(상품)
  producer: BASE_POSTS_CATEGORIES,
  // 사장님: 공동구매는 "내 메뉴·상품" 탭에 속하므로 "내 글"에서는 제외
  business: BASE_POSTS_CATEGORIES,
  // 전문 서비스: 각자의 서비스는 별도 탭이므로 기본 그대로
  interior: BASE_POSTS_CATEGORIES,
  moving:   BASE_POSTS_CATEGORIES,
  cleaning: BASE_POSTS_CATEGORIES,
  repair:   BASE_POSTS_CATEGORIES,
}

/** 역할별로 "내 글" 에서 빼야 하는 UnifiedPost.kind 목록 (role tab 중복 방지). */
const ROLE_EXCLUDE_FROM_POSTS: Record<AccountType, string[]> = {
  user:     [],
  agent:    ["property"],      // 매물은 listings 탭
  producer: ["local-food"],    // 로컬푸드는 products 탭
  business: ["group-buying"],  // 공동구매는 "내 메뉴·상품" 탭에서 표시
  interior: ["interior"],      // portfolio 탭
  moving:   ["moving"],        // services 탭
  cleaning: ["cleaning"],      // services 탭
  repair:   ["repair"],        // services 탭
}

// ─── 찜 탭 ─────────────────────────────────────────────
const SAVED_CATEGORIES: Array<{
  key: SavedKind | "all"
  label: string
}> = [
  { key: "all",          label: "전체" },
  { key: "property",     label: "부동산" },
  { key: "interior",     label: "홈즈" }, // 인테리어 + 이사 + 청소 + 수리 합산
  { key: "sharing",      label: "나눔" },
  { key: "group-buying", label: "공동구매" },
  { key: "local-food",   label: "로컬푸드" },
  { key: "new-store",    label: "신장개업" },
  { key: "club",         label: "모임" },
  { key: "board",        label: "게시판" },
]

/** "홈즈" 카테고리에 포함되는 kinds */
const INTERIOR_GROUP: SavedKind[] = ["interior", "moving", "cleaning", "repair"]

function SavedTab({
  items,
  loading,
  category,
  onCategoryChange,
  favorites,
  currentUserId,
}: {
  items: SavedItem[]
  loading: boolean
  category: SavedKind | "all"
  onCategoryChange: (c: SavedKind | "all") => void
  favorites: DbProperty[]
  currentUserId: string | null
}) {
  // 카테고리별 개수 (홈즈는 interior/moving/cleaning/repair 합산)
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
    <div className="space-y-4">
      {/* 카테고리 필터 */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {SAVED_CATEGORIES.map((c) => {
          const active = category === c.key
          const count = counts[c.key] || 0
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onCategoryChange(c.key)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50",
              )}
            >
              <span>{c.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    active ? "text-primary-foreground/80" : "text-muted-foreground/70",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 목록 */}
      {loading && items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <Empty text="찜한 항목이 없습니다" />
      ) : category === "property" ? (
        // 부동산만 보는 경우 PropertyCard 로 표시
        <Grid empty={favorites.length === 0} emptyText="찜한 매물이 없습니다">
          {favorites.map((p) => (
            <PropertyCard
              key={p.id}
              property={dbToProperty(p)}
              currentUserId={currentUserId || undefined}
            />
          ))}
        </Grid>
      ) : (
        // 그 외(전체 포함): 통합 리스트 카드
        <ul className="space-y-2">
          {filtered.map((it) => (
            <li key={`${it.kind}-${it.id}`}>
              <Link
                href={it.href}
                className="flex gap-3 p-3 bg-card rounded-xl border border-border hover:bg-secondary/50 transition-colors"
              >
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-secondary"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                      {it.kindLabel}
                    </span>
                    <h4 className="font-medium text-sm truncate flex-1">{it.title}</h4>
                  </div>
                  {it.subtitle && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {it.subtitle}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(it.created_at).toLocaleDateString("ko-KR")} 찜
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Grid({
  children, empty, emptyText,
}: { children: React.ReactNode; empty: boolean; emptyText: string }) {
  if (empty) return <Empty text={emptyText} />
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3">
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className={cn("py-16 text-center")}>
      <p className="text-muted-foreground">{text}</p>
    </div>
  )
}
