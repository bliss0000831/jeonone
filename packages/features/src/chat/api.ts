/**
 * 채팅 API — Supabase 직접 호출 (DI 패턴).
 *
 * 사용:
 *   import { listChatRooms, sendMessage } from "@gwangjang/features/chat"
 *   const rooms = await listChatRooms(supabase, userId, plazaId)
 *
 * 모든 함수는 Supabase RLS 가 보호 — 인증된 유저가 권한 없는 접근 시 에러 throw.
 */

import type {
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js"
import type {
  AccountType,
  ChatParticipant,
  ChatRoom,
  ChatRoomWithMeta,
  ChatPostType,
  ClubChatRoom,
  Expert,
  GbChatRoom,
  Message,
} from "@gwangjang/types/chat"

// ── Local row interfaces (Supabase query result shapes) ───────────────

/** chat_rooms row — select 된 컬럼만 */
interface ChatRoomRow {
  id: string
  property_id: string | null
  buyer_id: string
  seller_id: string
  post_type: ChatPostType
  plaza_id: string
  buyer_plaza_id: string | null
  created_at: string
  updated_at: string
  last_message: string | null
  last_message_at: string | null
}

/** profiles row — select 된 컬럼만 */
interface ProfileRow {
  id: string
  nickname: string | null
  full_name: string | null
  avatar_url: string | null
  account_type: string | null
  phone: string | null
}

/** plaza_profiles row — 공통 컬럼 */
interface PlazaProfileRow {
  user_id: string
  plaza_id: string
  nickname: string | null
  avatar_url: string | null
  account_type: string | null
  phone: string | null
  joined_at?: string
}

/** Supabase query result wrapper (for Promise.resolve fallback) */
interface SupabaseDataResult<T> {
  data: T[] | null
}

// ── 채팅방 목록 / 상세 ─────────────────────────────────────────────────

/**
 * 사용자가 참여 중인 채팅방 목록.
 *
 * @param supabase Supabase client (인증된 사용자)
 * @param userId 현재 사용자 id (auth.users.id)
 * @param plazaId 광장 id (멀티-광장 격리)
 *
 * 반환:
 *   각 방의 상대방 프로필 + 안 읽은 메시지 수 + 마지막 메시지 시각 정렬.
 */
export async function listChatRooms(
  supabase: SupabaseClient,
  userId: string,
  plazaId?: string | null,
): Promise<ChatRoomWithMeta[]> {
  // 1. 참여 중인 방 (buyer 또는 seller) — 전체 조회 후 JS 에서 광장 필터
  // plazaId 가 null/undefined 이면 모든 광장의 채팅방 표시 (격리 해제).
  // 🅲 광장 격리 규칙 (참여자별 본인 광장 기준):
  //   · I'm seller → plaza_id == 현재 광장
  //   · I'm buyer  → buyer_plaza_id == 현재 광장 (NULL 이면 plaza_id 로 fallback)
  // → 본인이 춘천에서 만든 채팅은 강릉에서 안 보이고, cross-plaza 거래는
  //   양쪽 광장 (seller 광장 / buyer 광장) 에 각각 노출됨.
  const { data: allRooms, error } = await supabase
    .from("chat_rooms")
    .select("id, property_id, buyer_id, seller_id, post_type, plaza_id, buyer_plaza_id, created_at, updated_at, last_message, last_message_at")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(100)
  if (error) throw error
  if (!allRooms || allRooms.length === 0) return []
  const rooms = (allRooms as ChatRoomRow[]).filter((r) => {
    // plazaId 미지정 시 모든 광장의 채팅방 표시 (격리 해제)
    if (!plazaId) return true
    // 🅲 DM (post_type='direct') 은 광장 무관 — 두 유저 간 직접 메시지는
    //   어느 광장에 있든 양쪽 모두에게 노출 (광장 격리 제외 케이스).
    if (r.post_type === "direct") {
      return r.buyer_id === userId || r.seller_id === userId
    }
    if (r.seller_id === userId) {
      return r.plaza_id === plazaId
    }
    if (r.buyer_id === userId) {
      const buyerPlaza = r.buyer_plaza_id ?? r.plaza_id
      return buyerPlaza === plazaId
    }
    return false
  }).slice(0, 50)
  if (rooms.length === 0) return []

  // 2. 상대방 프로필 batch 조회 — 🅲 채팅방의 plaza_id 기준 plaza_profile 우선
  const otherUserIds = rooms.map((r) =>
    r.buyer_id === userId ? r.seller_id : r.buyer_id,
  )
  const uniqueOtherIds = Array.from(new Set(otherUserIds))

  // 글로벌 profiles + 모든 plaza_profiles batch
  const [profsRes, ppsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nickname, full_name, avatar_url, account_type, phone")
      .in("id", uniqueOtherIds),
    uniqueOtherIds.length > 0
      ? supabase
          .from("plaza_profiles")
          .select("user_id, plaza_id, nickname, avatar_url, account_type, phone, joined_at")
          .in("user_id", uniqueOtherIds)
          .order("joined_at", { ascending: true })
      : Promise.resolve({ data: null } as SupabaseDataResult<PlazaProfileRow>),
  ])

  // (user_id, plaza_id) → plaza_profile
  const ppKeyMap = new Map<string, PlazaProfileRow>()
  // user_id → all plaza_ids (joined_at ASC 순)
  const allPlazasByUser = new Map<string, string[]>()
  for (const pp of (ppsRes?.data ?? []) as PlazaProfileRow[]) {
    ppKeyMap.set(`${pp.user_id}|${pp.plaza_id}`, pp)
    const arr = allPlazasByUser.get(pp.user_id) ?? []
    arr.push(pp.plaza_id)
    allPlazasByUser.set(pp.user_id, arr)
  }
  // 🅲 상대방 광장 결정:
  //   · DM       — viewer 광장과 다른 plaza_profile 우선 (= cross-plaza identity)
  //                없으면 viewer 광장과 같은 것 (intra-plaza DM)
  //                둘 다 없으면 chat_rooms 데이터 fallback
  //   · post-anchored — viewer=seller → buyer_plaza_id, viewer=buyer → plaza_id (기존 패턴)
  function otherPlazaOf(r: ChatRoomRow, viewerId: string): string | null {
    const other = r.buyer_id === viewerId ? r.seller_id : r.buyer_id
    if (r.post_type === "direct") {
      const plazas = allPlazasByUser.get(other) ?? []
      // viewer's plazaId 와 다른 plaza_profile 우선
      const crossPlaza = plazas.find((pz) => pz !== plazaId)
      if (crossPlaza) return crossPlaza
      // 같은 광장 plaza_profile 만 있으면 그것
      if (plazas.length > 0) return plazas[0]
      // plaza_profile 전혀 없으면 chat_rooms 데이터
      return r.plaza_id ?? null
    }
    if (other === r.seller_id) return r.plaza_id ?? null
    return r.buyer_plaza_id ?? r.plaza_id ?? null
  }

  // user_id → global profile fallback
  const profileMap = new Map<string, ChatParticipant>(
    ((profsRes.data ?? []) as ProfileRow[]).map((p) => [
      p.id,
      {
        id: p.id,
        nickname: p.nickname,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        account_type: p.account_type as AccountType | null,
        phone: p.phone,
        role: "buyer",
      },
    ]),
  )
  // 룸별 plaza_profile overlay map — `${other_user_id}|${room.id}` 키
  // 룸별 상대방 광장 (칩 표시용)
  const roomOtherPlazaMap = new Map<string, string | null>()
  const roomParticipantMap = new Map<string, ChatParticipant>()
  for (const r of rooms as ChatRoomRow[]) {
    const other = r.buyer_id === userId ? r.seller_id : r.buyer_id
    const targetPlaza = otherPlazaOf(r, userId)
    roomOtherPlazaMap.set(r.id, targetPlaza)
    const pp = targetPlaza ? ppKeyMap.get(`${other}|${targetPlaza}`) : null
    const base = profileMap.get(other)
    if (!base) continue
    const merged: ChatParticipant = pp
      ? {
          ...base,
          nickname: pp.nickname ?? base.nickname,
          avatar_url: pp.avatar_url ?? null,
          account_type: (pp.account_type ?? null) as AccountType | null,
          phone: pp.phone ?? null,
        }
      : base
    roomParticipantMap.set(`${other}|${r.id}`, merged)
  }

  // 3. 안 읽은 메시지 카운트 + 전문가 초대 카운트 (병렬)
  const roomIds = rooms.map((r) => r.id)
  const [{ data: unread }, { data: experts }] = await Promise.all([
    supabase
      .from("messages")
      .select("chat_room_id")
      .in("chat_room_id", roomIds)
      .eq("is_read", false)
      .neq("sender_id", userId),
    supabase
      .from("expert_invitations")
      .select("chat_room_id, expert_id")
      .in("chat_room_id", roomIds)
      .eq("status", "accepted"),
  ])
  const unreadMap = new Map<string, number>()
  for (const m of unread ?? []) {
    unreadMap.set(m.chat_room_id, (unreadMap.get(m.chat_room_id) ?? 0) + 1)
  }
  const expertCountMap = new Map<string, number>()
  // room → expert_id 목록
  const expertIdsByRoom = new Map<string, string[]>()
  for (const e of (experts ?? []) as { chat_room_id: string; expert_id: string }[]) {
    expertCountMap.set(e.chat_room_id, (expertCountMap.get(e.chat_room_id) ?? 0) + 1)
    const arr = expertIdsByRoom.get(e.chat_room_id) ?? []
    arr.push(e.expert_id)
    expertIdsByRoom.set(e.chat_room_id, arr)
  }

  // 전문가 아바타 batch 조회 — 이미 profileMap 에 없는 ID 만
  const allExpertIds = new Set<string>()
  for (const ids of expertIdsByRoom.values()) {
    for (const id of ids) {
      if (!profileMap.has(id)) allExpertIds.add(id)
    }
  }
  const expertAvatarMap = new Map<string, string | null>()
  if (allExpertIds.size > 0) {
    const { data: expProfs } = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .in("id", Array.from(allExpertIds))
    for (const p of expProfs ?? []) {
      expertAvatarMap.set(p.id, p.avatar_url ?? null)
    }
  }

  return rooms.map((r) => {
    const otherId = r.buyer_id === userId ? r.seller_id : r.buyer_id
    // 채팅방별 상대방 광장 기준 overlay 우선
    const overlayed = roomParticipantMap.get(`${otherId}|${r.id}`)
    const otherUser = overlayed ?? profileMap.get(otherId) ?? {
      id: otherId,
      nickname: null,
      full_name: null,
      avatar_url: null,
      account_type: null,
      phone: null,
      role: r.buyer_id === userId ? "seller" : "buyer",
    }
    const expertCount = expertCountMap.get(r.id) ?? 0
    // 참여자 아바타 수집 — 본인 제외, 최대 2개
    const avatars: string[] = []
    // 1) 상대방 (otherUser)
    const otherAv = overlayed?.avatar_url ?? profileMap.get(otherId)?.avatar_url
    if (otherAv) avatars.push(otherAv)
    // 2) 전문가들
    for (const eid of expertIdsByRoom.get(r.id) ?? []) {
      if (avatars.length >= 2) break
      if (eid === userId) continue // 본인 제외
      const av = profileMap.get(eid)?.avatar_url ?? expertAvatarMap.get(eid)
      if (av && !avatars.includes(av)) avatars.push(av)
    }
    return {
      ...r,
      otherUser: {
        ...otherUser,
        role: r.buyer_id === userId ? "seller" : "buyer",
      },
      unreadCount: unreadMap.get(r.id) ?? 0,
      // 2 (buyer+seller) + 수락된 전문가 수
      participantsCount: 2 + expertCount,
      participantAvatars: avatars,
      // 🅲 칩 표시용 — DM 은 상대방 home 광장, 그 외는 post-anchored 광장
      otherPlazaForDisplay: roomOtherPlazaMap.get(r.id) ?? null,
    }
  })
}

