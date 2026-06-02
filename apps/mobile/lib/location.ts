/**
 * 사용자 위치 — 빠른 가져오기.
 *
 * 우선순위:
 *   1. 모듈 메모리 캐시 (5분 이내) → 0ms
 *   2. AsyncStorage 영구 캐시 (5분 이내) → < 50ms (+ 백그라운드 갱신)
 *   3. Location.getLastKnownPositionAsync (maxAge 5분) → < 200ms (인스턴트)
 *   4. Location.getCurrentPositionAsync (Balanced + 8초 timeout) → 1~8초
 *   5. 실패 시 null
 *
 * AsyncStorage 영구 캐시 — 앱 재시작 후에도 마지막 위치 즉시 사용 가능.
 */

import * as Location from "expo-location"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Platform } from "react-native"

export interface UserLocation {
  lat: number
  lng: number
}

const PERSIST_KEY = "user-location:v1"
const FRESH_WINDOW_MS = 5 * 60_000 // 5분 — 그 이후 캐시 stale
const GPS_TIMEOUT_MS = 8_000

let memCache: { coords: UserLocation; ts: number } | null = null

async function loadPersisted(): Promise<{ coords: UserLocation; ts: number } | null> {
  try {
    const v = await AsyncStorage.getItem(PERSIST_KEY)
    if (!v) return null
    const j = JSON.parse(v)
    if (typeof j?.coords?.lat === "number" && typeof j?.coords?.lng === "number" && typeof j?.ts === "number") {
      return j
    }
  } catch {}
  return null
}

async function savePersisted(coords: UserLocation) {
  try {
    await AsyncStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ coords, ts: Date.now() }),
    )
  } catch {}
}

function ensurePermission(): Promise<boolean> {
  return Location.requestForegroundPermissionsAsync()
    .then((r) => r.status === "granted")
    .catch(() => false)
}

/**
 * 빠른 사용자 위치 가져오기.
 *
 * @param options
 *   - allowStale: true 면 5분 초과 캐시도 반환 (네트워크 신뢰 X 케이스). 기본 false.
 *   - forceFresh: true 면 캐시 무시하고 GPS 새로 가져옴. 기본 false.
 */
export async function getFastUserLocation(
  options: { allowStale?: boolean; forceFresh?: boolean } = {},
): Promise<UserLocation | null> {
  const { allowStale = false, forceFresh = false } = options

  // 1) 모듈 메모리 캐시 — fresh
  if (!forceFresh && memCache) {
    const age = Date.now() - memCache.ts
    if (age < FRESH_WINDOW_MS || allowStale) {
      return memCache.coords
    }
  }

  // 웹 fallback — navigator.geolocation
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null
    return new Promise<UserLocation | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          memCache = { coords: c, ts: Date.now() }
          resolve(c)
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: FRESH_WINDOW_MS },
      )
    })
  }

  // 2) AsyncStorage 영구 캐시 — fresh 면 즉시 반환 + 백그라운드 갱신
  if (!forceFresh) {
    const persisted = await loadPersisted()
    if (persisted) {
      const age = Date.now() - persisted.ts
      memCache = persisted
      if (age < FRESH_WINDOW_MS || allowStale) {
        // 백그라운드 갱신 — fire-and-forget. 다음 호출에 더 fresh 한 위치 사용.
        void refreshInBackground()
        return persisted.coords
      }
    }
  }

  // 3) 권한 확인
  const ok = await ensurePermission()
  if (!ok) return null

  // 4) getLastKnownPositionAsync — OS 가 들고 있는 마지막 위치, 인스턴트
  try {
    const last = await Location.getLastKnownPositionAsync({
      maxAge: FRESH_WINDOW_MS,
      requiredAccuracy: 1000, // m — 거친 정밀도 허용 (도시 단위면 충분)
    })
    if (last) {
      const c = { lat: last.coords.latitude, lng: last.coords.longitude }
      memCache = { coords: c, ts: Date.now() }
      void savePersisted(c)
      return c
    }
  } catch {}

  // 5) getCurrentPositionAsync — GPS 락. Balanced + 8초 timeout.
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("location-timeout")), GPS_TIMEOUT_MS),
      ),
    ])
    const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    memCache = { coords: c, ts: Date.now() }
    void savePersisted(c)
    return c
  } catch {
    return null
  }
}

async function refreshInBackground() {
  try {
    const ok = await ensurePermission()
    if (!ok) return
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("bg-timeout")), GPS_TIMEOUT_MS),
      ),
    ])
    const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    memCache = { coords: c, ts: Date.now() }
    void savePersisted(c)
  } catch {}
}

/**
 * 캐시 강제 무효화 — 위치 변경 후 다음 호출에서 다시 가져오게.
 */
export function invalidateUserLocationCache() {
  memCache = null
  void AsyncStorage.removeItem(PERSIST_KEY).catch(() => {})
}
