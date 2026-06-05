/**
 * 모바일 앱 방문자 트래커.
 *
 * 웹의 VisitorTracker 와 동일한 /api/visitor-track 엔드포인트를 사용.
 * 앱 식별을 위해 user_agent 에 "jeonwondiary-app" 태그 포함.
 *
 * 세션 중복 방지: AsyncStorage 에 마지막 기록 시각 저장 → 5분 이내 재호출 무시.
 */
import { Platform } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { API_BASE } from "./supabase"
import { getCachedPlaza } from "./plaza"
import * as Device from "expo-device"

const SESSION_KEY = "visitor_session_id"
const LAST_TRACK_KEY = "visitor_last_track"
const DEDUPE_MS = 5 * 60 * 1000 // 5분

let cachedSessionId: string | null = null

async function getSessionId(): Promise<string> {
  if (cachedSessionId) return cachedSessionId
  let id = await AsyncStorage.getItem(SESSION_KEY)
  if (!id) {
    id =
      "app-" +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36)
    await AsyncStorage.setItem(SESSION_KEY, id)
  }
  cachedSessionId = id
  return id
}

function getDeviceType(): string {
  if (Device.deviceType === Device.DeviceType.TABLET) return "tablet"
  if (Device.deviceType === Device.DeviceType.PHONE) return "mobile"
  return "mobile" // 앱에서는 대부분 모바일
}

function getOS(): string {
  if (Platform.OS === "ios") return "iOS"
  if (Platform.OS === "android") return "Android"
  return Platform.OS
}

function getBrowser(): string {
  // 앱 내장 WebView — 브라우저 대신 앱 식별자 사용
  return "jeonwondiary-app"
}

/**
 * 방문 기록 전송.
 * 앱 시작 시, 또는 탭 전환 시 호출.
 * 5분 이내 중복 호출은 무시.
 */
export async function trackVisit(pageUrl: string = "/app"): Promise<void> {
  try {
    // 중복 방지
    const lastTrack = await AsyncStorage.getItem(LAST_TRACK_KEY)
    const now = Date.now()
    if (lastTrack && now - parseInt(lastTrack, 10) < DEDUPE_MS) {
      return
    }
    await AsyncStorage.setItem(LAST_TRACK_KEY, now.toString())

    const sessionId = await getSessionId()
    const plaza = getCachedPlaza()

    const payload = {
      session_id: sessionId,
      page_url: pageUrl,
      user_agent: `jeonwondiary-app/${Platform.OS} ${Device.modelName || "unknown"}`,
      referer: null,
      device_type: getDeviceType(),
      browser: getBrowser(),
      os: getOS(),
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (plaza?.id) {
      headers["x-plaza"] = plaza.id
    }

    // fire-and-forget
    fetch(`${API_BASE}/api/visitor-track`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }).catch(() => {
      // 실패 무시 — 방문자 트래킹은 비 핵심 기능
    })
  } catch {
    // 무시
  }
}

/**
 * React hook — 컴포넌트 마운트 시 1회 방문 기록.
 */
import { useEffect } from "react"

export function useVisitorTrack(pageUrl: string = "/app") {
  useEffect(() => {
    trackVisit(pageUrl)
  }, [pageUrl])
}