/** 특정 채팅방 상세 (참가자 정보 포함) */
export async function getChatRoom(
  supabase: SupabaseClient,
  roomId: string,
): Promise<ChatRoom | null> {
  const { data, error } = await supabase
    .from("chat_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── 메시지 ─────────────────────────────────────────────────────────────

/**
 * 채팅방의 메시지 목록 (최신순 — RN FlatList 의 inverted 모드용).
 *
 * 페이지네이션:
 *   - opts.before: ISO 시각. 이 시각 이전 메시지만 (오래된 메시지 추가 로딩)
 *   - opts.limit: 기본 50
 */
export async function listMessages(
  supabase: SupabaseClient,
  roomId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<Message[]> {
  const limit = opts.limit ?? 50
  let query = supabase
    .from("messages")
    .select("id, chat_room_id, sender_id, content, is_read, is_system, plaza_id, created_at")
    .eq("chat_room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (opts.before) {
    query = query.lt("created_at", opts.before)
  }
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * 메시지 전송.
 *
 * RLS 가 권한 검증 (buyer/seller 또는 accepted expert 만 INSERT).
 * 성공 시 chat_rooms.updated_at + last_message 도 갱신 (함수 내에서 처리).
 */
export async function sendMessage(
  supabase: SupabaseClient,
  roomId: string,
  senderId: string,
  content: string,
  plazaId: string,
): Promise<Message> {
  if (!content.trim()) {
    throw new Error("메시지 내용이 비어있습니다")
  }
  if (content.length > 5000) {
    throw new Error("메시지는 5000자 이하로 작성해주세요")
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      chat_room_id: roomId,
      sender_id: senderId,
      content: content.trim(),
      plaza_id: plazaId,
      is_read: false,
    })
    .select()
    .single()
  if (error) throw error

  // 채팅방 메타 갱신 (최신 메시지 미리보기) — fire-and-forget
  void supabase
    .from("chat_rooms")
    .update({
      last_message: content.trim().slice(0, 100),
      last_message_at: data.created_at,
      updated_at: data.created_at,
    })
    .eq("id", roomId)

  return data
}

/**
 * 채팅방 진입 시 미읽음 메시지를 읽음 처리.
 * (자기가 보낸 메시지 제외)
 */
export async function markAsRead(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ is_read: true })
    .eq("chat_room_id", roomId)
    .neq("sender_id", userId)
    .eq("is_read", false)
  if (error) throw error
}

// ── Realtime 구독 ──────────────────────────────────────────────────────

/**
 * 채팅방 메시지 INSERT 실시간 구독.
 *
 * @returns 구독 해제 함수. useEffect cleanup 에서 호출 권장.
 */
export function subscribeToMessages(
  supabase: SupabaseClient,
  roomId: string,
  onMessage: (message: Message) => void,
): () => void {
  // 채널 이름 충돌 방지 — 같은 룸 재진입 시 이전 채널 위에 .on() 추가하면
  // "cannot add postgres_changes callbacks after subscribe()" 에러 발생.
  // 1) 같은 topic 의 기존 채널 모두 제거
  // 2) timestamp 로 unique 이름 사용
  const topicPrefix = `chat-room-${roomId}`
  try {
    const existing = (supabase as unknown as { getChannels?: () => RealtimeChannel[] }).getChannels?.() ?? []
    for (const ch of existing) {
      const topic = ((ch as unknown as { topic?: string })?.topic) ?? ""
      if (topic === `realtime:${topicPrefix}` || topic.startsWith(`realtime:${topicPrefix}-`)) {
        try { supabase.removeChannel(ch) } catch { /* noop */ }
      }
    }
  } catch { /* noop */ }

  const channelName = `${topicPrefix}-${Date.now()}`
  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `chat_room_id=eq.${roomId}`,
      },
      (payload) => {
        onMessage(payload.new as Message)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// ── 채팅방 참가자 ──────────────────────────────────────────────────────

/**
 * 채팅방의 모든 참가자 (buyer + seller + accepted experts).
 *
 * @param viewerCurrentPlaza DM 의 경우 viewer 광장과 다른 plaza_profile 을 상대방 identity 로 사용.
 *   (없으면 옛 동작 — chat_rooms.plaza_id/buyer_plaza_id 기반)
 */
export async function listRoomParticipants(
  supabase: SupabaseClient,
  roomId: string,
  viewerCurrentPlaza?: string | null,
): Promise<ChatParticipant[]> {
  const { data: room } = await supabase
    .from("chat_rooms")
    .select("buyer_id, seller_id, plaza_id, buyer_plaza_id, post_type")
    .eq("id", roomId)
    .maybeSingle()
  if (!room) return []

  const baseIds = [room.buyer_id, room.seller_id]
  const { data: invites } = await supabase
    .from("expert_invitations")
    .select("expert_id")
    .eq("chat_room_id", roomId)
    .eq("status", "accepted")
  const expertIds = (invites ?? []).map((i) => i.expert_id)

  const allIds = Array.from(new Set([...baseIds, ...expertIds]))
  const roomTyped = room as { buyer_id: string; seller_id: string; plaza_id: string | null; buyer_plaza_id: string | null; post_type: string }
  const sellerPlaza = roomTyped.plaza_id
  const buyerPlaza = roomTyped.buyer_plaza_id ?? sellerPlaza
  const roomLocal = roomTyped
  const isDM = roomTyped.post_type === "direct"

  // DM 의 경우 각 유저의 모든 plaza_profiles 를 fetch (joined_at ASC)
  // → viewer 광장과 다른 plaza_profile 우선 선택 (cross-plaza identity)
  const allPlazasByUser = new Map<string, string[]>()
  if (isDM && allIds.length > 0) {
    const { data: homes } = await supabase
      .from("plaza_profiles")
      .select("user_id, plaza_id, joined_at")
      .in("user_id", allIds)
      .order("joined_at", { ascending: true })
    for (const h of (homes ?? []) as { user_id: string; plaza_id: string; joined_at: string }[]) {
      const arr = allPlazasByUser.get(h.user_id) ?? []
      arr.push(h.plaza_id)
      allPlazasByUser.set(h.user_id, arr)
    }
  }

  function plazaForUser(uid: string): string | null {
    if (isDM) {
      const plazas = allPlazasByUser.get(uid) ?? []
      // viewer 광장과 다른 plaza_profile 우선 (cross-plaza identity 추적)
      if (viewerCurrentPlaza) {
        const cross = plazas.find((pz) => pz !== viewerCurrentPlaza)
        if (cross) return cross
      }
      if (plazas.length > 0) return plazas[0]
      // plaza_profile 없으면 chat_rooms 데이터 fallback
      return uid === roomLocal.buyer_id ? buyerPlaza : sellerPlaza
    }
    if (uid === roomLocal.buyer_id) return buyerPlaza
    return sellerPlaza
  }

  // 광장별로 쿼리를 묶어 발행 (대부분 같은 광장 — N+1 방지)
  const plazaToIds = new Map<string, string[]>()
  for (const uid of allIds) {
    const pz = plazaForUser(uid)
    if (!pz) continue
    const arr = plazaToIds.get(pz) ?? []
    arr.push(uid)
    plazaToIds.set(pz, arr)
  }

  const ppQueries = Array.from(plazaToIds.entries()).map(([pz, ids]) =>
    supabase
      .from("plaza_profiles")
      .select("user_id, plaza_id, nickname, avatar_url, account_type, phone")
      .in("user_id", ids)
      .eq("plaza_id", pz),
  )

  const [profsRes, ...ppResList] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nickname, full_name, avatar_url, account_type, phone")
      .in("id", allIds),
    ...ppQueries,
  ])
  // (user_id, plaza_id) → plaza_profile row
  const ppMap = new Map<string, PlazaProfileRow>()
  for (const r of ppResList) {
    for (const pp of ((r as SupabaseDataResult<PlazaProfileRow>)?.data ?? []) as PlazaProfileRow[]) {
      ppMap.set(`${pp.user_id}|${pp.plaza_id}`, pp)
    }
  }

  return ((profsRes.data ?? []) as ProfileRow[]).map((p) => {
    const targetPlaza = plazaForUser(p.id)
    const emptyPP: Partial<PlazaProfileRow> = {}
    const pp = targetPlaza ? ppMap.get(`${p.id}|${targetPlaza}`) ?? emptyPP : emptyPP
    const hasPP = !!(targetPlaza && ppMap.has(`${p.id}|${targetPlaza}`))
    // 🅲 strict overlay — plaza_profile 있으면 그 값만 (없으면 base profiles)
    return {
      id: p.id,
      nickname: hasPP ? (pp.nickname ?? p.nickname) : p.nickname,
      full_name: p.full_name,
      avatar_url: hasPP ? (pp.avatar_url ?? null) : p.avatar_url,
      account_type: (hasPP ? pp.account_type : p.account_type) as AccountType | null,
      phone: hasPP ? (pp.phone ?? null) : p.phone,
      role:
        p.id === roomTyped.buyer_id
          ? "buyer"
          : p.id === roomTyped.seller_id
            ? "seller"
            : "expert",
      // navigation 시 ?plaza= 에 사용 — 휴리스틱 결과 plaza
      plaza_id: targetPlaza,
    }
  })
}

