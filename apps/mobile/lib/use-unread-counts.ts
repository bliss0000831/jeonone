/**
 * useUnreadCounts — notifications 테이블의 미읽음 알림을 카테고리별로 집계.
 *
 * 마이페이지 메뉴별 점 표시 + MY 탭 bottom nav 배지에 사용.
 * 60초마다 polling 으로 재조회 (홈/채팅의 unread 패턴과 동일).
 *
 * 카테고리 매핑 (notifications.type 기준):
 *   - orders   : 구매자 입장 알림 (group_buying 진행/완료 등)
 *   - sales    : 판매자 입장 알림 (새 참여, 주문 받음 등)
 *   - posts    : 내 글에 달린 활동 (댓글/좋아요/가격문의)
 *   - notice   : admin_notice
 *   - total    : 전체 미읽음 (위 카테고리 외도 모두 합산 — MY 탭 배지)
 *
 * 알림 type schema 가 향후 더 풍부해지면 매핑만 확장하면 됨.
 */

import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { useCurrentPlaza } from "./plaza"
import { useFocusEffect } from "expo-router"
import { useCallback } from "react"
import { getSupabase } from "@/lib/supabase"

export interface UnreadCounts {
  total: number
  orders: number
  sales: number
  posts: number
  notice: number
}

const EMPTY: UnreadCounts = { total: 0, orders: 0, sales: 0, posts: 0, notice: 0 }

function categorize(types: string[]): UnreadCounts {
  let orders = 0
  let sales = 0
  let posts = 0
  let notice = 0
  for (const t of types) {
    // 공지
    if (t === "admin_notice") notice++
    // 판매자 입장 (참여/구매 요청 받음)
    else if (
      t === "group_buying_new_join" ||
      t === "group_buying_join" ||
      t === "order_received" ||
      t === "buy_request"
    ) sales++
    // 구매자 입장 (참여한 공구 상태 변경 등)
    else if (
      t.startsWith("group_buying") ||
      t === "order_paid" ||
      t === "order_shipped" ||
      t === "order_completed" ||
      t === "order_status"
    ) orders++
    // 내 글 활동 (댓글/좋아요/가격 변경 문의 등)
    else if (
      t.startsWith("board_") ||
      t === "favorite" ||
      t === "price_change" ||
      t.startsWith("comment") ||
      t.startsWith("like")
    ) posts++
  }
  return { total: types.length, orders, sales, posts, notice }
}

export function useUnreadCounts(userId: string | null | undefined): UnreadCounts {
  const [counts, setCounts] = useState<UnreadCounts>(EMPTY)
  const plazaId = useCurrentPlaza()

  const load = useCallback(async () => {
    if (!userId) {
      setCounts(EMPTY)
      return
    }
    if (AppState.currentState !== 'active') return
    try {
      const supabase = getSupabase()
      // 🅲 광장 격리 — 현재 광장 알림만 카운트
      let q: any = supabase
        .from("notifications")
        .select("type")
        .eq("user_id", userId)
        .is("read_at", null)
      if (plazaId) q = q.eq("plaza_id", plazaId)
      const { data, error } = await q
      if (error) return
      const types = ((data ?? []) as Array<{ type: string }>).map((d) => d.type)
      setCounts(categorize(types))
    } catch {
      /* noop */
    }
  }, [userId, plazaId])

  // 초기 로드
  useEffect(() => {
    load()
  }, [load])

  // 60초마다 polling (홈 헤더 종 동일 cadence)
  useEffect(() => {
    if (!userId) return
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [userId, load])

  // 화면 포커스 시 즉시 갱신 — 알림 페이지 다녀온 뒤 점 즉시 사라지도록
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  return counts
}
