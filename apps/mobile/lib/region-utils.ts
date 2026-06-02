/**
 * region-utils — 광장의 시/군 region 조회 + 주소 파싱 + AsyncStorage 선호도.
 *
 * regions 테이블: level=1 (시/군) + plaza_id 별 시드 (예: 춘천광장 = 춘천시/홍천군/...)
 * 글에는 region_id UUID FK 가 들어감 (NULL = 전체 지역 글).
 *
 * 주소 파싱: 한국 주소 문자열("강원도 춘천시 효자동 ...") → 시/군 이름 매칭
 * → region_id 반환.
 */

import AsyncStorage from "@react-native-async-storage/async-storage"
import { getSupabase } from "@/lib/supabase"

export interface Region {
  id: string
  name: string         // 예: "춘천시", "화천군"
  plaza_id: string
  sort_order: number
}

// ── 광장별 region 캐시 (앱 라이프타임 메모리) ───────────────────────────
const _regionsCache = new Map<string, Region[]>()
const _regionsPromise = new Map<string, Promise<Region[]>>()

/**
 * 광장의 시/군 region 목록 (level=1) 을 정렬해서 반환. 결과 캐시됨.
 */
export async function listPlazaRegions(plazaId: string): Promise<Region[]> {
  if (!plazaId) return []
  const cached = _regionsCache.get(plazaId)
  if (cached) return cached
  const inflight = _regionsPromise.get(plazaId)
  if (inflight) return inflight

  const p = (async () => {
    const { data, error } = await getSupabase()
      .from("regions")
      .select("id, name, plaza_id, sort_order")
      .eq("plaza_id", plazaId)
      .eq("level", 1)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
    if (error) {
      console.warn("[listPlazaRegions] failed:", error.message)
      return [] as Region[]
    }
    const regions = (data ?? []) as Region[]
    _regionsCache.set(plazaId, regions)
    return regions
  })()
  _regionsPromise.set(plazaId, p)
  try {
    return await p
  } finally {
    _regionsPromise.delete(plazaId)
  }
}

/**
 * 시/군 region 의 하위 동/면 목록 (level=2) — 부모 region_id 기준 조회.
 */
const _dongCache = new Map<string, Region[]>()
export async function listChildDongs(parentRegionId: string): Promise<Region[]> {
  if (!parentRegionId) return []
  const cached = _dongCache.get(parentRegionId)
  if (cached) return cached
  const { data, error } = await getSupabase()
    .from("regions")
    .select("id, name, plaza_id, sort_order")
    .eq("parent_id", parentRegionId)
    .eq("level", 2)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
  if (error) {
    console.warn("[listChildDongs] failed:", error.message)
    return []
  }
  const dongs = (data ?? []) as Region[]
  _dongCache.set(parentRegionId, dongs)
  return dongs
}

/**
 * 캐시 무효화 (region 추가/수정/삭제 시 호출).
 */
export function clearRegionCache(plazaId?: string) {
  if (plazaId) _regionsCache.delete(plazaId)
  else _regionsCache.clear()
}

// ── 주소 파싱 ────────────────────────────────────────────────────────────

/**
 * 주소 문자열에서 광장의 시/군 region 을 매칭해 region_id 반환.
 *
 * 예시:
 *   "강원특별자치도 춘천시 효자동 123" + 춘천광장 regions → "춘천시" → region.id
 *   "강원도 화천군 사내면" + 춘천광장 regions → "화천군" → region.id
 *   "서울특별시 강남구 ..." + 춘천광장 regions → null (광장 외부)
 *
 * 매칭 안 되면 null 반환 (→ "전체 지역" 글로 처리).
 */
export function parseRegionFromAddress(
  address: string | null | undefined,
  regions: Region[],
): string | null {
  if (!address || regions.length === 0) return null
  const text = String(address)
  // 긴 이름 우선 매칭 (예: "춘천시" 가 "춘천" 보다 먼저 매칭되도록)
  const sorted = [...regions].sort((a, b) => b.name.length - a.name.length)
  for (const r of sorted) {
    if (text.includes(r.name)) return r.id
  }
  return null
}

// ── AsyncStorage 선호도 (다중 선택 + 광장별) ────────────────────────────

const PREFS_KEY = (plazaId: string) => `region.selected.v1:${plazaId}`

export type RegionSelection =
  | { kind: "all" }                     // 전체 (광장의 모든 시/군)
  | { kind: "ids"; ids: string[] }      // 특정 시/군 선택 (다중 가능)

/**
 * 광장별 선택 region 저장. AsyncStorage 에 JSON 으로 영속.
 */
export async function saveRegionSelection(
  plazaId: string,
  selection: RegionSelection,
): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY(plazaId), JSON.stringify(selection))
  } catch {
    /* noop */
  }
}

/**
 * 저장된 region 선택 반환. 없으면 null (호출자가 default 결정 — 보통 가입 region).
 */
export async function loadRegionSelection(
  plazaId: string,
): Promise<RegionSelection | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY(plazaId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.kind === "all") return { kind: "all" }
    if (parsed?.kind === "ids" && Array.isArray(parsed.ids))
      return { kind: "ids", ids: parsed.ids.map(String) }
    return null
  } catch {
    return null
  }
}

/**
 * 사용자의 가입 지역에 매칭되는 region 한 개 ID 반환.
 * 🅲 광장 격리 — plaza_profiles.region_id 우선, 없으면 plaza_profiles.location,
 * 그래도 없으면 global profiles.location 폴백 (legacy 호환).
 */
export async function resolveUserDefaultRegion(
  userId: string | null | undefined,
  plazaId: string,
): Promise<string | null> {
  if (!userId || !plazaId) return null
  try {
    const supabase = getSupabase()
    const [ppRes, profRes, regions] = await Promise.all([
      supabase
        .from("plaza_profiles")
        .select("region_id, location")
        .eq("user_id", userId)
        .eq("plaza_id", plazaId)
        .maybeSingle(),
      supabase.from("profiles").select("location").eq("id", userId).maybeSingle(),
      listPlazaRegions(plazaId),
    ])
    const pp: any = ppRes.data
    // 1) plaza_profile.region_id 가 있으면 그대로 반환 (가장 정확)
    if (pp?.region_id) {
      // 해당 region 이 현재 광장에 속하는지 검증
      const found = regions.find((r) => r.id === pp.region_id)
      if (found) return found.id
    }
    // 2) plaza_profile.location 에서 매칭
    if (pp?.location) {
      const r = parseRegionFromAddress(pp.location, regions)
      if (r) return r
    }
    // 3) global profile.location 폴백
    const gloc = (profRes.data as any)?.location as string | undefined
    return parseRegionFromAddress(gloc ?? null, regions)
  } catch {
    return null
  }
}