// ── 전문가 검색 / 초대 ─────────────────────────────────────────────────

/** 전문가 목록 조회 (account_type + 광장 필터 + 지역 필터 + trust_score 정렬) */
export async function listExperts(
  supabase: SupabaseClient,
  plazaId: string,
  filters: {
    accountType: AccountType
    /** 지역 부분매칭 (예: "동내면") — undefined 면 광장 전체 */
    locationContains?: string
    /** 결과 제한 (default 50) */
    limit?: number
  },
): Promise<Expert[]> {
  // 🅲 광장 격리 — plaza_profiles 의 account_type + location + trust_score 으로 검색
  let q = supabase
    .from("plaza_profiles")
    .select(
      "user_id, nickname, avatar_url, account_type, location, trust_score, review_count",
    )
    .eq("plaza_id", plazaId)
    .eq("account_type", filters.accountType)
    .order("trust_score", { ascending: false, nullsFirst: false })
    .limit(filters.limit ?? 50)
  if (filters.locationContains) {
    const escaped = filters.locationContains.replace(/%/g, '\\%').replace(/_/g, '\\_')
    q = q.ilike("location", `%${escaped}%`)
  }
  const { data: pps, error } = await q
  if (error) throw error
  interface ExpertPlazaRow {
    user_id: string
    nickname: string | null
    avatar_url: string | null
    account_type: string
    location: string | null
    trust_score: number | null
    review_count: number | null
  }
  const rows = (pps ?? []) as ExpertPlazaRow[]
  if (rows.length === 0) return []

  // full_name 은 글로벌 profiles 에서 (plaza_profiles 에 없음) — 별도 batch
  const userIds = rows.map((r) => r.user_id)
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds)
  const fullNameMap = new Map<string, string | null>()
  for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) fullNameMap.set(p.id, p.full_name)

  return rows.map((r) => ({
    id: r.user_id,
    nickname: r.nickname,
    full_name: fullNameMap.get(r.user_id) ?? null,
    avatar_url: r.avatar_url,
    account_type: r.account_type,
    location: r.location,
    trust_score: r.trust_score,
    review_count: r.review_count,
  })) as Expert[]
}

