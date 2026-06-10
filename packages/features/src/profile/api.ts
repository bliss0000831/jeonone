/**
 * @gwangjang/features/profile — 마이페이지 API.
 *
 * Phase 2C: 마이페이지 RN 구현용 모든 함수.
 * Supabase 직접 호출 (DI 패턴) — RLS 가 권한 보호.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  FollowEntry,
  OrderEntry,
  PointHistoryEntry,
  ProfileCardData,
  ProfileHighlight,
  ProfileRow,
  ReviewEntry,
  SavedItem,
  SettlementAccount,
  SubscriptionInfo,
  UnifiedPost,
} from "@gwangjang/types/profile"
import type { AccountType } from "@gwangjang/types/chat"

// ── Local interfaces for Supabase row shapes (replacing `any`) ──────────

/** plaza_profiles 에서 SELECT 하는 공통 필드 */
interface PlazaProfileRow {
  user_id: string
  nickname: string | null
  avatar_url: string | null
  account_type: AccountType | null
  bio?: string | null
  phone?: string | null
  location?: string | null
  business_hours?: string | null
  specialties?: unknown
  service_areas?: unknown
  website?: string | null
  kakao_id?: string | null
  background_url?: string | null
}

/** profiles 에서 간단 조회할 때의 shape */
interface ProfileBriefRow {
  id: string
  nickname: string | null
  avatar_url: string | null
  account_type: AccountType | null
  bio?: string | null
}

/** getAuthorByPlaza / getAuthorsByPlaza 반환 shape */
interface AuthorInfo {
  id: string
  nickname: string | null
  avatar_url: string | null
  account_type: AccountType | null
  bio?: string | null
  phone?: string | null
  location?: string | null
  business_hours?: string | null
  specialties?: unknown
  service_areas?: unknown
  website?: string | null
  kakao_id?: string | null
  plaza_id?: string | null
}

/** follows 테이블 row (follower_id 또는 following_id select) */
interface FollowRow {
  follower_id?: string
  following_id?: string
  plaza_id?: string | null
}

/** Supabase error with code (e.g. 23505 unique violation) */
interface SupabaseErrorWithCode {
  message: string
  code?: string
}

/** user_points 테이블 조회 shape */
interface UserPointsRow {
  available: number
}

/** subscription 조회 shape */
interface SubscriptionRow {
  id: string
  status: string | null
  current_period_end: string | null
  is_early_bird?: boolean
  applied_discount_pct?: number
  plan_id?: string | null
}

/** subscription_plans 조회 shape */
interface SubscriptionPlanRow {
  name: string | null
}

/**
 * Lightweight interface for Supabase query builders used with dynamic table/column names.
 * Supabase's generic types cannot resolve dynamic `.from(tableName)` calls,
 * so we use this minimal chainable shape.
 */
interface DynamicQueryBuilder {
  eq(column: string, value: string): DynamicQueryBuilder
  order(column: string, options?: { ascending: boolean }): DynamicQueryBuilder
  then: Promise<{ data: unknown; error: unknown }>["then"]
  [key: string]: unknown
}

// ── 프로필 ─────────────────────────────────────────────────────────────

/** 사용자 ID 로 프로필 행 조회 — columns 미지정 시 전체 */
export async function getProfile(
  supabase: SupabaseClient,
  userId: string,
  columns?: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(columns ?? "*")
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  return data as ProfileRow | null
}

/**
 * 광장 통합 프로필 — 글 작성자 1명 조회 (단건 helper).
 * 표시 필드는 global profiles, account_type만 plaza_profiles에서 읽기.
 */
export async function getAuthorByPlaza(
  supabase: SupabaseClient,
  userId: string,
  plazaId: string | null | undefined,
  extraColumns?: string,
): Promise<AuthorInfo | null> {
  if (!userId) return null

  const profileCols = extraColumns
    ? `id, nickname, avatar_url, account_type, bio, phone, location, business_hours, specialties, service_areas, website, kakao_id, ${extraColumns}`
    : "id, nickname, avatar_url, account_type, bio, phone, location, business_hours, specialties, service_areas, website, kakao_id"

  const profileQuery = supabase
    .from("profiles")
    .select(profileCols)
    .eq("id", userId)
    .maybeSingle()

  const ppQuery = plazaId
    ? (supabase as any)
        .from("plaza_profiles")
        .select("account_type")
        .eq("user_id", userId)
        .eq("plaza_id", plazaId)
        .maybeSingle()
    : Promise.resolve({ data: null })

  const [{ data: p }, { data: pp }] = await Promise.all([profileQuery, ppQuery])
  if (!p) return null

  const profile = p as unknown as Record<string, unknown>
  return {
    ...profile,
    id: userId,
    account_type: (pp as any)?.account_type ?? "user",
    plaza_id: plazaId ?? null,
  } as AuthorInfo
}

/**
 * 광장 통합 프로필 — 글 작성자 표시용 author 정보 일괄 조회.
 * 표시 필드는 global profiles, account_type만 plaza_profiles에서 읽기.
 *
 * @param userIds 작성자 user_id 배열 (중복 자동 제거)
 * @param plazaId 글의 plaza_id (= 작성자의 활동 광장)
 * @returns Map<user_id, { nickname, avatar_url, account_type, ... }>
 */
export async function getAuthorsByPlaza(
  supabase: SupabaseClient,
  userIds: string[],
  plazaId: string | null | undefined,
): Promise<
  Map<
    string,
    {
      id: string
      nickname: string | null
      avatar_url: string | null
      account_type: string | null
      bio?: string | null
      plaza_id?: string | null
    }
  >
