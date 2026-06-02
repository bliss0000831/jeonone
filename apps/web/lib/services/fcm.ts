/**
 * FCM v1 API 직접 호출 — 리치 푸시 알림 (이미지, 대형 아이콘 등)
 *
 * Expo Push API 는 기본 텍스트만 지원하므로,
 * Android 디바이스에 이미지가 포함된 알림을 보내려면 FCM v1 을 직접 호출해야 한다.
 *
 * 환경변수:
 *   FIREBASE_PROJECT_ID      — Firebase 프로젝트 ID (예: gwangjang-a4435)
 *   FIREBASE_CLIENT_EMAIL    — 서비스 계정 이메일
 *   FIREBASE_PRIVATE_KEY     — 서비스 계정 비공개 키 (PEM, \n escaped)
 */

import crypto from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

// ── OAuth2 Access Token 캐시 ──────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null

/** Base64url 인코딩 */
function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Google OAuth2 액세스 토큰을 서비스 계정 JWT로 발급.
 * 외부 라이브러리 없이 Node.js crypto 로 직접 서명.
 */
async function getAccessToken(): Promise<string> {
  // 캐시된 토큰이 유효하면 재사용 (만료 1분 전 갱신)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

  if (!clientEmail || !privateKey) {
    console.error("[FCM] 환경변수 누락:", { hasEmail: !!clientEmail, hasKey: !!privateKey, keyLength: privateKey?.length })
    throw new Error("FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY 환경변수가 설정되지 않았습니다")
  }
  console.log("[FCM] getAccessToken: email=", clientEmail, "keyLength=", privateKey.length)

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64url(
    JSON.stringify({
      iss: clientEmail,
      sub: clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    }),
  )

  const signingInput = `${header}.${payload}`
  const sign = crypto.createSign("RSA-SHA256")
  sign.update(signingInput)
  const signature = base64url(sign.sign(privateKey))
  const jwt = `${signingInput}.${signature}`

  // JWT → Access Token 교환
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error("[FCM] OAuth2 토큰 발급 실패:", res.status, text)
    throw new Error(`Google OAuth2 토큰 발급 실패: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

// ── FCM v1 메시지 발송 ───────────────────────────────────────────────

export interface FcmMessage {
  title: string
  body: string
  /** 알림 이미지 — Android에서 펼치면 큰 이미지, 접힌 상태에서 오른쪽 썸네일 */
  imageUrl?: string | null
  /** 클릭 시 딥링크 데이터 */
  data?: Record<string, string>
}

/**
 * 단일 FCM v1 메시지 발송
 * @param fcmToken  디바이스 FCM 토큰 (user_push_tokens.provider = 'fcm')
 * @param message   메시지 내용
 */
export async function sendFcmNotification(
  fcmToken: string,
  message: FcmMessage,
): Promise<boolean> {
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    console.warn("[FCM] FIREBASE_PROJECT_ID 미설정")
    return false
  }

  try {
    const accessToken = await getAccessToken()

    const body: any = {
      message: {
        token: fcmToken,
        notification: {
          title: message.title,
          body: message.body,
          ...(message.imageUrl ? { image: message.imageUrl } : {}),
        },
        android: {
          priority: "high",
          notification: {
            channel_id: "default",
            sound: "default",
            ...(message.imageUrl ? { image: message.imageUrl } : {}),
          },
        },
        data: message.data ?? {},
      },
    }

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const text = await res.text()
      console.error("[FCM] 발송 실패:", res.status, text, "token:", fcmToken.slice(0, 20) + "...")
      return false
    }
    console.log("[FCM] 발송 성공! projectId=", projectId)
    return true
  } catch (err) {
    console.warn("[FCM] 발송 에러:", err)
    return false
  }
}

/**
 * FCM v1 일괄 발송 — user_push_tokens 에서 fcm 토큰 조회 후 발송.
 * 이미지가 없으면 Expo Push API 가 더 효율적이므로 호출 측에서 분기.
 */
export async function sendFcmBatch(
  client: SupabaseClient,
  userIds: string[],
  message: FcmMessage,
): Promise<{ sent: number; skipped: number }> {
  if (userIds.length === 0) return { sent: 0, skipped: 0 }

  try {
    const { data: tokens } = await client
      .from("user_push_tokens")
      .select("token, provider")
      .in("user_id", userIds)
      .eq("provider", "fcm")

    const arr = (tokens || []) as Array<{ token: string }>
    console.log("[FCM] sendFcmBatch: userIds=", userIds.length, "fcmTokens=", arr.length)
    if (arr.length === 0) return { sent: 0, skipped: userIds.length }

    let sent = 0
    // FCM v1 은 개별 발송 (batch API 는 복잡도 높아 개별로)
    // 동시 10개씩 병렬 처리
    const CONCURRENCY = 10
    for (let i = 0; i < arr.length; i += CONCURRENCY) {
      const chunk = arr.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        chunk.map((t) => sendFcmNotification(t.token, message)),
      )
      sent += results.filter((r) => r.status === "fulfilled" && r.value).length
    }

    console.log("[FCM] sendFcmBatch result: sent=", sent, "total=", arr.length)
    return { sent, skipped: userIds.length - sent }
  } catch (err) {
    console.error("[sendFcmBatch] failed:", err)
    return { sent: 0, skipped: userIds.length }
  }
}