// ── 채팅방 Context (매물/게시글 정보) ──────────────────────────────────

/**
 * post_type 별 원본 게시글 fetch — 채팅방 상단 ContextCard 표시용.
 *
 * 광장 web 의 chat/[roomId]/page.tsx 의 fetchPostContext 와 1:1 매칭.
 * 11개 post_type 분기 (property / sharing / new_store / local_food /
 *   group_buying / interior / moving / cleaning / repair / secondhand /
 *   jobs / direct).
 */
export async function loadPostContext(
  supabase: SupabaseClient,
  room: {
    id: string
    property_id: string | null
    buyer_id: string
    seller_id: string
    post_type: string
  },
  currentUserId: string,
  viewerCurrentPlaza?: string | null,
): Promise<import("@gwangjang/types/chat").ChatContextDescriptor | null> {
  const postType = room.post_type
  const postId = room.property_id

  const formatManwon = (price: number) => {
    if (price >= 10000) {
      const eok = Math.floor(price / 10000)
      const man = price % 10000
      return man === 0 ? `${eok}억` : `${eok}억 ${man.toLocaleString()}만원`
    }
    return `${price.toLocaleString()}만원`
  }
  const formatRange = (
    min: number | null,
    max: number | null,
    unit?: string | null,
  ) => {
    const u = unit || "만원"
    if (!min && !max) return "가격 문의"
    if (min && max) return `${min.toLocaleString()}~${max.toLocaleString()}${u}`
    if (min) return `${min.toLocaleString()}${u}~`
    return `~${max?.toLocaleString()}${u}`
  }

  try {
    if (postType === "direct") {
      // DM — 상대방의 plaza_profile 중 viewer 광장과 "다른" 것 우선 (cross-plaza identity)
      const otherUserId =
        room.buyer_id === currentUserId ? room.seller_id : room.buyer_id

      const [profRes, ppsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, nickname, full_name, avatar_url")
          .eq("id", otherUserId)
          .maybeSingle(),
        supabase
          .from("plaza_profiles")
          .select("plaza_id, nickname, avatar_url, joined_at")
          .eq("user_id", otherUserId)
          .order("joined_at", { ascending: true }),
      ])
      const base = profRes?.data as { id: string; nickname: string | null; full_name: string | null; avatar_url: string | null } | null
      if (!base) return null
      const pps = ((ppsRes?.data ?? []) as { plaza_id: string; nickname: string | null; avatar_url: string | null; joined_at: string }[])
      // viewer 광장과 다른 plaza_profile 우선
      const pp =
        (viewerCurrentPlaza
          ? pps.find((p) => p.plaza_id !== viewerCurrentPlaza)
          : null) ?? pps[0] ?? null
      const otherPlaza = pp?.plaza_id ?? null
      const nickname = pp ? (pp.nickname ?? base.nickname) : base.nickname
      const avatar = pp ? (pp.avatar_url ?? null) : base.avatar_url
      const name = nickname || base.full_name || "사용자"
      const qs = otherPlaza ? `?plaza=${encodeURIComponent(otherPlaza)}` : ""
      return {
        href: `/profile/${base.id}${qs}`,
        image: avatar,
        title: name,
        subtitle: null,
        meta: "다이렉트 메시지",
        badgeLabel: "DM",
        badgeTone: "muted",
      }
    }

    if (!postId) return null

    if (postType === "property") {
      const { data } = await supabase
        .from("properties")
        .select("id, title, price, transaction_type, images, status, address")
        .eq("id", postId)
        .single()
      if (!data) return null
      const d = data as { id: string; title: string; price: number; transaction_type: string | null; images: string[] | null; status: string; address: string | null }
      const tone =
        d.status === "active" ? "primary" : d.status === "reserved" ? "amber" : "muted"
      const label =
        d.status === "active" ? "판매중" : d.status === "reserved" ? "예약중" : "거래완료"
      return {
        href: `/property/${d.id}`,
        image: d.images?.[0] ?? null,
        title: d.title,
        subtitle: d.address ?? null,
        meta: formatManwon(d.price),
        badgeLabel: label,
        badgeTone: tone as "primary" | "amber" | "muted",
      }
    }

    if (postType === "sharing") {
      const { data } = await supabase
        .from("sharing_posts")
        .select("id, title, images, status")
        .eq("id", postId)
        .single()
      if (!data) return null
      const d = data as { id: string; title: string; images: string[] | null; status: string }
      const label =
        d.status === "reserved"
          ? "예약중"
          : d.status === "completed"
            ? "나눔완료"
            : "나눔중"
      const tone =
        d.status === "reserved"
          ? "amber"
          : d.status === "completed"
            ? "muted"
            : "primary"
      return {
        href: `/sharing/${d.id}`,
        image: d.images?.[0] ?? null,
        title: d.title,
        meta: "무료 나눔",
        badgeLabel: label,
        badgeTone: tone as "primary" | "amber" | "muted",
      }
    }

    if (postType === "new_store") {
      const { data } = await supabase
        .from("new_store_posts")
        .select("id, store_name, images, category")
        .eq("id", postId)
        .single()
      if (!data) return null
      const d = data as { id: string; store_name: string; images: string[] | null; category: string | null }
      return {
        href: `/new-store/${d.id}`,
        image: d.images?.[0] ?? null,
        title: d.store_name,
        meta: d.category || "신장개업",
        badgeLabel: "신장개업",
        badgeTone: "primary",
      }
    }

    if (postType === "local_food") {
      const { data } = await supabase
        .from("local_food")
        .select("id, title, images, price, unit, category")
        .eq("id", postId)
        .single()
      if (!data) return null
      const d = data as { id: string; title: string; images: string[] | null; price: number | null; unit: string | null; category: string | null }
      const priceStr =
        typeof d.price === "number"
          ? `${d.price.toLocaleString()}원${
              d.unit ? ` / ${d.unit}` : ""
            }`
          : "가격 문의"
      return {
        href: `/local-food/${d.id}`,
        image: d.images?.[0] ?? null,
        title: d.title,
        meta: priceStr,
        badgeLabel: d.category || "로컬푸드",
        badgeTone: "primary",
      }
    }

    if (postType === "group_buying") {
      // group_buying_posts 는 price 컬럼 없음 → group_price / original_price 사용
      const { data } = await supabase
        .from("group_buying_posts")
        .select("id, title, images, group_price, original_price, status")
        .eq("id", postId)
        .single()
      if (!data) return null
      const d = data as { id: string; title: string; images: string[] | null; group_price: number | null; original_price: number | null; status: string }
      const gp = d.group_price
      const op = d.original_price
      const meta =
        typeof gp === "number"
          ? typeof op === "number" && op > gp
            ? `${gp.toLocaleString()}원 (정가 ${op.toLocaleString()}원)`
            : `${gp.toLocaleString()}원`
          : null
      return {
        href: `/group-buying/${d.id}`,
        image: d.images?.[0] ?? null,
        title: d.title,
        meta,
        badgeLabel: "공동구매",
        badgeTone: "primary",
      }
    }

    if (["interior", "moving", "cleaning", "repair"].includes(postType)) {
      const tableName = `${postType}_posts`
      const { data } = await supabase
        .from(tableName)
        .select(
          "id, title, images, category, min_price, max_price, price_unit",
        )
        .eq("id", postId)
        .single()
      if (!data) return null
      const d = data as { id: string; title: string; images: string[] | null; category: string | null; min_price: number | null; max_price: number | null; price_unit: string | null }
      const badgeMap: Record<string, string> = {
        interior: "인테리어",
        moving: "이사",
        cleaning: "청소",
        repair: "수리",
      }
      return {
        href: `/${postType}/${d.id}`,
        image: d.images?.[0] ?? null,
        title: d.title,
        meta: formatRange(d.min_price, d.max_price, d.price_unit),
        badgeLabel: d.category || badgeMap[postType],
        badgeTone: "primary",
      }
    }

    if (postType === "secondhand") {
      const { data } = await supabase
        .from("secondhand_posts")
        .select("id, title, images, price, category, status")
        .eq("id", postId)
        .single()
      if (!data) return null
      const d = data as { id: string; title: string; images: string[] | null; price: number | null; category: string | null; status: string }
      const priceStr =
        typeof d.price === "number" && d.price > 0
          ? `${d.price.toLocaleString()}원`
          : "가격 문의"
      return {
        href: `/secondhand/${d.id}`,
        image: d.images?.[0] ?? null,
        title: d.title,
        meta: priceStr,
        badgeLabel: d.category || "중고거래",
        badgeTone: "primary",
      }
    }

    if (postType === "jobs") {
      const { data } = await supabase
        .from("jobs_posts")
        .select("id, title, images, category, hourly_wage, kind")
        .eq("id", postId)
        .single()
      if (!data) return null
      const d = data as { id: string; title: string; images: string[] | null; category: string | null; hourly_wage: number | null; kind: string | null }
      return {
        href: `/jobs/${d.id}`,
        image: d.images?.[0] ?? null,
        title: d.title,
        meta:
          typeof d.hourly_wage === "number"
            ? `시급 ${d.hourly_wage.toLocaleString()}원`
            : null,
        badgeLabel:
          d.category ||
          (d.kind === "seeking" ? "구직" : "구인"),
        badgeTone: "primary",
      }
    }
  } catch (err) {
    console.error("[loadPostContext]", err)
  }
  return null
}

