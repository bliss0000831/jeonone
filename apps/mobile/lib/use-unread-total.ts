/**
 * 채팅 안읽음 총합 — 1:1 + 모임 + 공동구매 합산.
 * 광장 web 의 /api/chat/unread-total 과 동일 로직을 RN 측에서 supabase 직접 쿼리.
 *
 * 60초마다 polling. 마운트 + 포커스 시점에도 갱신.
 */

import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import { getSupabase } from "@/lib/supabase"

export function useUnreadTotal(): number {
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!user) {
      setTotal(0)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function fetchTotal() {
      try {
        if (!user) return
        if (AppState.currentState !== 'active') return
        const supabase = getSupabase()
        // 🅲 광장 격리 — messages: 현재 광장만, club: 현재 광장만, gb: cross-plaza 허용
        let messagesQ: any = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("is_read", false)
          .neq("sender_id", user.id)
        if (plazaId) messagesQ = messagesQ.eq("plaza_id", plazaId)

        let clubQ: any = supabase
          .from("my_club_chat_rooms")
          .select("unread_count, club_id")
          .eq("user_id", user.id)
        if (plazaId) clubQ = clubQ.eq("plaza_id", plazaId)

        const [direct, club, gb] = await Promise.all([
          messagesQ,
          clubQ,
          supabase
            .from("my_group_buying_chat_rooms")
            .select("unread_count, post_id, plaza_id, buyer_plaza_id, owner_id, user_id")
            .eq("user_id", user.id),
        ])
        if (cancelled) return
        const directUnread = direct.count ?? 0
        const clubMap = new Map<string, number>()
        for (const r of (club.data ?? []) as any[]) {
          if (!clubMap.has(r.club_id)) clubMap.set(r.club_id, r.unread_count ?? 0)
        }
        const gbMap = new Map<string, number>()
        for (const r of (gb.data ?? []) as any[]) {
          if (gbMap.has(r.post_id)) continue
          // 🅲 광장 격리 — 본인 광장 채팅만 카운트
          if (plazaId) {
            const isOwner = r.owner_id === user.id
            const matchPlaza = isOwner
              ? r.plaza_id === plazaId
              : (r.buyer_plaza_id ?? r.plaza_id) === plazaId
            if (!matchPlaza) continue
          }
          gbMap.set(r.post_id, r.unread_count ?? 0)
        }
        const clubUnread = [...clubMap.values()].reduce((a, b) => a + b, 0)
        const gbUnread = [...gbMap.values()].reduce((a, b) => a + b, 0)
        setTotal(directUnread + clubUnread + gbUnread)
      } catch {
        // RLS 차단/네트워크 에러 등 — silent
      }
    }

    fetchTotal()
    timer = setInterval(fetchTotal, 60_000)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [user, plazaId])

  return total
}
