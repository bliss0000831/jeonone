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

/**
 * 광장 ID → 도시 이름 (헤더 표시용).
 * "원주광장" → "원주" 처럼 "광장" suffix 제거. fallback 은 id.
 */
export function plazaCityName(plazaIdOrName: string): string {
  return plazaIdOrName.replace(/광장$/, "")
}

/**
 * 공유 URL 빌더 — 게시글의 광장 서브도메인으로 생성.
 *   buildShareUrl("property", "abc", "chuncheon")
 *     → "https://chuncheon.gwangjang.app/property/abc"
 *
 * postPlazaId 우선 (게시글이 속한 광장), 없으면 현재 viewer 광장.
 * 게시글 plaza 와 viewer plaza 가 다를 때(cross-plaza 공유 링크 노출 방지) 중요.
 */
export function buildShareUrl(
  kind: string,
  id: string,
  postPlazaId?: string | null,
): string {
  const plaza = postPlazaId || getCachedPlaza().id
  // 차단된 광장으로 링크 생성 금지
  const safePlaza = plaza && !HIDDEN_PLAZA_IDS.has(plaza) ? plaza : null
  const host = safePlaza ? `${safePlaza}.gwangjang.app` : "www.gwangjang.app"
  return `https://${host}/${kind}/${id}`
}