/** 전문가 한 명 정보 */
export async function getExpert(
  supabase: SupabaseClient,
  expertId: string,
): Promise<Expert | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, nickname, full_name, avatar_url, account_type, location, trust_score, review_count",
    )
    .eq("id", expertId)
    .maybeSingle()
  if (error) throw error
  return data as Expert | null
}

/**
 * 전문가 초대 생성.
 *
 * Supabase 직접 INSERT (RLS 가 buyer/seller 권한 검증).
 * 광장 web 의 /api/expert-invitations 는 추가로 알림 발송 + 시스템 메시지 INSERT 까지
 * 처리하므로, RN 에서도 광장 API 를 호출하는 게 알림 일관성에 더 좋음 — 호출 측에서 결정.
 *
 * 이 함수는 직접 INSERT 만. 알림 발송 필요하면 광장 API endpoint 호출 권장.
 */
export async function inviteExpert(
  supabase: SupabaseClient,
  input: {
    chatRoomId: string
    inviterId: string
    expertId: string
    propertyId?: string | null
    message?: string
  },
): Promise<{ id: string; status: "pending" }> {
  const { data, error } = await supabase
    .from("expert_invitations")
    .insert({
      chat_room_id: input.chatRoomId,
      inviter_id: input.inviterId,
      expert_id: input.expertId,
      property_id: input.propertyId ?? null,
      message: input.message ?? null,
      status: "pending",
    })
    .select("id, status")
    .single()
  if (error) throw error
  return data as { id: string; status: "pending" }
}