> {
  const map = new Map<string, AuthorInfo>()
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  if (uniqueIds.length === 0) return map

  // 1) global profiles 에서 표시 필드 일괄 조회
  const profileQuery = supabase
    .from("profiles")
    .select("id, nickname, avatar_url, account_type, bio")
    .in("id", uniqueIds)

  // 2) plaza_profiles 에서 account_type 만 조회
  const ppQuery = plazaId
    ? (supabase as any)
        .from("plaza_profiles")
        .select("user_id, account_type")
        .in("user_id", uniqueIds)
        .eq("plaza_id", plazaId)
    : Promise.resolve({ data: [] })

  const [{ data: profs }, { data: pps }] = await Promise.all([profileQuery, ppQuery])

  const ppMap = new Map<string, string>()
  for (const pp of (pps ?? []) as any[]) {
    if (pp.account_type) ppMap.set(pp.user_id, pp.account_type)
  }

  for (const p of (profs ?? []) as ProfileBriefRow[]) {
    map.set(p.id, {
      id: p.id,
      nickname: p.nickname,
      avatar_url: p.avatar_url,
      account_type: (ppMap.get(p.id) ?? "user") as AccountType | null,
      bio: p.bio,
      plaza_id: plazaId ?? null,
    })
  }
  return map
}

/**
 * 공개 프로필 — phone/email 같은 민감 필드 제외 (타인 프로필 페이지용).
 * 주의: followers_count/following_count 는 profiles 테이블 컬럼이 아니라
 * profile_stats 뷰에 있음. countFollowers/countFollowing 함수로 별도 조회.
 */
export const PUBLIC_PROFILE_COLUMNS = [
  "id",
  "nickname",
  "full_name",
  "avatar_url",
  "cover_url",
  "bio",
  "location",
  "sub_region",
  "specialties",
  "service_areas",
  "business_hours",
  "kakao_id",
  "website",
  "trust_score",
  "review_count",
  "account_type",
  "role",
  "created_at",
].join(", ")

// 광장별 parent_region 매핑 (sub_region fallback 시 prefix 로 사용)
const PLAZA_PARENT_REGION: Record<string, string> = {
  chuncheon: "강원특별자치도",
  gangneung: "강원특별자치도",
  wonju: "강원특별자치도",
  donghae: "강원특별자치도",
  sokcho: "강원특별자치도",
}
// sub_region 별 시/군 접미사 (chuncheon 광장 기준)
const SUB_REGION_SUFFIX: Record<string, string> = {
  춘천: "시",
  홍천: "군",
  화천: "군",
  양구: "군",
  인제: "군",
  강릉: "시",
  원주: "시",
  동해: "시",
  속초: "시",
}

/** 프로필 카드 표시용 — 카운터 포함 (병렬 fetch)
 *  광장 통합: global profiles 표시 + plaza_profiles account_type만 오버레이.
 */
export async function getProfileCard(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string | null,
): Promise<ProfileCardData | null> {
  const [profile, ppAccountType, postsCount, followersCount, followingCount] =
    await Promise.all([
      getProfile(supabase, userId),
      plazaId
        ? (supabase as any)
            .from("plaza_profiles")
            .select("account_type")
            .eq("user_id", userId)
            .eq("plaza_id", plazaId)
            .maybeSingle()
            .then((r: any) => r.data?.account_type ?? null, () => null)
        : Promise.resolve(null),
      countMyPosts(supabase, userId).catch(() => 0),
      plazaId
        ? countFollowersInPlaza(supabase, userId, plazaId).catch(() => 0)
        : countFollowers(supabase, userId).catch(() => 0),
      plazaId
        ? countFollowingInPlaza(supabase, userId, plazaId).catch(() => 0)
        : countFollowing(supabase, userId).catch(() => 0),
    ])
  if (!profile) return null

  // location fallback: profile.location 없으면 sub_region 으로 조립
  let location = profile.location
  if (!location && profile.sub_region) {
    const parent = (plazaId && PLAZA_PARENT_REGION[plazaId]) || ""
    const suffix = SUB_REGION_SUFFIX[profile.sub_region] || ""
    location = `${parent ? parent + " " : ""}${profile.sub_region}${suffix}`.trim()
  }

  return {
    id: profile.id,
    nickname: profile.nickname,
    avatar_url: profile.avatar_url,
    cover_url: profile.cover_url,
    bio: profile.bio,
    location,
    role: profile.role,
    account_type: (ppAccountType ?? "user") as AccountType,
    postsCount,
    followersCount,
    followingCount,
    trustScore: profile.trust_score,
    reviewCount: profile.review_count,
  }
}

/** 프로필 업데이트 (편집 화면) */
export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<{
    nickname: string
    bio: string | null
    location: string | null
    website: string | null
    kakao_id: string | null
    phone: string | null
    avatar_url: string | null
    cover_url: string | null
  }>,
): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select()
    .single()
  if (error) throw error
  return data as ProfileRow
}

// ── 통합 게시물 (내 글 탭) ────────────────────────────────────────────

/**
 * 통합 게시물 source — 광장 web profile-shell.tsx 의 POSTS_SOURCES 와 동일.
 * 각 테이블의 본문 컬럼이 다르므로 contentField 로 추적 (content / description).
 *
 * 주의: properties 는 별도 처리 (listMyPosts 가 옵션으로 합산).
 */
