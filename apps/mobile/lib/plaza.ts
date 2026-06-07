/**
 * Plaza state — 허브에서 선택한 광장 ID 를 AsyncStorage 에 저장 / 전역 구독.
 *
 * web 의 host/cookie 기반 컨텍스트 대신, RN 은 AsyncStorage + 모듈 listener 사용.
 * (tabs)/* 화면들이 useCurrentPlaza() 로 현재 plaza 를 읽고, 허브에서 변경 시
 * 자동 리렌더링됨.
 */

import { useEffect, useState } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"

export const SELECTED_PLAZA_KEY = "selected.plaza"
export const SELECTED_PLAZA_NAME_KEY = "selected.plaza.name"
export const DEFAULT_PLAZA_FALLBACK = "gangwon"
export const DEFAULT_PLAZA_NAME_FALLBACK = "강원 전원일기"

// 모바일에서 강제 차단되는 광장 — DB is_active 무시하고 모든 진입점에서 거부
// (cached value / deep link / push notification 으로도 leak 방지)
// 전원일기: 도 단위 재편으로 차단 대상 없음 (필요 시 도 id 추가)
export const HIDDEN_PLAZA_IDS = new Set<string>([])
export const HIDDEN_PLAZA_NAMES = new Set<string>([])

function isHiddenPlaza(id?: string | null, name?: string | null): boolean {
  if (id && HIDDEN_PLAZA_IDS.has(id)) return true
  if (name && HIDDEN_PLAZA_NAMES.has(name)) return true
  return false
}

interface PlazaState { id: string; name: string }

let cached: PlazaState | null = null
const listeners = new Set<(p: PlazaState) => void>()

export async function loadSelectedPlaza(): Promise<PlazaState> {
  try {
    const id = await AsyncStorage.getItem(SELECTED_PLAZA_KEY)
    const name = await AsyncStorage.getItem(SELECTED_PLAZA_NAME_KEY)
    // 차단된 광장이 cache 로 들어오면 default 로 강제 복귀
    if (isHiddenPlaza(id, name)) {
      try {
        await AsyncStorage.removeItem(SELECTED_PLAZA_KEY)
        await AsyncStorage.removeItem(SELECTED_PLAZA_NAME_KEY)
      } catch {}
      cached = { id: DEFAULT_PLAZA_FALLBACK, name: DEFAULT_PLAZA_NAME_FALLBACK }
      return cached
    }
    cached = {
      id: id && id.length > 0 ? id : DEFAULT_PLAZA_FALLBACK,
      name: name && name.length > 0 ? name : DEFAULT_PLAZA_NAME_FALLBACK,
    }
  } catch {
    cached = { id: DEFAULT_PLAZA_FALLBACK, name: DEFAULT_PLAZA_NAME_FALLBACK }
  }
  return cached
}

export async function setSelectedPlaza(plazaId: string, plazaName?: string): Promise<void> {
  // 차단된 광장은 set 거부 — silent no-op (deep link / push notification 으로 우회 차단)
  if (isHiddenPlaza(plazaId, plazaName)) return
  const prev = cached
  const next: PlazaState = {
    id: plazaId,
    name: plazaName ?? cached?.name ?? DEFAULT_PLAZA_NAME_FALLBACK,
  }
  cached = next
  try { await AsyncStorage.setItem(SELECTED_PLAZA_KEY, plazaId) } catch {}
  if (plazaName) {
    try { await AsyncStorage.setItem(SELECTED_PLAZA_NAME_KEY, plazaName) } catch {}
  }
  // 광장 변경 시 이전 광장의 동네 선택 초기화 (광장간 region 격리 유지)
  if (prev && prev.id !== plazaId) {
    try { await AsyncStorage.removeItem("user-location") } catch {}
    // 광장 전환 시 signOut 제거 — 배민스타일 홈에서 광장을 자유롭게 전환할 수 있도록
  }
  listeners.forEach((fn) => { try { fn(next) } catch {} })
  // 최근 광장 기록 (최대 4개, 중복 제거)
  try {
    const raw = await AsyncStorage.getItem("recent_plazas")
    const prev_list: Array<{ id: string; name: string }> = raw ? JSON.parse(raw) : []
    const updated = [{ id: plazaId, name: next.name }, ...prev_list.filter((p) => p.id !== plazaId)].slice(0, 4)
    await AsyncStorage.setItem("recent_plazas", JSON.stringify(updated))
  } catch {}
}