// ── 모임 / 공동구매 채팅방 목록 ─────────────────────────────────────────

/**
 * 내가 속한 모임 채팅방 목록.
 * my_club_chat_rooms 뷰 — RLS 가 user_id = auth.uid() 로 자동 필터링.
 */
export async function listClubRooms(
  supabase: SupabaseClient,
  plazaId?: string | null,
): Promise<import("@gwangjang/types/chat").ClubChatRoom[]> {
  let q = supabase
    .from("my_club_chat_rooms")
    .select("club_id, title, images, sport_type, status, max_members, current_members, user_id, joined_at, last_read_at, last_message, last_message_at, unread_count")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100)
  // 🅲 광장 격리 — clubs 채팅은 광장 내부만 (cross-plaza 아님)
  if (plazaId) q = q.eq("plaza_id", plazaId)
  const { data, error } = await q
  if (error) throw error
  const seen = new Set<string>()
  const out: ClubChatRoom[] = []
  for (const r of (data ?? []) as ClubChatRoom[]) {
    if (!r?.club_id || seen.has(r.club_id)) continue
    seen.add(r.club_id)
    out.push(r)
  }
  return out
}

/**
 * 내가 참여 중인 공동구매 채팅방 목록.
 * my_group_buying_chat_rooms 뷰 — RLS 가 user_id = auth.uid() 로 자동 필터링.
 *
 * 🅲 광장 격리 규칙 (참여자별 본인 광장 기준):
 *   · 내가 owner (seller) → plaza_id == 현재 광장
 *   · 내가 참여자 (buyer) → buyer_plaza_id == 현재 광장
 *     (buyer_plaza_id NULL 이면 plaza_id 로 fallback — 레거시)
 *   → 본인이 춘천에서 참여한 공구 채팅이 강릉에선 안 보임
 */