const POST_SOURCES: Array<{
  table: string
  kind: string
  kindLabel: string
  hrefBase: string
  titleField: string
  /** 본문/요약 컬럼 (없으면 null) */
  contentField?: "content" | "description"
}> = [
  { table: "board_posts",         kind: "board",        kindLabel: "게시판",   hrefBase: "/board",        titleField: "title",      contentField: "content" },
  { table: "sharing_posts",       kind: "sharing",      kindLabel: "나눔",     hrefBase: "/sharing",      titleField: "title",      contentField: "description" },
  { table: "group_buying_posts",  kind: "group_buying", kindLabel: "공동구매", hrefBase: "/group-buying", titleField: "title",      contentField: "description" },
  { table: "new_store_posts",     kind: "new_store",    kindLabel: "신장개업", hrefBase: "/new-store",    titleField: "store_name", contentField: "description" },
  { table: "local_food",          kind: "local_food",   kindLabel: "로컬푸드", hrefBase: "/local-food",   titleField: "title",      contentField: "description" },
  { table: "clubs",                kind: "club",         kindLabel: "모임",     hrefBase: "/clubs",        titleField: "title",      contentField: "description" },
  { table: "interior_posts",      kind: "interior",     kindLabel: "인테리어", hrefBase: "/interior",     titleField: "title",      contentField: "content" },
  { table: "moving_posts",        kind: "moving",       kindLabel: "이사",     hrefBase: "/moving",       titleField: "title",      contentField: "content" },
  { table: "cleaning_posts",      kind: "cleaning",     kindLabel: "청소",     hrefBase: "/cleaning",     titleField: "title",      contentField: "content" },
  { table: "repair_posts",        kind: "repair",       kindLabel: "수리",     hrefBase: "/repair",       titleField: "title",      contentField: "content" },
  // 매물/중고거래/구인구직 — 누락돼 있어서 "내 글" 에 표시 안 됐던 카테고리들.
  // 다른 도메인과 동일한 코드 경로로 통합 (별도 includeProperties 분기 제거).
  { table: "properties",          kind: "property",     kindLabel: "매물",     hrefBase: "/property",     titleField: "title",      contentField: "description" },
  { table: "secondhand_posts",    kind: "secondhand",   kindLabel: "농기구/자재", hrefBase: "/secondhand",   titleField: "title",      contentField: "description" },
  { table: "jobs_posts",          kind: "jobs",         kindLabel: "일손", hrefBase: "/jobs",         titleField: "title",      contentField: "description" },
]

/**
 * 내가 쓴 모든 게시글 (POST_SOURCES + 옵션으로 properties 합산).
 *
 * 광장 web profile-shell.tsx 의 posts 탭 로직과 동일:
 *   - 각 source 별 병렬 fetch (테이블 없으면 fallback [])
 *   - includeProperties=true 면 properties 도 함께 fetch 해서 kind="property" 로 합침
 *   - 호출자가 ROLE_EXCLUDE_FROM_POSTS 로 역할 전용 kind 를 필터 가능 (각 역할 탭에 이미 있으니 중복 X)
 */
export async function listMyPosts(
  supabase: SupabaseClient,
  userId: string,
  options?: { plazaId?: string; includeProperties?: boolean },
): Promise<UnifiedPost[]> {
  const plazaId = options?.plazaId
  // includeProperties 는 더 이상 사용 안 함 — properties 가 POST_SOURCES 에 통합됨.
  // 호환성 유지를 위해 파라미터는 받되 무시.
  void options?.includeProperties

  // 올리기(bump) 적용 테이블 — effective_at(= COALESCE(bumped_at, created_at)) 정렬 + 표시
  const BUMPABLE_TABLES = new Set([
    "properties", "secondhand_posts",
    "group_buying_posts", "new_store_posts", "local_food",
    "interior_posts", "moving_posts", "cleaning_posts", "repair_posts",
    "jobs_posts",
  ])

  const results = await Promise.all(
    POST_SOURCES.map(async (src) => {
      try {
        const isBumpable = BUMPABLE_TABLES.has(src.table)
        const cols = ["id", src.titleField, "images", "created_at", "plaza_id"]
        if (isBumpable) cols.push("bumped_at", "effective_at")
        if (src.contentField) cols.push(src.contentField)
        let q = supabase
          .from(src.table)
          .select(cols.join(", "))
          .eq("user_id", userId)
          .order(isBumpable ? "effective_at" : "created_at", { ascending: false })
          .limit(20)
        if (plazaId) q = q.eq("plaza_id", plazaId)
        const { data, error } = await q
        if (error) {
          // silent 실패를 디버깅하려면 로그 — 컬럼 누락/RLS 등 추적
          console.warn(`[listMyPosts] ${src.table} fetch failed:`, error.message)
          return [] as UnifiedPost[]
        }
        return ((data ?? []) as unknown as Record<string, unknown>[]).map(
          (row): UnifiedPost => ({
            id: String(row.id),
            kind: src.kind,
            kindLabel: src.kindLabel,
            title: (row[src.titleField] as string) ?? "(제목 없음)",
            excerpt: src.contentField ? (row[src.contentField] as string) ?? null : null,
            // 카드의 "방금 전" 표시 — bump 반영
            created_at: (row.effective_at ?? row.bumped_at ?? row.created_at) as string,
            href: `${src.hrefBase}/${row.id}`,
            image: Array.isArray(row.images) ? (row.images[0] as string) ?? null : null,
            plaza_id: (row.plaza_id as string) ?? null,
          }),
        )
      } catch (e: unknown) {
        console.warn(`[listMyPosts] ${src.table} exception:`, e instanceof Error ? e.message : e)
        return [] as UnifiedPost[]
      }
    }),
  )

  // properties / secondhand / jobs 도 이제 POST_SOURCES 에 포함됨 — 별도 분기 제거.
  return results
    .flat()
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at),
    )
}

/** 내 글 카운트 (모든 source 합) */
export async function countMyPosts(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const counts = await Promise.all(
    POST_SOURCES.map(async (src) => {
      try {
        const { count } = await supabase
          .from(src.table)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
        return count ?? 0
      } catch {
        return 0
      }
    }),
  )
  return counts.reduce((a, b) => a + b, 0)
}

// ── 매물 (공인중개사 전용) ─────────────────────────────────────────────

