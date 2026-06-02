/**
 * 푸시 알림 추상화 — 인터페이스만. 실제 구현은 Phase 2 (스토어 등록 직전).
 *
 *   web:    Web Push (현재 미구현 — VAPID 키 / service worker push 핸들러 필요)
 *   native: Capacitor Push Notifications (FCM / APNs)
 *
 * 흐름:
 *   1. requestPermission() — 사용자 권한 요청
 *   2. register() — FCM/APNs 토큰 발급
 *   3. 토큰을 서버에 등록 (POST /api/push/register)
 *   4. 알림 도착 시 핸들러 (앱 안에서 받기)
 *
 * 서버 측:
 *   - device_tokens 테이블 (user_id, token, platform, last_seen_at)
 *   - 알림 발송 시 FCM/APNs 호출
 *   - 광장 새 글 / 채팅 / 모임 알림 등
 */

import { isNativeSync } from "./platform"

export type PermissionState = "granted" | "denied" | "prompt"

export interface PushToken {
  token: string
  platform: "ios" | "android" | "web"
}

export interface PushPayload {
  title?: string
  body?: string
  data?: Record<string, any>
}

export type PushHandler = (payload: PushPayload) => void

/**
 * 푸시 권한 상태 조회.
 */
export async function getPushPermission(): Promise<PermissionState> {
  if (isNativeSync()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications")
      const r = await PushNotifications.checkPermissions()
      return r.receive as PermissionState
    } catch {
      return "prompt"
    }
  }
  // Web
  if (typeof Notification === "undefined") return "denied"
  return Notification.permission as PermissionState
}

/**
 * 권한 요청 + 토큰 등록. 성공 시 토큰 반환.
 *
 * 호출자는 토큰을 서버에 POST /api/push/register 로 보내야 함.
 */
export async function requestAndRegister(): Promise<PushToken | null> {
  if (isNativeSync()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications")
      const perm = await PushNotifications.requestPermissions()
      if (perm.receive !== "granted") return null
      // register 후 'registration' 이벤트로 토큰 받음
      const tokenPromise = new Promise<string>((resolve, reject) => {
        let regHandle: Promise<any> | null = null
        let errHandle: Promise<any> | null = null
        const cleanup = () => {
          regHandle?.then(h => h.remove())
          errHandle?.then(h => h.remove())
        }
        const timeoutId = setTimeout(() => { cleanup(); reject(new Error("token timeout")) }, 30000)
        regHandle = PushNotifications.addListener("registration", (token) => {
          clearTimeout(timeoutId); cleanup(); resolve(token.value)
        })
        errHandle = PushNotifications.addListener("registrationError", (err) => {
          clearTimeout(timeoutId); cleanup(); reject(new Error(err.error))
        })
      })
      await PushNotifications.register()
      const token = await tokenPromise
      const { Capacitor } = await import("@capacitor/core")
      const platform = Capacitor.getPlatform() as "ios" | "android"
      return { token, platform }
    } catch (err) {
      console.error("[push] native register failed:", err)
      return null
    }
  }

  // Web Push — VAPID 키 / SW push 핸들러 필요. Phase 2 에서 구현.
  // 현재는 미지원.
  return null
}

/**
 * 푸시 도착 시 핸들러 등록. cleanup 함수 반환.
 *
 * native: pushNotificationReceived (앱 포그라운드 시) + pushNotificationActionPerformed (사용자가 탭)
 * web: navigator.serviceWorker 의 message 이벤트 (Phase 2)
 */
export async function onPushReceived(handler: PushHandler): Promise<() => void> {
  if (isNativeSync()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications")
      const h1 = await PushNotifications.addListener("pushNotificationReceived", (notif) => {
        handler({
          title: notif.title,
          body: notif.body,
          data: notif.data,
        })
      })
      const h2 = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        handler({
          title: action.notification.title,
          body: action.notification.body,
          data: action.notification.data,
        })
      })
      return () => {
        h1.remove()
        h2.remove()
      }
    } catch {}
  }
  return () => {}
}

/**
 * 푸시 비활성화 (사용자가 알림 끄기).
 */
export async function unregister(): Promise<void> {
  if (isNativeSync()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications")
      await PushNotifications.removeAllListeners()
    } catch {}
  }
}
