/**
 * 알림(notifications) 공용 헬퍼
 *
 * - 모든 알림 INSERT를 이 헬퍼로 통일
 * - 실패해도 원 요청(댓글 작성, 참여 등)은 성공으로 처리되어야 하므로
 *   호출 측에서는 await 하되 try/catch 로 감싸거나, 여기서 자체 swallow
 * - 자기 자신에게 알림이 가지 않도록 skip-self 가드 기본 탑재
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { sendFcmBatch } from "./fcm"

/**
 * 현재 요청 컨텍스트에서 광장을 가져오되, request scope 밖(cron 등)에서는
 * 안전하게 null 반환. 호출자가 명시적으로 plaza_id 를 넘기면 그걸 우선.
 */
async function resolvePlaza(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit
  try {
    return await getCurrentPlaza()
  } catch {
    return null
  }
}

export type NotificationType =
  // 기존
  | "chat"
  | "price_change"
  | "favorite"
  | "system"
  | "expert_invitation"
  | "expert_invitation_response"
  // 신규 (이번 커밋에서 추가)
  | "board_comment"        // 게시판 댓글 → 글쓴이
  | "board_reply"          // 대댓글 → 부모 댓글 작성자
  | "group_buying_join"    // 공구 참여 → 주최자
  | "group_buying_cancel"  // 공구 참여 취소 → 주최자
  | "group_buying_full"    // 공구 정원 마감 → 주최자
  | "club_join"            // 모임 참여 → 모임장
  | "club_leave"           // 모임 나가기 → 모임장
  | "club_full"            // 모임 정원 마감 → 모임장
  | "admin_notice"         // 관리자 브로드캐스트
  | "account_type_review"  // 계정 유형 신청 심사 결과 (승인/반려) → 신청자
  | "order_shipped"        // 판매자 발송 처리 → 구매자
  | "order_received"       // 구매자 수령확인 → 판매자

export interface NotificationInput {
  user_id: string
  type: NotificationType
  title: string
  message: string
  link?: string | null
  property_id?: string | null
  /** 알림창에 보여줄 썸네일 URL 스냅샷
   *  - chat: 상대방 avatar_url
   *  - price_change / favorite: 매물 images[0]
   *  - group_buying_*: 공구 상품 images[0]
   *  - board_comment / board_reply: 게시글 썸네일 or 댓글 작성자 avatar_url
   *  - club_*: 모임 썸네일
   */
  thumbnail_url?: string | null
  /** 알림을 유발한 사용자 (내가 아닌 상대방) */
  actor_id?: string | null
  /** 광장 격리. 미지정 시 현재 요청 컨텍스트의 광장으로 자동 채워짐. */
  plaza_id?: string | null
}

/**
 * 단일 알림 INSERT (조용한 실패)
 * @param client Supabase 클라이언트 (admin 또는 RLS 허용된 server client)
 * @param input  알림 데이터
 * @param fromUserId 본인에게 알림이 가는 것을 방지하기 위한 발신자 ID (옵션)
 */
export async function notify(
  client: SupabaseClient,
  input: NotificationInput,
  fromUserId?: string,
): Promise<void> {
  try {
    // 자기 자신에겐 알림 보내지 않음
    if (fromUserId && fromUserId === input.user_id) return
    if (!input.user_id) return

    const plaza_id = await resolvePlaza(input.plaza_id)

    await client.from("notifications").insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      property_id: input.property_id ?? null,
      thumbnail_url: input.thumbnail_url ?? null,
      actor_id: input.actor_id ?? fromUserId ?? null,
      ...(plaza_id ? { plaza_id } : {}),
    })

    // 푸시 알림 best effort 발송
    try {
      // FCM 직접 발송 (Android 리치 푸시 — 이미지 포함)
      const fcmResult = await sendFcmBatch(client, [input.user_id], {
        title: input.title,
        body: input.message,
        imageUrl: input.thumbnail_url,
        data: { link: input.link ?? "", type: input.type },
      })
      // Expo Push — FCM 발송 성공한 유저는 제외 (중복 방지)
      if (fcmResult.sent === 0) {
        await sendExpoPushBatch(client, [input.user_id], {
          title: input.title,
          body: input.message,
          data: { link: input.link ?? null, type: input.type },
        })
      }
    } catch {
      // 푸시 실패는 무시
    }
  } catch (err) {
    // 알림 실패는 비즈니스 로직을 막지 않음
    console.error("[notify] insert failed:", err)
  }
}

/**
 * 여러 사용자에게 같은 알림을 일괄 발송 (관리자 브로드캐스트용)
 * 400개씩 배치 insert
 */