/** 내 매물 목록 (공인중개사) */
export async function listMyProperties(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string,
): Promise<Record<string, unknown>[]> {
  let q = supabase
    .from("properties")
    .select(
      "id, title, property_type, transaction_type, price, monthly_rent, area_sqm, address, images, status, views, created_at, bumped_at, effective_at, plaza_id",
    )
    .eq("user_id", userId)
    // 올리기 반영 — effective_at(= COALESCE(bumped_at, created_at)) 정렬
    .order("effective_at", { ascending: false })
    .limit(50)
  if (plazaId) q = q.eq("plaza_id", plazaId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// ── 찜 (광장 web profile-shell.tsx 의 saved 탭과 동일 11개 테이블) ────

/**
 * 찜 source 테이블 매트릭스.
 * 각 항목은 favorites 테이블 + 조인할 콘텐츠 테이블 + 표시 메타.
 */
const SAVED_SOURCES: Array<{
  /** 찜 테이블 (user_id, <fk>, created_at) */
  table: string
  /** 콘텐츠 테이블 fk 컬럼 (예: property_id, post_id, club_id) */
  fkField: string
  /** 조인할 콘텐츠 테이블 */
  joinTable: string
  /** 조인 키 컬럼 (보통 id) */
  joinId: string
  kind: string
  kindLabel: string
  hrefBase: string
  /** 콘텐츠 제목 컬럼 */
  titleField: string
  /** subtitle 으로 쓸 컬럼 (description / content / sport_type 등) */
  subtitleField?: string
}> = [
  { table: "favorites",          fkField: "property_id", joinTable: "properties",          joinId: "id", kind: "property",     kindLabel: "부동산",   hrefBase: "/property",     titleField: "title",      subtitleField: "location" },
  { table: "board_post_likes",   fkField: "post_id",     joinTable: "board_posts",         joinId: "id", kind: "board",        kindLabel: "게시판",   hrefBase: "/board",        titleField: "title",      subtitleField: "category" },
  { table: "local_food_likes",   fkField: "local_food_id", joinTable: "local_food",        joinId: "id", kind: "local_food",   kindLabel: "로컬푸드", hrefBase: "/local-food",   titleField: "title",      subtitleField: "description" },
  { table: "group_buying_wishlist", fkField: "post_id",  joinTable: "group_buying_posts",  joinId: "id", kind: "group_buying", kindLabel: "공동구매", hrefBase: "/group-buying", titleField: "title",      subtitleField: "description" },
  { table: "club_likes",         fkField: "club_id",     joinTable: "clubs",               joinId: "id", kind: "club",         kindLabel: "모임",     hrefBase: "/clubs",        titleField: "title",      subtitleField: "sport_type" },
  { table: "interior_favorites", fkField: "post_id",     joinTable: "interior_posts",      joinId: "id", kind: "interior",     kindLabel: "홈즈",     hrefBase: "/interior",     titleField: "title",      subtitleField: "content" },
  { table: "sharing_likes",      fkField: "post_id",     joinTable: "sharing_posts",       joinId: "id", kind: "sharing",      kindLabel: "나눔",     hrefBase: "/sharing",      titleField: "title",      subtitleField: "description" },
  { table: "new_store_likes",    fkField: "post_id",     joinTable: "new_store_posts",     joinId: "id", kind: "new_store",    kindLabel: "신장개업", hrefBase: "/new-store",    titleField: "store_name", subtitleField: "description" },
  { table: "moving_favorites",   fkField: "post_id",     joinTable: "moving_posts",        joinId: "id", kind: "moving",       kindLabel: "이사",     hrefBase: "/moving",       titleField: "title",      subtitleField: "content" },
  { table: "cleaning_favorites", fkField: "post_id",     joinTable: "cleaning_posts",      joinId: "id", kind: "cleaning",     kindLabel: "청소",     hrefBase: "/cleaning",     titleField: "title",      subtitleField: "content" },
  { table: "repair_favorites",   fkField: "post_id",     joinTable: "repair_posts",        joinId: "id", kind: "repair",       kindLabel: "수리",     hrefBase: "/repair",       titleField: "title",      subtitleField: "content" },
]

/**
 * 찜 목록 (광장 web profile-shell.tsx 의 saved 탭과 동일 11개 테이블 병렬).
 * 테이블이 없거나 RLS 차단 시 해당 카테고리만 빈 배열 fallback (silent).
 */
export async function listFavorites(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string | null,
): Promise<SavedItem[]> {
  const results = await Promise.all(
    SAVED_SOURCES.map(async (src) => {
      try {
        const { data: favs, error: favsErr } = await supabase
          .from(src.table)
          .select(`${src.fkField}, created_at`)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50)
        if (favsErr) {
          console.warn(`[listFavorites] ${src.table} fetch failed:`, favsErr.message)
          return [] as SavedItem[]
        }
        if (!favs || favs.length === 0) return [] as SavedItem[]
        const ids = (favs as unknown as Record<string, unknown>[]).map((f) => f[src.fkField])

        // 광장 격리 — 글 조회 시 현재 광장으로 필터 (필요한 컬럼만 선택)
        const itemCols = Array.from(
          new Set([src.joinId, src.titleField, "images", "user_id", "plaza_id", ...(src.subtitleField ? [src.subtitleField] : [])]),
        ).join(", ")
        // Dynamic table name — Supabase query builder cannot be statically typed here
        let itemsQ: DynamicQueryBuilder = supabase.from(src.joinTable).select(itemCols).in(src.joinId, ids) as unknown as DynamicQueryBuilder

        if (plazaId) itemsQ = itemsQ.eq("plaza_id", plazaId)
        const { data: items, error: itemsErr } = await itemsQ as { data: unknown; error: { message: string } | null }
        if (itemsErr) {
          console.warn(`[listFavorites] ${src.joinTable} join failed:`, itemsErr.message)
          return [] as SavedItem[]
        }
        const map = new Map<string, Record<string, unknown>>()
        for (const it of (items ?? []) as Record<string, unknown>[]) {
          map.set(String(it[src.joinId]), it)
        }
        return (favs as unknown as Record<string, unknown>[])
          .map((f) => {
            const it = map.get(String(f[src.fkField]))
            if (!it) return null
            // 자기가 작성한 글은 관심 목록에 표시하지 않음 (찜 자체는 가능하되 목록에서 숨김)
            if (it.user_id === userId) return null
            const subtitle = src.subtitleField
              ? typeof it[src.subtitleField] === "string"
                ? (it[src.subtitleField] as string).slice(0, 40)
                : null
              : null
            const images = it.images as string[] | null
            return {
              id: String(it.id),
              kind: src.kind,
              kindLabel: src.kindLabel,
              title: (it[src.titleField] as string) ?? "(제목 없음)",
              href: `${src.hrefBase}/${it.id}`,
              image: Array.isArray(images) ? images[0] ?? null : null,
              meta: subtitle,
              created_at: f.created_at as string,
              plaza_id: (it.plaza_id as string) ?? null,
            } as SavedItem
          })
          .filter(Boolean) as SavedItem[]
      } catch (e: unknown) {
        console.warn(`[listFavorites] ${src.table} exception:`, e instanceof Error ? e.message : e)
        return [] as SavedItem[]
      }
    }),
  )
  return results
    .flat()
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at),
    )
}

