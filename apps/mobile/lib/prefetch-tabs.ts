/**
 * 다른 탭(채팅/마이페이지)의 데이터를 미리 fetch + AsyncStorage 캐시.
 *
 * 사용처: HomeTab 마운트 후 ~800ms 뒤 호출.
 * 효과: 사용자가 채팅/마이페이지 탭 누르면 캐시 hit → 즉시 표시.
 */

import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  listChatRooms,
  listClubRooms,
  listGbRooms,
  loadPostContext,
} from "@gwangjang/features/chat"
import {
  getProfile,
  getProfileCard,
  countFollowers,
  countFollowing,
  getPointBalance,
  listHighlights,
} from "@gwangjang/features/profile"
import { getSupabase } from "@/lib/supabase"

export async function prefetchChatTab(userId: string, plaza: string) {
  try {
    const supabase = getSupabase()
    const [direct, clubs, gbs] = await Promise.all([
      listChatRooms(supabase, userId, plaza),
      listClubRooms(supabase, plaza).catch(() => []),
      listGbRooms(supabase, { userId, plazaId: plaza }).catch(() => []),
    ])
    // Limit context loading to first 10 rooms (sorted by recency) to avoid N+1 on prefetch
    const directWithCtx = await Promise.all(
      direct.map(async (r, i) => {
        const ctx = i < 10
          ? await loadPostContext(supabase, r as any, userId, plaza).catch(() => null)
          : null
        return { ...r, context: ctx }
      }),
    )
    // 캐시키에 plaza 포함 — chat.tsx 가 `chat:cache:${userId}:${plaza}` 로 읽음
    await AsyncStorage.setItem(
      `chat:cache:${userId}:${plaza}`,
      JSON.stringify({ directWithCtx, clubs, gbs, ts: Date.now() }),
    )
  } catch {
    /* 백그라운드 prefetch — 실패해도 무시 */
  }
}

export async function prefetchMypageTab(userId: string, plazaId: string) {
  try {
    const supabase = getSupabase()
    const [pRow, pCard, fers, fing, balance, hl] = await Promise.all([
      getProfile(supabase, userId),
      getProfileCard(supabase, userId, plazaId),
      countFollowers(supabase, userId).catch(() => 0),
      countFollowing(supabase, userId).catch(() => 0),
      getPointBalance(supabase, userId, plazaId).catch(() => null),
      listHighlights(supabase, userId).catch(() => []),
    ])
    await AsyncStorage.setItem(
      `mypage:cache:v1:${userId}:${plazaId ?? "none"}`,
      JSON.stringify({ pRow, pCard, fers, fing, balance, hl, ts: Date.now() }),
    )
  } catch {
    /* 백그라운드 prefetch — 실패해도 무시 */
  }
}