export async function listGbRooms(
  supabase: SupabaseClient,
  args?: { userId?: string | null; plazaId?: string | null },
): Promise<import("@gwangjang/types/chat").GbChatRoom[]> {
  const { data, error } = await supabase
    .from("my_group_buying_chat_rooms")
    .select("post_id, title, product_name, images, status, group_price, max_participants, current_participants, owner_id, user_id, payment_status, quantity, last_read_at, last_message, last_message_at, unread_count, plaza_id, buyer_plaza_id, visibility")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100)
  if (error) throw error
  // 뷰가 participant 별로 행을 반환하므로 post_id 기준 dedup.
  const seen = new Set<string>()
  const out: GbChatRoom[] = []
  for (const r of (data ?? []) as GbChatRoom[]) {
    if (!r?.post_id || seen.has(r.post_id)) continue
    // 광장 필터 — 본인 광장에서만 보임
    if (args?.plazaId && args?.userId) {
      const isOwner = r.owner_id === args.userId
      const matchPlaza = isOwner
        ? r.plaza_id === args.plazaId
        : (r.buyer_plaza_id ?? r.plaza_id) === args.plazaId
      if (!matchPlaza) continue
    }
    seen.add(r.post_id)
    out.push(r)
  }
  return out
}

// ── 1:1 채팅방 나가기 / 신고 ───────────────────────────────────────────

/**
 * 1:1 채팅방에서 나가기.
 * chat_rooms 의 buyer_id 또는 seller_id 가 본인이면 행 삭제.
 * (참여자가 두 명만 있는 구조라 한 쪽이 나가면 방을 정리해도 무방)
 */