// ── 팔로우 ─────────────────────────────────────────────────────────────

export async function listFollowers(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string | null,
): Promise<FollowEntry[]> {
  // 광장 격리: follows.plaza_id 필터 + 표시도 plaza_profiles overlay
  let q: DynamicQueryBuilder = supabase.from("follows").select("follower_id").eq("following_id", userId) as unknown as DynamicQueryBuilder
  if (plazaId) q = q.eq("plaza_id", plazaId) as unknown as DynamicQueryBuilder
  const { data: rows } = await q as { data: FollowRow[] | null }
  if (!rows || rows.length === 0) return []
  const ids = rows.map((r) => r.follower_id!)
  return fetchFollowEntries(supabase, ids, plazaId)
}

export async function listFollowing(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string | null,
): Promise<FollowEntry[]> {
  let q: DynamicQueryBuilder = supabase.from("follows").select("following_id").eq("follower_id", userId) as unknown as DynamicQueryBuilder
  if (plazaId) q = q.eq("plaza_id", plazaId) as unknown as DynamicQueryBuilder
  const { data: rows } = await q as { data: FollowRow[] | null }
  if (!rows || rows.length === 0) return []
  const ids = rows.map((r) => r.following_id!)
  return fetchFollowEntries(supabase, ids, plazaId)
}

async function fetchFollowEntries(
  supabase: SupabaseClient,
  ids: string[],
  plazaId?: string | null,
): Promise<FollowEntry[]> {
  if (ids.length === 0) return []

  // 광장 통합: profiles에서 표시 필드, plaza_profiles에서 account_type만
  const profileQuery = supabase
    .from("profiles")
    .select("id, nickname, avatar_url, account_type")
    .in("id", ids)

  const ppQuery = plazaId
    ? (supabase as any)
        .from("plaza_profiles")
        .select("user_id, account_type")
        .in("user_id", ids)
        .eq("plaza_id", plazaId)
    : Promise.resolve({ data: [] })

  const [{ data: profs }, { data: pps }] = await Promise.all([profileQuery, ppQuery])

  const ppAccountMap = new Map<string, string>()
  for (const pp of (pps ?? []) as any[]) {
    if (pp.account_type) ppAccountMap.set(pp.user_id, pp.account_type)
  }

  const profMap = new Map<string, ProfileBriefRow>()
  for (const p of (profs ?? []) as ProfileBriefRow[]) profMap.set(p.id, p)

  return ids
    .map((id) => {
      const pr = profMap.get(id)
      if (!pr) return null
      return {
        id,
        nickname: pr.nickname,
        avatar_url: pr.avatar_url,
        account_type: ppAccountMap.get(id) ?? "user",
      } as FollowEntry
    })
    .filter(Boolean) as FollowEntry[]
}

export async function countFollowers(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", userId)
  return count ?? 0
}

export async function countFollowing(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("follower_id", userId)
  return count ?? 0
}

/**
 * 광장 격리(🅲) — 현재 광장 멤버끼리의 팔로워 카운트.
 * follows 테이블에 plaza_id 가 없으므로, follower_id 가 plaza_profiles 에
 * 등록된 사용자만 카운트.
 */
export async function countFollowersInPlaza(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string | null,
): Promise<number> {
  if (!plazaId) return countFollowers(supabase, userId)
  // 광장 멤버 ID 를 청크로 나눠 .in() 1000개 제한 회피 (perf fix)
  const memberIds = await fetchPlazaMemberIds(supabase, plazaId)
  if (memberIds.length === 0) return 0
  const chunks = chunkArray(memberIds, 500)
  const counts = await Promise.all(
    chunks.map(async (chunk) => {
      const { count } = await supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", userId)
        .in("follower_id", chunk)
      return count ?? 0
    }),
  )
  return counts.reduce((a, b) => a + b, 0)
}

export async function countFollowingInPlaza(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string | null,
): Promise<number> {
  if (!plazaId) return countFollowing(supabase, userId)
  const memberIds = await fetchPlazaMemberIds(supabase, plazaId)
  if (memberIds.length === 0) return 0
  const chunks = chunkArray(memberIds, 500)
  const counts = await Promise.all(
    chunks.map(async (chunk) => {
      const { count } = await supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("follower_id", userId)
        .in("following_id", chunk)
      return count ?? 0
    }),
  )
  return counts.reduce((a, b) => a + b, 0)
}

/** 광장 멤버 ID 를 페이지네이션으로 전량 조회 (user_id 만, 최대 10000) */
async function fetchPlazaMemberIds(
  supabase: SupabaseClient,
  plazaId: string,
): Promise<string[]> {
  const PAGE = 1000
  const ids: string[] = []
  for (let offset = 0; offset < 10000; offset += PAGE) {
    const { data } = await supabase
      .from("plaza_profiles")
      .select("user_id")
      .eq("plaza_id", plazaId)
      .range(offset, offset + PAGE - 1)
    const rows = (data ?? []) as Array<{ user_id: string }>
    ids.push(...rows.map((m) => m.user_id))
    if (rows.length < PAGE) break
  }
  return ids
}

/** 배열을 지정된 크기로 분할 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/** 팔로우 여부 — viewer 가 target 을 팔로우 중인가 */
export async function isFollowing(
  supabase: SupabaseClient,
  viewerId: string,
  targetId: string,
): Promise<boolean> {
  if (viewerId === targetId) return false
  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", viewerId)
    .eq("following_id", targetId)
    .maybeSingle()
  return !!data
}

