/**
 * Expo Push Notifications 클라이언트 등록.
 *
 * 동작:
 *   1) 로그인 사용자가 있으면 권한 요청
 *   2) 권한 OK 면 ExponentPushToken 발급
 *   3) user_push_tokens 테이블에 upsert (registerPushToken)
 *   4) 로그아웃 시 removePushToken
 *
 * 서버 발송: Anthropic 시스템 외부 — Edge Function 등에서 Expo Push API 직접 호출.
 *
 * ⚠️ Firebase / APNs 인증서 설정이 EAS credentials 에 등록돼있어야 동작.
 *   - Android: FCM Server Key
 *   - iOS: APNs Certificate / Key
 *   - 미설정 시 토큰 발급 자체가 실패함 (무해, silent)
 */

import { useEffect } from "react"
import { Platform } from "react-native"
import { registerPushToken, removePushToken } from "@gwangjang/features/profile"
import { getSupabase } from "./supabase"

let dynamicNotifications: any = null
let dynamicDevice: any = null

// expo-notifications 는 native 전용 (web 에서 import 시 codegen 에러).
// dynamic require 로 web 안전성 확보.
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    dynamicNotifications = require("expo-notifications")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    dynamicDevice = require("expo-device")

    // 전역 알림 핸들러 설정 — 앱이 포그라운드에 있을 때도 알림 표시
    if (dynamicNotifications?.setNotificationHandler) {
      dynamicNotifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      })
    }

    // 알림 tap 시 라우팅 — 알림 payload 의 `link` 필드로 expo-router push
    // 예: data: { link: "/notifications" } 또는 "/property/abc"
    // Module-level singleton: 이 리스너는 앱 프로세스 당 한 번만 등록됨.
    // 모듈이 다시 import 되어도 JS 번들러 캐시로 재실행 안 됨 → cleanup 불필요.
    const routeFromResponse = (response: any) => {
      try {
        const data = response?.notification?.request?.content?.data
        const link =
          data?.link ?? data?.url ?? data?.deeplink ?? "/notifications"
        if (typeof link === "string" && link.startsWith("/")) {
          // 민감한 경로로의 deep link 차단 (push payload 조작 방지)
          const BLOCKED_PREFIXES = ["/admin", "/super-admin", "/plaza-admin", "/webview", "/auth"]
          if (BLOCKED_PREFIXES.some((p) => link.startsWith(p))) return
          // expo-router import — 모듈 로드 시 회피 (circular)
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { router } = require("expo-router")
          router.push(link)
        }
      } catch {
        // routing 실패는 무시
      }
    }

    // 앱 실행 중 알림 탭
    if (dynamicNotifications?.addNotificationResponseReceivedListener) {
      dynamicNotifications.addNotificationResponseReceivedListener(routeFromResponse)
    }

    // 앱이 완전히 종료된 상태에서 푸시 탭으로 실행된 경우 — 마지막 응답으로 라우팅
    // (cold start: addNotificationResponseReceivedListener 가 fire 하지 않으므로 별도 처리)
    if (dynamicNotifications?.getLastNotificationResponseAsync) {
      dynamicNotifications
        .getLastNotificationResponseAsync()
        .then((last: any) => {
          // 라우터/네비게이션 트리가 마운트될 시간을 준 뒤 이동
          if (last) setTimeout(() => routeFromResponse(last), 800)
        })
        .catch(() => {})
    }
  } catch {
    // 모듈 미설치 (이전 APK 등) — silent
  }
}

let cachedToken: string | null = null
let cachedFcmToken: string | null = null