export async function leaveDirectRoom(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<void> {
  // 본인이 참여한 방인지 확인 후 삭제
  const { data: room, error: rErr } = await supabase
    .from("chat_rooms")
    .select("id, buyer_id, seller_id")
    .eq("id", roomId)
    .single()
  if (rErr) throw rErr
  if (!room) throw new Error("채팅방을 찾을 수 없습니다")
  if (room.buyer_id !== userId && room.seller_id !== userId) {
    throw new Error("권한이 없습니다")
  }
  const { error: dErr } = await supabase
    .from("chat_rooms")
    .delete()
    .eq("id", roomId)
  if (dErr) throw dErr
}

/**
 * 채팅방 신고 — chat_reports 테이블에 기록.
 * 어떤 종류의 방이든 (direct/club/gb) 같은 테이블 사용.
 */
export async function reportChatRoom(
  supabase: SupabaseClient,
  args: {
    reporterId: string
    targetKind: "direct" | "club" | "gb"
    targetId: string
    reason: import("@gwangjang/types/chat").ChatReportReason
    detail?: string
  },
): Promise<void> {
  const { error } = await supabase
    .from("chat_reports")
    .insert({
      reporter_id: args.reporterId,
      target_kind: args.targetKind,
      target_id: args.targetId,
      reason: args.reason,
      detail: args.detail ?? null,
    })
  if (error) {
    // "relation ... does not exist" — 테이블 미생성 → 무시 (best-effort)
    if (error.message?.includes("does not exist")) return
    throw error
  }
}

/**
 * 게시글 → 채팅방 생성 진입 — 광장 web hooks/use-post-chat 의 handleChat 1:1 미러.
 * POST /api/chat/rooms { postId, postType } → room.id 반환.
 */
export type PostChatType =
  | "sharing"
  | "group_buying"
  | "new_store"
  | "interior"
  | "moving"
  | "cleaning"
  | "repair"
  | "local_food"
  | "secondhand"
  | "jobs"

interface ChatFetchAdapter {
  (input: string, init?: RequestInit): Promise<Response>
}

/**
 * 1:1 DM 채팅방 진입 — 프로필 페이지의 메시지 버튼에서 사용.
 * 두 유저 간 post_type="direct" 채팅방을 검색, 없으면 생성.
 */
export async function startDirectChat(
  supabase: SupabaseClient,
  args: {
    currentUserId: string
    otherUserId: string
    /** 채팅 시작자(buyer) 의 현재 광장 — buyer_plaza_id 에 저장 */
    plazaId: string
    /** 상대방(receiver) 의 광장 컨텍스트 — plaza_id 에 저장.
     *  프로필 페이지 ?plaza= 가 가리키는 광장. 없으면 sender plaza 사용 (legacy). */
    targetPlazaId?: string | null
  },
): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  if (args.currentUserId === args.otherUserId) {
    return { ok: false, error: "본인과는 대화할 수 없습니다" }
  }
  try {
    // 기존 direct 방 검색 (양방향)
    const { data: existing } = await supabase
      .from("chat_rooms")
      .select("id, buyer_id, plaza_id, buyer_plaza_id")
      .eq("post_type", "direct")
      .or(
        `and(buyer_id.eq.${args.currentUserId},seller_id.eq.${args.otherUserId}),and(buyer_id.eq.${args.otherUserId},seller_id.eq.${args.currentUserId})`,
      )
      .maybeSingle()

    const sellerPlaza = args.targetPlazaId ?? args.plazaId

    if (existing?.id) {
      // 🅲 기존 방 reuse — plaza 컨텍스트 refresh
      //   · plaza_id = receiver 광장으로 갱신 (현재 시작자가 보고있는 컨텍스트)
      //   · buyer_plaza_id = 현재 시작자가 자기인 경우에만 갱신 (남의 plaza 변경 X)
      const patch: Record<string, string> = { plaza_id: sellerPlaza }
      if (existing.buyer_id === args.currentUserId) {
        patch.buyer_plaza_id = args.plazaId
      }
      // fire-and-forget — 실패해도 채팅 진입은 가능
      void supabase.from("chat_rooms").update(patch).eq("id", existing.id)
        .then(({ error }) => { if (error) console.error("[startDirectChat] plaza update failed:", error) })
      return { ok: true, roomId: existing.id }
    }

    // 새 방 생성
    //   plaza_id        = receiver(seller) 의 광장 (프로필 컨텍스트)
    //   buyer_plaza_id  = 채팅 시작자(buyer) 의 현재 광장
    const { data: created, error } = await supabase
      .from("chat_rooms")
      .insert({
        buyer_id: args.currentUserId,
        seller_id: args.otherUserId,
        post_type: "direct",
        plaza_id: sellerPlaza,
        buyer_plaza_id: args.plazaId,
      })
      .select("id")
      .single()
    if (error) throw error
    return { ok: true, roomId: created.id }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message ?? "채팅방 생성에 실패했습니다" }
  }
}

export async function startPostChat(
  fetcher: ChatFetchAdapter,
  args: { postId: string; postType: PostChatType },
): Promise<{ ok: boolean; roomId?: string; error?: string; details?: unknown }> {
  try {
    const r = await fetcher("/api/chat/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: args.postId, postType: args.postType }),
    })
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const room = data?.room as Record<string, unknown> | undefined
    if (!r.ok || !room?.id) {
      const errMsg = (data?.error as string) || "채팅방 생성에 실패했습니다"
      const debugSuffix = data?.details ? `\n\n[debug] ${JSON.stringify(data.details)}` : ""
      return { ok: false, error: errMsg + debugSuffix, details: data?.details }
    }
    return { ok: true, roomId: room.id as string }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message ?? "채팅방 생성에 실패했습니다" }
  }
}