/** 팔로우 토글 — 광장 web `follow-button` 컴포넌트와 동일 동작 */
export async function toggleFollow(
  supabase: SupabaseClient,
  args: {
    viewerId: string
    targetId: string
    isFollowing: boolean
    // 🅲 광장 격리 — 어떤 광장에서 일어난 follow 인지 기록
    plazaId?: string | null
  },
): Promise<boolean> {
  if (args.viewerId === args.targetId) return false
  if (args.isFollowing) {
    let q: DynamicQueryBuilder = supabase
      .from("follows")
      .delete()
      .eq("follower_id", args.viewerId)
      .eq("following_id", args.targetId) as unknown as DynamicQueryBuilder
    if (args.plazaId) q = q.eq("plaza_id", args.plazaId) as unknown as DynamicQueryBuilder
    const { error } = await q
    if (error) throw error
    return false
  }
  const insertRow: Record<string, string> = {
    follower_id: args.viewerId,
    following_id: args.targetId,
  }
  if (args.plazaId) insertRow.plaza_id = args.plazaId
  const { error } = await supabase.from("follows").insert(insertRow)
  if (error && (error as SupabaseErrorWithCode).code !== "23505") throw error

  // 새 팔로우(중복 23505 아님)인 경우에만 알림 발송
  // 23505 = 이미 팔로우 중 → 알림 중복 방지
  if (!error) {
    try {
      // viewer 닉네임 조회 (메시지 본문에 사용)
      const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", args.viewerId)
        .maybeSingle()
      const viewerNick = (viewerProfile as { nickname: string | null } | null)?.nickname || "누군가"
      const notifRow: Record<string, string> = {
        user_id: args.targetId,
        type: "follow",
        title: "새 팔로워",
        message: `${viewerNick}님이 회원님을 팔로우했습니다`,
        link: `/profile/${args.viewerId}`,
        actor_id: args.viewerId,
      }
      if (args.plazaId) notifRow.plaza_id = args.plazaId
      await supabase.from("notifications").insert(notifRow)
    } catch {
      // 알림 실패는 follow 자체에 영향 없음 — 무시
    }
  }
  return true
}

// ── 사용자 차단 (block_users) ───────────────────────────────────────────
//
// 글로벌 차단 (광장 무관). 차단 시 차단 대상의 글·댓글·DM 이
// 클라이언트 쿼리에서 in-memory 필터됨.
// RLS: blocker 본인만 SELECT/INSERT/DELETE 가능.

export interface BlockedUserRow {
  blocked_id: string
  created_at: string
  nickname?: string | null
  avatar_url?: string | null
}

/** 본인이 차단한 사용자 ID 집합 */
export async function listBlockedUserIds(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("block_users")
    .select("blocked_id")
    .eq("blocker_id", viewerId)
  return new Set(((data ?? []) as Array<{ blocked_id: string }>).map((r) => r.blocked_id))
}

/** 본인이 차단한 사용자 + 프로필 정보 (mypage 차단 관리 페이지용) */
export async function listBlockedUsers(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<BlockedUserRow[]> {
  const { data } = await supabase
    .from("block_users")
    .select("blocked_id, created_at")
    .eq("blocker_id", viewerId)
    .order("created_at", { ascending: false })
  const rows = (data ?? []) as Array<{ blocked_id: string; created_at: string }>
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.blocked_id)
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url")
    .in("id", ids)
  const profMap = new Map<string, { id: string; nickname: string | null; avatar_url: string | null }>(
    ((profs ?? []) as Array<{ id: string; nickname: string | null; avatar_url: string | null }>).map((p) => [p.id, p]),
  )
  return rows.map((r) => ({
    blocked_id: r.blocked_id,
    created_at: r.created_at,
    nickname: profMap.get(r.blocked_id)?.nickname ?? null,
    avatar_url: profMap.get(r.blocked_id)?.avatar_url ?? null,
  }))
}

export async function blockUser(
  supabase: SupabaseClient,
  args: { viewerId: string; targetId: string },
): Promise<void> {
  if (args.viewerId === args.targetId) return
  const { error } = await supabase
    .from("block_users")
    .insert({ blocker_id: args.viewerId, blocked_id: args.targetId })
  // 중복(23505) 은 무시
  if (error && (error as SupabaseErrorWithCode).code !== "23505") throw error
}

export async function unblockUser(
  supabase: SupabaseClient,
  args: { viewerId: string; targetId: string },
): Promise<void> {
  const { error } = await supabase
    .from("block_users")
    .delete()
    .eq("blocker_id", args.viewerId)
    .eq("blocked_id", args.targetId)
  if (error) throw error
}

export async function isUserBlocked(
  supabase: SupabaseClient,
  args: { viewerId: string; targetId: string },
): Promise<boolean> {
  const { data } = await supabase
    .from("block_users")
    .select("blocked_id")
    .eq("blocker_id", args.viewerId)
    .eq("blocked_id", args.targetId)
    .maybeSingle()
  return !!data
}

// ── 푸시 토큰 (user_push_tokens) ────────────────────────────────────────
//
// expo-notifications 가 발급한 ExponentPushToken 을 저장.
// 토큰 재발급 시 upsert. 로그아웃 시 removePushToken.

export async function registerPushToken(
  supabase: SupabaseClient,
  args: {
    userId: string
    token: string
    platform: "ios" | "android" | "web"
    provider?: "expo" | "fcm" | "apns"
    deviceId?: string
  },
): Promise<void> {
  const { error } = await supabase
    .from("user_push_tokens")
    .upsert(
      {
        user_id: args.userId,
        token: args.token,
        platform: args.platform,
        provider: args.provider ?? "expo",
        device_id: args.deviceId ?? null,
      },
      { onConflict: "user_id,token" },
    )
  if (error) throw error
}

export async function removePushToken(
  supabase: SupabaseClient,
  args: { userId: string; token: string },
): Promise<void> {
  const { error } = await supabase
    .from("user_push_tokens")
    .delete()
    .eq("user_id", args.userId)
    .eq("token", args.token)
  if (error) throw error
}

// ── 후기 ───────────────────────────────────────────────────────────────