export function getCachedPlaza(): PlazaState {
  return cached ?? { id: DEFAULT_PLAZA_FALLBACK, name: DEFAULT_PLAZA_NAME_FALLBACK }
}

/** 최근 선택한 광장 목록 (최대 4개, 차단 광장 제외) */
export async function getRecentPlazas(): Promise<Array<{ id: string; name: string }>> {
  try {
    const raw = await AsyncStorage.getItem("recent_plazas")
    if (!raw) return []
    const list: Array<{ id: string; name: string }> = JSON.parse(raw)
    return list.filter((p) => p && p.id && !isHiddenPlaza(p.id, p.name)).slice(0, 4)
  } catch {
    return []
  }
}

/** 현재 선택된 plaza id 를 반환. 마운트 시 AsyncStorage 에서 로드, 변경 구독 */
export function useCurrentPlaza(): string {
  return useCurrentPlazaState().id
}

/** 현재 선택된 plaza id+name 을 반환 */
export function useCurrentPlazaState(): PlazaState {
  const [state, setState] = useState<PlazaState>(
    cached ?? { id: DEFAULT_PLAZA_FALLBACK, name: DEFAULT_PLAZA_NAME_FALLBACK },
  )

  useEffect(() => {
    let mounted = true
    if (cached == null) {
      loadSelectedPlaza().then((p) => { if (mounted) setState(p) })
    } else {
      setState(cached)
    }
    const fn = (p: PlazaState) => { if (mounted) setState(p) }
    listeners.add(fn)
    return () => { mounted = false; listeners.delete(fn) }
  }, [])

  return state
}

// ════════════════════════════════════════════════════════════════════════════
// 시/군 지역 (plaza=도 내부의 세부 지역) — 헤더 표시 + 글 개인화에 사용
// 저장 키는 plaza 별로 분리 (도 격리 유지)
// ════════════════════════════════════════════════════════════════════════════
export const DEFAULT_REGION = "홍천군"
let cachedRegion: string | null = null
const regionListeners = new Set<(r: string) => void>()

const regionKey = (plazaId: string) => `selected.region.${plazaId}`
const recentRegionKey = (plazaId: string) => `recent_regions.${plazaId}`

export async function loadSelectedRegion(plazaId: string): Promise<string> {
  try {
    const r = await AsyncStorage.getItem(regionKey(plazaId))
    cachedRegion = r && r.length > 0 ? r : DEFAULT_REGION
  } catch {
    cachedRegion = DEFAULT_REGION
  }
  return cachedRegion
}

export async function setSelectedRegion(plazaId: string, region: string): Promise<void> {
  cachedRegion = region
  try { await AsyncStorage.setItem(regionKey(plazaId), region) } catch {}
  regionListeners.forEach((fn) => { try { fn(region) } catch {} })
  // 최근 지역 기록 (최대 4, 중복 제거)
  try {
    const raw = await AsyncStorage.getItem(recentRegionKey(plazaId))
    const prev: string[] = raw ? JSON.parse(raw) : []
    const updated = [region, ...prev.filter((x) => x !== region)].slice(0, 4)
    await AsyncStorage.setItem(recentRegionKey(plazaId), JSON.stringify(updated))
  } catch {}
}

export async function getRecentRegions(plazaId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(recentRegionKey(plazaId))
    return raw ? (JSON.parse(raw) as string[]).filter(Boolean).slice(0, 4) : []
  } catch {
    return []
  }
}

/** 현재 plaza 의 선택된 시/군 (헤더 표시용) — 변경 구독 */
export function useCurrentRegion(plazaId: string): string {
  const [region, setRegion] = useState<string>(cachedRegion ?? DEFAULT_REGION)
  useEffect(() => {
    let mounted = true
    loadSelectedRegion(plazaId).then((r) => { if (mounted) setRegion(r) })
    const fn = (r: string) => { if (mounted) setRegion(r) }
    regionListeners.add(fn)
    return () => { mounted = false; regionListeners.delete(fn) }
  }, [plazaId])
  return region
}

