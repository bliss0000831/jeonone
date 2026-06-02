/**
 * 알림 도메인 API — Supabase 직접 쿼리 (RLS 가 user_id 보호).
 * 광장 web 의 /api/notifications 와 동일 결과.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface AppNotification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
  thumbnail_url: string | null
  actor_id: string | null
  property_id: string | null
}

export async function listNotifications(
  supabase: SupabaseClient,
  userId: string,
  options?: { plazaId?: string; limit?: number; offset?: number },
): Promise<AppNotification[]> {
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0
  let q = supabase
    .from("notifications")
    .select(
      "id, type, title, message, link, is_read, created_at, thumbnail_url, actor_id, property_id",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
  if (options?.plazaId) q = q.eq("plaza_id", options.plazaId)
  const { data, error } = await q
  if (error) return []
  return (data ?? []) as AppNotification[]
}

/** 단일 알림 읽음 처리 */
export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
): Promise<void> {
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
}

/** 사용자의 모든 알림 읽음 처리 */
export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false)
}

/** 알림 삭제 */
export async function deleteNotification(
  supabase: SupabaseClient,
  notificationId: string,
): Promise<void> {
  await supabase.from("notifications").delete().eq("id", notificationId)
}

/** 안 읽음 카운트 */
export async function countUnreadNotifications(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false)
  return count ?? 0
}