export async function listReviews(
  supabase: SupabaseClient,
  userId: string,
): Promise<ReviewEntry[]> {
  const { data } = await supabase
    .from("reviews")
    .select("id, reviewer_id, reviewer_name, response_speed, accuracy, kindness, total_score, content, created_at")
    .eq("reviewed_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)
  return (data ?? []) as ReviewEntry[]
}

// ── 하이라이트 ─────────────────────────────────────────────────────────

export async function listHighlights(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string | null,
): Promise<ProfileHighlight[]> {
  // DB 실제 컬럼은 sort_order — order_index 는 fallback (구버전 호환)
  // 광장 격리(🅲): plazaId 주어지면 그 광장 하이라이트만
  let q: DynamicQueryBuilder = supabase
    .from("profile_highlights")
    .select("id, user_id, title, cover_url, media_url, media_type, duration_ms, link_url, sort_order, order_index, plaza_id, created_at")
    .eq("user_id", userId) as unknown as DynamicQueryBuilder
  if (plazaId) q = q.eq("plaza_id", plazaId) as unknown as DynamicQueryBuilder

  const { data } = await q.order("sort_order", { ascending: true })
  return (data ?? []) as ProfileHighlight[]
}

export async function deleteHighlight(
  supabase: SupabaseClient,
  highlightId: string,
): Promise<void> {
  const { error } = await supabase
    .from("profile_highlights")
    .delete()
    .eq("id", highlightId)
  if (error) throw error
}

/**
 * 하이라이트 생성 — 광장 web /mypage/highlights 페이지와 동일 동작.
 * sort_order 는 호출자가 결정 (max+1).
 * 현 단계: image 만 지원. video 는 호출자가 mediaType="video" 로 보내지만
 * 모바일에선 사용하지 않음.
 */
export async function createHighlight(
  supabase: SupabaseClient,
  input: {
    userId: string
    title: string
    coverUrl: string | null
    mediaUrl?: string | null
    mediaType?: "image" | "video"
    durationMs?: number
    linkUrl?: string | null
    sortOrder?: number
    plazaId?: string | null
  },
): Promise<ProfileHighlight> {
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    title: input.title,
    cover_url: input.coverUrl,
    media_url: input.mediaUrl ?? input.coverUrl,
    media_type: input.mediaType ?? "image",
    duration_ms: input.durationMs ?? 5000,
    link_url: input.linkUrl ?? null,
    sort_order: input.sortOrder ?? 0,
  }
  if (input.plazaId) payload.plaza_id = input.plazaId
  const { data, error } = await supabase
    .from("profile_highlights")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as ProfileHighlight
}

/** 하이라이트 부분 업데이트 — title / cover_url / link_url 등 */
export async function updateHighlight(
  supabase: SupabaseClient,
  id: string,
  patch: {
    title?: string
    cover_url?: string | null
    media_url?: string | null
    media_type?: "image" | "video"
    link_url?: string | null
    sort_order?: number
  },
): Promise<void> {
  const { error } = await supabase
    .from("profile_highlights")
    .update(patch)
    .eq("id", id)
  if (error) throw error
}

export async function reorderHighlights(
  supabase: SupabaseClient,
  highlights: { id: string; order_index: number }[],
): Promise<void> {
  // 단순 — 배치 업데이트 (RLS 가 본인만 허용)
  await Promise.all(
    highlights.map((h) =>
      supabase
        .from("profile_highlights")
        .update({ order_index: h.order_index })
        .eq("id", h.id),
    ),
  )
}

// ── 포인트 ─────────────────────────────────────────────────────────────

export async function getPointBalance(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string,
): Promise<number> {
  // user_points PK 는 user_id 만 (plaza 격리 제거됨).
  // plazaId 인자는 하위 호환용으로 받되, 필터에는 사용하지 않음.
  const { data } = await supabase
    .from("user_points")
    .select("available")
    .eq("user_id", userId)
    .maybeSingle()
  return (data as UserPointsRow | null)?.available ?? 0
}

