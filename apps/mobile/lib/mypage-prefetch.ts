/**
 * 마이페이지 프로필/포인트 인메모리 프리페치.
 *
 * (tabs) 레이아웃 마운트 시 즉시 fetch 시작 →
 * 마이페이지 탭 진입 시 메모리에서 동기적으로 읽어 깜빡임 0.
 *
 * AsyncStorage 캐시보다 빠름 (디스크 I/O 없음).
 */
import { getSupabase } from "@/lib/supabase"
import { getProfileCard, getPointBalance, type ProfileCardData } from "@gwangjang/features/profile"
import AsyncStorage from "@react-native-async-storage/async-storage"

interface CachedMyPage {
  card: ProfileCardData | null
  points: number
  ts: number
}

// 인메모리 캐시 — 앱 라이프타임 유지
let _cache: CachedMyPage | null = null
let _fetching = false
let _lastUserId: string | null = null
let _lastPlazaId: string | null = null

/** 동기적으로 캐시 읽기 — mypage 초기 state 에 바로 주입 */
export function getMyPageCache(): CachedMyPage | null {
  return _cache
}

/** 캐시 무효화 (광장 전환 시) */
export function clearMyPageCache() {
  _cache = null
  _lastUserId = null
  _lastPlazaId = null
}

/**
 * 프리페치 실행 — (tabs) 레이아웃에서 호출.
 * 이미 동일 user+plaza 로 캐시가 있으면 스킵.
 * 반환된 데이터는 인메모리 + AsyncStorage 양쪽에 저장.
 */
export async function prefetchMyPage(
  userId: string,
  plazaId: string | null | undefined,
): Promise<CachedMyPage | null> {
  // 동일 조건이면 스킵
  if (_cache && _lastUserId === userId && _lastPlazaId === (plazaId ?? null)) {
    return _cache
  }
  // 중복 호출 방지
  if (_fetching) return _cache
  _fetching = true
  _lastUserId = userId
  _lastPlazaId = plazaId ?? null

  try {
    // 1단계: AsyncStorage 캐시 먼저 hydrate (메모리가 비어있을 때만)
    if (!_cache) {
      try {
        const key = `mypage:cache:v1:${userId}:${plazaId ?? "none"}`
        const raw = await AsyncStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.card) {
            _cache = { card: parsed.card, points: parsed.points ?? 0, ts: parsed.ts ?? 0 }
          }
        }
      } catch {}
    }

    // 2단계: 네트워크 fresh fetch
    const supabase = getSupabase()
    const [card, points] = await Promise.all([
      getProfileCard(supabase, userId, plazaId ?? undefined),
      getPointBalance(supabase, userId, plazaId ?? undefined),
    ])

    _cache = { card, points: points ?? 0, ts: Date.now() }

    // AsyncStorage 에도 저장 (백그라운드)
    try {
      const key = `mypage:cache:v1:${userId}:${plazaId ?? "none"}`
      await AsyncStorage.setItem(key, JSON.stringify(_cache))
    } catch {}

    return _cache
  } catch {
    return _cache
  } finally {
    _fetching = false
  }
}