export async function notifyMany(
  client: SupabaseClient,
  userIds: string[],
  template: Omit<NotificationInput, "user_id">,
  fromUserId?: string,
): Promise<{ success: number; failed: number }> {
  const uniq = Array.from(
    new Set(
      userIds.filter((id) => !!id && (!fromUserId || id !== fromUserId)),
    ),
  )
  if (uniq.length === 0) return { success: 0, failed: 0 }

  const plaza_id = await resolvePlaza(template.plaza_id)

  const CHUNK = 400
  let success = 0
  let failed = 0
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const chunk = uniq.slice(i, i + CHUNK)
    const rows = chunk.map((uid) => ({
      user_id: uid,
      type: template.type,
      title: template.title,
      message: template.message,
      link: template.link ?? null,
      property_id: template.property_id ?? null,
      thumbnail_url: template.thumbnail_url ?? null,
      actor_id: template.actor_id ?? fromUserId ?? null,
      ...(plaza_id ? { plaza_id } : {}),
    }))
    const { error } = await client.from("notifications").insert(rows)
    if (error) {
      failed += chunk.length
      console.error("[notifyMany] batch failed:", error)
    } else {
      success += chunk.length
    }
  }

  // 인앱 알림 insert 후 푸시 발송 (best effort)
  // FCM 먼저 시도 → 성공 시 해당 유저 Expo 제외, 실패 시 전원 Expo 폴백
  try {
    // FCM 직접 발송 (Android 리치 푸시 — 이미지 포함)
    const fcmResult = await sendFcmBatch(client, uniq, {
      title: template.title,
      body: template.message,
      imageUrl: template.thumbnail_url,
      data: { link: template.link ?? "", type: template.type },
    })

    if (fcmResult.sent > 0) {
      // FCM 정상 — FCM 토큰 없는 유저만 Expo 발송 (중복 방지)
      const { data: fcmRows } = await client
        .from("user_push_tokens")
        .select("user_id")
        .in("user_id", uniq)
        .eq("provider", "fcm")
      const fcmUserIds = new Set((fcmRows || []).map((r: any) => r.user_id))
      const expoTargets = uniq.filter((id) => !fcmUserIds.has(id))
      if (expoTargets.length > 0) {
        await sendExpoPushBatch(client, expoTargets, {
          title: template.title,
          body: template.message,
          data: { link: template.link ?? null, type: template.type },
        })
      }
    } else {
      // FCM 전부 실패 — 전원 Expo 폴백
      await sendExpoPushBatch(client, uniq, {
        title: template.title,
        body: template.message,
        data: { link: template.link ?? null, type: template.type },
      })
    }
  } catch (e) {
    // 푸시 실패는 인앱 알림에 영향 없음
    console.warn("[notifyMany] push dispatch failed (non-fatal):", e)
  }

  return { success, failed }
}

/**
 * Expo Push Notification 일괄 발송.
 * - user_push_tokens 테이블에서 토큰 조회
 * - Expo Push API (https://exp.host/--/api/v2/push/send) 에 batch POST
 * - 100개씩 chunk (Expo 권장)
 */
export async function sendExpoPushBatch(
  client: SupabaseClient,
  userIds: string[],
  message: { title: string; body: string; data?: any },
): Promise<{ sent: number; skipped: number }> {
  if (userIds.length === 0) return { sent: 0, skipped: 0 }
  try {
    const { data: tokens } = await client
      .from("user_push_tokens")
      .select("token, provider")
      .in("user_id", userIds)
      .eq("provider", "expo")
    const arr = ((tokens || []) as Array<{ token: string }>)
    if (arr.length === 0) return { sent: 0, skipped: userIds.length }

    // Expo Push API 100개씩 batch
    const CHUNK = 100
    let sent = 0
    for (let i = 0; i < arr.length; i += CHUNK) {
      const chunk = arr.slice(i, i + CHUNK)
      const messages = chunk.map((t) => ({
        to: t.token,
        title: message.title,
        body: message.body,
        data: message.data,
        sound: "default",
        priority: "high",
      }))
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages),
        })
        if (res.ok) sent += chunk.length
      } catch (e) {
        console.warn("[sendExpoPushBatch] chunk failed:", e)
      }
    }
    return { sent, skipped: userIds.length - sent }
  } catch (e) {
    console.warn("[sendExpoPushBatch] failed:", e)
    return { sent: 0, skipped: userIds.length }
  }
}

/**
 * 닉네임 조회 (알림 본문에 자주 필요)
 */
export async function getNickname(
  client: SupabaseClient,
  userId: string,
  fallback = "사용자",
): Promise<string> {
  try {
    const { data } = await client
      .from("profiles")
      .select("nickname, full_name")
      .eq("id", userId)
      .maybeSingle()
    return data?.nickname || data?.full_name || fallback
  } catch {
    return fallback
  }
}

/**
 * 본문 미리보기 (50자 + 말줄임)
 */
export function preview(text: string | null | undefined, max = 50): string {
  if (!text) return ""
  const t = text.replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