export async function listPointHistory(
  supabase: SupabaseClient,
  userId: string,
  opts: { cursor?: number; limit?: number } = {},
): Promise<{ items: PointHistoryEntry[]; nextCursor: number | null }> {
  const limit = opts.limit ?? 30
  const cursor = opts.cursor ?? 0
  const { data } = await supabase
    .from("point_transactions")
    .select("id, user_id, type, amount, source, status, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(cursor, cursor + limit - 1)
  const items = (data ?? []) as PointHistoryEntry[]
  return {
    items,
    nextCursor: items.length === limit ? cursor + limit : null,
  }
}

// ── 주문 ───────────────────────────────────────────────────────────────

/**
 * 주문 목록 — local_food + group_buying 통합.
 * role 에 따라 buyer/seller 구분.
 */
export async function listOrders(
  supabase: SupabaseClient,
  userId: string,
  role: "buyer" | "seller",
): Promise<OrderEntry[]> {
  const userField = role === "buyer" ? "buyer_id" : "seller_id"
  // 두 테이블 동시 조회
  async function fetchLocalFood(): Promise<OrderEntry[]> {
    try {
      const { data } = await supabase
        .from("local_food_orders")
        .select(
          "id, status, unit_price, quantity, amount, receive_method, tracking_carrier, tracking_number, buyer_id, seller_id, created_at, local_food:local_food_id(title, images)",
        )
        .eq(userField, userId)
        .order("created_at", { ascending: false })
        .limit(50)
      return (data ?? []).map(
        (r: Record<string, unknown>): OrderEntry => {
          const localFood = r.local_food as { title?: string; images?: string[] } | null
          return {
            id: r.id as string,
            domain: "local_food",
            status: r.status as OrderEntry["status"],
            product_name: localFood?.title ?? "(상품 정보 없음)",
            product_image: localFood?.images?.[0] ?? null,
            unit_price: r.unit_price as number,
            quantity: r.quantity as number,
            amount: r.amount as number,
            receive_method: r.receive_method as OrderEntry["receive_method"],
            tracking_carrier: r.tracking_carrier as string | null,
            tracking_number: r.tracking_number as string | null,
            buyer_id: r.buyer_id as string,
            seller_id: r.seller_id as string,
            created_at: r.created_at as string,
          }
        },
      )
    } catch {
      return []
    }
  }

  async function fetchGroupBuying(): Promise<OrderEntry[]> {
    try {
      const filterField =
        role === "buyer" ? "user_id" : "group_buying_posts.user_id"
      const { data } = await supabase
        .from("group_buying_participants")
        .select(
          "post_id, payment_status, quantity, paid_at, tracking_carrier, tracking_number, user_id, created_at, group_buying_posts:post_id(title, images, user_id, price)",
        )
        .eq(filterField, userId)
        .order("created_at", { ascending: false })
        .limit(50)
      return (data ?? []).map(
        (r: Record<string, unknown>): OrderEntry => {
          const gbPost = r.group_buying_posts as { title?: string; images?: string[]; user_id?: string; price?: number } | null
          return {
            id: `${r.post_id}_${r.user_id}`,
            domain: "group_buying",
            status: r.payment_status as OrderEntry["status"],
            product_name: gbPost?.title ?? "(상품 정보 없음)",
            product_image: gbPost?.images?.[0] ?? null,
            unit_price: gbPost?.price ?? 0,
            quantity: (r.quantity as number) ?? 1,
            amount: (gbPost?.price ?? 0) * ((r.quantity as number) ?? 1),
            tracking_carrier: r.tracking_carrier as string | null,
            tracking_number: r.tracking_number as string | null,
            buyer_id: r.user_id as string,
            seller_id: gbPost?.user_id ?? "",
            created_at: r.created_at as string,
          }
        },
      )
    } catch {
      return []
    }
  }

  const [localFood, groupBuying] = await Promise.all([
    fetchLocalFood(),
    fetchGroupBuying(),
  ])
  return [...localFood, ...groupBuying].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

/**
 * 발송 처리 — 판매자가 운송장 입력. status: paid → shipped.
 * domain 별 테이블에 tracking_carrier / tracking_number / shipped_at 기록.
 */
export async function markOrderShipped(
  supabase: SupabaseClient,
  order: { id: string; domain: "local_food" | "group_buying"; seller_id: string },
  tracking: { carrier: string; number: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const now = new Date().toISOString()
    if (order.domain === "local_food") {
      const { error } = await supabase
        .from("local_food_orders")
        .update({
          status: "shipped",
          tracking_carrier: tracking.carrier,
          tracking_number: tracking.number,
          shipped_at: now,
        })
        .eq("id", order.id)
        .eq("seller_id", order.seller_id)
      if (error) return { ok: false, error: error.message }
    } else {
      const [postId, userId] = order.id.split("_")
      if (!postId || !userId) return { ok: false, error: "잘못된 주문 ID" }
      const { error } = await supabase
        .from("group_buying_participants")
        .update({
          payment_status: "shipped",
          tracking_carrier: tracking.carrier,
          tracking_number: tracking.number,
          shipped_at: now,
        })
        .eq("post_id", postId)
        .eq("user_id", userId)
      if (error) return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "처리 실패" }
  }
}

/**
 * 수령 완료 — 구매자가 직접 클릭. status: shipped → completed.
 * domain 별로 다른 테이블 (local_food_orders / group_buying_participants).
 */
export async function confirmOrderReceived(
  supabase: SupabaseClient,
  order: { id: string; domain: "local_food" | "group_buying"; buyer_id: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (order.domain === "local_food") {
      const { error } = await supabase
        .from("local_food_orders")
        .update({ status: "completed", received_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("buyer_id", order.buyer_id)
        .eq("status", "shipped")
      if (error) return { ok: false, error: error.message }
    } else {
      // group_buying_participants: id 는 `${post_id}_${user_id}` 합성 (mobile/web 공통)
      const [postId, userId] = order.id.split("_")
      if (!postId || !userId) return { ok: false, error: "잘못된 주문 ID" }
      const { error } = await supabase
        .from("group_buying_participants")
        .update({
          payment_status: "completed",
          received_at: new Date().toISOString(),
        })
        .eq("post_id", postId)
        .eq("user_id", userId)
        .eq("payment_status", "shipped")
      if (error) return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "처리 실패" }
  }
}

// ── 정산 / 구독 ────────────────────────────────────────────────────────

export async function getSettlementAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<SettlementAccount | null> {
  const { data } = await supabase
    .from("producer_settlements")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  return data as SettlementAccount | null
}

export async function getCurrentSubscription(
  supabase: SupabaseClient,
  userId: string,
  plazaId: string,
): Promise<SubscriptionInfo | null> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select(
      "id, status, current_period_end, is_early_bird, applied_discount_pct, plan_id",
    )
    .eq("user_id", userId)
    .eq("plaza_id", plazaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!sub) return null
  const s = sub as SubscriptionRow
  // plan_id가 있으면 plan 이름을 병렬로 조회 (이전: 직렬 조회)
  const planId = s.plan_id

  const planNameResult = planId
    ? supabase.from("subscription_plans").select("name").eq("id", planId).maybeSingle()
    : Promise.resolve({ data: null })
  const { data: plan } = await planNameResult
  const p = plan as SubscriptionPlanRow | null
  return {
    plan_id: planId ?? null,
    plan_name: p?.name ?? null,
    status: s.status as SubscriptionInfo["status"],
    current_period_end: s.current_period_end,
    is_early_bird: s.is_early_bird ?? false,
    applied_discount_pct: s.applied_discount_pct ?? 0,

  }
}

// ── 계정 삭제 ──────────────────────────────────────────────────────────

/**
 * 계정 삭제 — Supabase auth.users 삭제는 service role 필요 → API 호출 권장.
 * Phase 2C 에선 광장 web 의 /api/account/delete 호출 (구현 가정).
 */
export async function deleteAccount(): Promise<void> {
  // 광장 API 가 처리. RN 측은 호출만.
  // 실제 구현은 mobile 측에서 gwangjangFetch('/api/account/delete', { method: 'POST' })
  throw new Error(
    "deleteAccount is implemented at app level via gwangjangFetch — see settings screen",
  )
}