/** 토큰 발급 + DB 저장 — 멱등 (이미 같은 토큰이면 no-op) */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!dynamicNotifications || !dynamicDevice) return null
  if (!dynamicDevice.isDevice) return null // 시뮬레이터/에뮬레이터 제외

  try {
    // Android: 채널 등록 (안 하면 알림 표시 안 됨)
    if (Platform.OS === "android") {
      await dynamicNotifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: dynamicNotifications.AndroidImportance?.MAX ?? 5,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      })
    }

    // 권한 요청
    const { status: existingStatus } = await dynamicNotifications.getPermissionsAsync()
    let finalStatus = existingStatus
    console.log("[PUSH] 현재 권한 상태:", existingStatus)
    if (existingStatus !== "granted") {
      const { status } = await dynamicNotifications.requestPermissionsAsync()
      finalStatus = status
      console.log("[PUSH] 권한 요청 결과:", status)
    }
    if (finalStatus !== "granted") {
      console.warn("[PUSH] 알림 권한 거부됨:", finalStatus)
      return null
    }

    // 토큰 발급 — projectId 명시 필수 (EAS 프로젝트)
    console.log("[PUSH] 토큰 발급 시도...")
    const tokenData = await dynamicNotifications.getExpoPushTokenAsync({
      projectId: "a4d7e247-0f55-42ba-917d-11589f1dcec9",
    })
    const token = tokenData?.data
    console.log("[PUSH] 토큰 발급 결과:", token ? `${token.slice(0, 30)}...` : "없음")
    if (!token || typeof token !== "string") return null

    // 같은 토큰이면 재저장 안 함 (DB 부담 줄이기)
    if (cachedToken === token) {
      console.log("[PUSH] 동일 토큰 — DB 저장 생략")
      return token
    }

    // DB upsert
    console.log("[PUSH] DB에 토큰 저장 중...")
    await registerPushToken(getSupabase(), {
      userId,
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      provider: "expo",
    })
    console.log("[PUSH] ✅ Expo 토큰 등록 완료:", token.slice(0, 30))
    cachedToken = token

    // FCM 디바이스 토큰도 별도 저장 (Android 리치 푸시용 — 이미지, 대형 아이콘)
    if (Platform.OS === "android") {
      try {
        const deviceTokenData = await dynamicNotifications.getDevicePushTokenAsync()
        const fcmToken = deviceTokenData?.data
        if (fcmToken && typeof fcmToken === "string" && cachedFcmToken !== fcmToken) {
          await registerPushToken(getSupabase(), {
            userId,
            token: fcmToken,
            platform: "android",
            provider: "fcm",
          })
          cachedFcmToken = fcmToken
          console.log("[PUSH] ✅ FCM 토큰 등록 완료:", fcmToken.slice(0, 20))
        }
      } catch (fcmErr) {
        console.warn("[PUSH] FCM 토큰 등록 실패 (무해):", fcmErr instanceof Error ? fcmErr.message : String(fcmErr))
      }
    }

    return token
  } catch (err) {
    // 토큰 발급 실패 — 원인 로깅
    console.warn("[PUSH] ❌ 토큰 등록 실패:", err instanceof Error ? err.message : String(err))
    return null
  }
}

/** 로그아웃 시 토큰 제거 — 다른 계정에 알림 가지 않도록 */
export async function unregisterPushNotifications(userId: string): Promise<void> {
  if (!cachedToken) return
  try {
    await removePushToken(getSupabase(), { userId, token: cachedToken })
  } catch {}
  cachedToken = null
}

/** 로그인 상태에 따라 자동 등록/해제 */
export function usePushNotifications(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return
    console.log("[PUSH] usePushNotifications — userId:", userId.slice(0, 8))
    registerForPushNotifications(userId)
      .then((token) => console.log("[PUSH] 등록 결과:", token ? "성공" : "실패/스킵"))
      .catch((err) => console.warn("[PUSH] 등록 에러:", err))
    // 로그아웃 시 cleanup — userId 가 변경 또는 null 되는 시점에 unregister
    return () => {
      // 동기 cleanup 이라 promise 대기 안 함
      unregisterPushNotifications(userId).catch(() => {})
    }
  }, [userId])
}
