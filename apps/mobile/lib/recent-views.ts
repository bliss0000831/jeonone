/**
 * 최근 본 글 — AsyncStorage 기반 로컬 히스토리.
 *
 * 광장 격리 해제 — 모든 광장의 최근 본 글 통합 저장.
 * 디바이스 로컬 저장만 (서버 동기화 X). 게시글 상세 진입 시 addRecentView 호출.
 * 같은 id 는 최신으로 덮어쓰고, 최대 50개 보존.
 */

import AsyncStorage from "@react-native-async-storage/async-storage"
import { useEffect } from "react"
import { getCachedPlaza } from "./plaza"

const STORAGE_KEY = "recent-views:v3:all"
const MAX_ITEMS = 50

export interface RecentView {
  id: string
  /** kind — DB 카테고리 (board/sharing/property/...) */
  kind: string
  /** UI 표시 라벨 (게시판/나눔/매물/...) */
  kindLabel: string
  title: string
  image?: string | null
  /** 클릭 시 이동할 경로 */
  href: string
  /** 본 시간 (ISO) */
  viewedAt: string
  /** 광장 ID — 뱃지 표시용 */
  plaza_id?: string | null
}

export async function listRecentViews(): Promise<RecentView[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as RecentView[]
  } catch {
    return []
  }
}

export async function addRecentView(
  item: Omit<RecentView, "viewedAt">,
): Promise<void> {
  if (!item?.id || !item?.kind) return
  try {
    const current = await listRecentViews()
    // 동일 id 제거 (kind 도 동일해야 같은 게시글)
    const filtered = current.filter(
      (v) => !(v.id === item.id && v.kind === item.kind),
    )
    // 현재 광장 ID 를 자동 첨부 (뱃지 표시용)
    const plaza = getCachedPlaza()?.id ?? null
    const next: RecentView[] = [
      { ...item, viewedAt: new Date().toISOString(), plaza_id: item.plaza_id ?? plaza },
      ...filtered,
    ].slice(0, MAX_ITEMS)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* noop */
  }
}

export async function clearRecentViews(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

/**
 * 게시글 상세 화면에서 데이터 로드 후 최근 본 글에 추가.
 * 초기 마운트 시점에는 title 이 비어있을 수 있어서 (API fetch 전), 의존성에
 * id/kind 와 함께 title 도 포함 — 데이터 도착하면 한 번 더 trigger 되어 저장.
 * addRecentView 가 같은 id+kind 는 자동 dedupe.
 */
export function useTrackRecent(item: Partial<Omit<RecentView, "viewedAt">>) {
  useEffect(() => {
    if (!item?.id || !item?.title || !item?.kind || !item?.href) return
    addRecentView({
      id: item.id,
      kind: item.kind,
      kindLabel: item.kindLabel || item.kind,
      title: item.title,
      image: item.image ?? null,
      href: item.href,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.kind, item?.title])
}