/**
 * 광장 ID → 도시 이름 (헤더 표시용).
 * "원주광장" → "원주" 처럼 "광장" suffix 제거. fallback 은 id.
 */
export function plazaCityName(plazaIdOrName: string): string {
  return plazaIdOrName.replace(/광장$/, "")
}

/**
 * 도(道) id → 정식 지명. 허브/카드에서 "강원 전원일기" 대신 "강원도" 로 표시.
 * (DB name 은 그대로, 표시만 변환 — 웹 provinceName 과 동일 매핑)
 */
const PROVINCE_NAMES: Record<string, string> = {
  gangwon: "강원도",
  gyeonggi: "경기도",
  chungbuk: "충청북도",
  chungnam: "충청남도",
  jeonbuk: "전라북도",
  jeonnam: "전라남도",
  gyeongbuk: "경상북도",
  gyeongnam: "경상남도",
  jeju: "제주도",
}

export function provinceName(id?: string | null, fallbackName?: string | null): string {
  if (id && PROVINCE_NAMES[id]) return PROVINCE_NAMES[id]
  if (fallbackName) return fallbackName.replace(/\s*전원일기$/, "").replace(/광장$/, "").trim() || "전원일기"
  return "전원일기"
}

/**
 * 도(道)별 자연색 — 허브 카드 그라데이션 (웹 provinceColors() 와 동일 매핑).
 * 농촌 톤: 산·논·황토·바다·유채. 다크 톤이라 흰 글씨 대비 OK.
 */
const PROVINCE_COLORS: Record<string, { from: string; mid: string; to: string; chip: string }> = {
  gangwon:   { from: "#3a7a4d", mid: "#225a39", to: "#143524", chip: "#6ee7b7" },
  gyeonggi:  { from: "#c19143", mid: "#8e6526", to: "#4f3815", chip: "#fde68a" },
  chungbuk:  { from: "#c08758", mid: "#8a5a32", to: "#52341a", chip: "#fed7aa" },
  chungnam:  { from: "#4f8492", mid: "#345b66", to: "#1d343a", chip: "#a5d8e0" },
  jeonbuk:   { from: "#b88a3b", mid: "#84621f", to: "#473511", chip: "#fcd34d" },
  jeonnam:   { from: "#5a9050", mid: "#3a6c33", to: "#1f3f1c", chip: "#bbf7d0" },
  gyeongbuk: { from: "#2f6135", mid: "#1f4225", to: "#102214", chip: "#86efac" },
  gyeongnam: { from: "#4d8a7e", mid: "#326056", to: "#1a3631", chip: "#99e9d3" },
  jeju:      { from: "#d9a93b", mid: "#a87b1f", to: "#5e430f", chip: "#fed94f" },
}

const DEFAULT_PROVINCE_COLOR = PROVINCE_COLORS.gangwon

export function provinceColors(id?: string | null) {
  if (id && PROVINCE_COLORS[id]) return PROVINCE_COLORS[id]
  return DEFAULT_PROVINCE_COLOR
}

/** 전원일기 웹 도메인 (단일 도메인 — 지역 구분은 ?plaza= 쿼리). env 로 오버라이드 가능. */
const WEB_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? "https://jeonwondiary.vercel.app").replace(/\/$/, "")

/**
 * 공유 URL 빌더 — 단일 도메인 + ?plaza= 쿼리 (웹 buildPlazaUrl 의 vercel.app 분기와 동일).
 *   buildShareUrl("secondhand", "abc", "gangwon")
 *     → "https://jeonwondiary.vercel.app/secondhand/abc?plaza=gangwon"
 *
 * postPlazaId 우선 (게시글이 속한 지역), 없으면 현재 viewer 지역.
 * 다른 지역(cross-plaza) 공유 시에도 받는 사람이 올바른 지역으로 진입하도록 ?plaza= 부착.
 */
export function buildShareUrl(
  kind: string,
  id: string,
  postPlazaId?: string | null,
): string {
  const plaza = postPlazaId || getCachedPlaza().id
  // 차단된 지역으로 링크 생성 금지
  const safePlaza = plaza && !HIDDEN_PLAZA_IDS.has(plaza) ? plaza : null
  const query = safePlaza ? `?plaza=${safePlaza}` : ""
  return `${WEB_BASE}/${kind}/${id}${query}`
}
