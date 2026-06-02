/**
 * 채팅 탭 — 광장 web /chat 1:1 미러.
 *
 * 구조:
 *   1. Header (← 뒤로 / 채팅 / ⋯ 더보기) · 일괄편집 모드 시 (× 취소 / N개 선택 / 나가기)
 *   2. Filter Tabs (전체/부동산/나눔/신장개업/로컬푸드/서비스/공구/모임/공지)
 *   3. List — 섹션별 분기:
 *        - 부동산 / 나눔 / 신장개업 / 로컬푸드 / 서비스 (1:1 direct rooms)
 *        - 공동구매 채팅
 *        - 모임 채팅
 *        - 공지 (admin_notice)
 *
 * 인터랙션:
 *   - 길게 누름 → RoomMenuSheet (알림/차단/신고/나가기)
 *   - 일괄편집 모드 → 체크박스 + 나가기 일괄 실행
 *   - 차단된 항목은 목록에서 자동 숨김 (BlockedManagerSheet 에서 해제)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import {
  leaveDirectRoom,
  listChatRooms,
  listClubRooms,
  listGbRooms,
  loadPostContext,
  reportChatRoom,
  type ChatContextDescriptor,
  type ChatReportReason,
  type ChatRoomWithMeta,
  type ClubChatRoom,
  type GbChatRoom,
} from "@gwangjang/features/chat"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { SkeletonChatList } from "@/components/Skeleton"
import { chatPrefs } from "@/lib/chat-prefs"
import {
  ChatFilterTabs,
  type ChatFilterKey,
} from "@/components/chat/ChatFilterTabs"
import { RoomMenuSheet, type RoomMenuTarget } from "@/components/chat/RoomMenuSheet"
import { ChatHeaderMenu } from "@/components/chat/ChatHeaderMenu"
import { BlockedManagerSheet } from "@/components/chat/BlockedManagerSheet"
import { ReportSheet } from "@/components/chat/ReportSheet"
import { useCurrentPlaza } from "@/lib/plaza"
import { plazaName } from "@/lib/constants"

type DirectRoom = ChatRoomWithMeta & { context: ChatContextDescriptor | null }


const SERVICE_TYPES = ["interior", "moving", "cleaning", "repair"]

function getCategory(postType?: string | null): ChatFilterKey | "other" {
  if (!postType) return "property"
  if (postType === "property") return "property"
  if (postType === "admin_notice") return "notice"
  if (postType === "sharing") return "sharing"
  if (postType === "new_store") return "new_store"
  if (postType === "local_food") return "local_food"
  if (postType === "group_buying") return "group_buying"
  if (postType === "direct") return "direct"
  if (SERVICE_TYPES.includes(postType)) return "service"
  return "other"
}

function formatTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}일 전`
  return d.toLocaleDateString("ko-KR")
}

export default function ChatListTab() {
  const styles = useThemedStyles(makeStyles)
  const DEFAULT_PLAZA = useCurrentPlaza()
  const { user } = useAuth()
  const router = useRouter()

  const [directRooms, setDirectRooms] = useState<DirectRoom[]>([])
  const [clubRooms, setClubRooms] = useState<ClubChatRoom[]>([])
  const [gbRooms, setGbRooms] = useState<GbChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<ChatFilterKey>("all")

  // chatPrefs subscribe — 변경 시 리렌더
  const [, setTick] = useState(0)
  useEffect(() => {
    const unsub = chatPrefs.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [])
  const blockedSet = chatPrefs.getBlocked()
  const mutedSet = chatPrefs.getMuted()
  const notifOff = chatPrefs.getNotifOffAll()

  // 모달 / 시트 상태
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [roomMenu, setRoomMenu] = useState<RoomMenuTarget | null>(null)
  const [blockedManagerOpen, setBlockedManagerOpen] = useState(false)
  const [reportFor, setReportFor] = useState<RoomMenuTarget | null>(null)

  // 전문가 계정 여부 — 5종(agent/interior/moving/cleaning/repair) 만 "초대요청" 진입
  const [accountType, setAccountType] = useState<string | null>(null)
  const [pendingInviteCount, setPendingInviteCount] = useState(0)
  // 알림 종(홈 헤더와 동일) — 읽지않음 카운트
  const [unreadNotif, setUnreadNotif] = useState(0)
  const isExpert =
    accountType === "agent" ||
    accountType === "interior" ||
    accountType === "moving" ||
    accountType === "cleaning" ||
    accountType === "repair"

  // 일괄편집
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())

  // 광장 격리 해제 — 캐시 키는 유저별 (광장 무관)
  const cacheKey = user?.id ? `chat:cache:${user.id}:all` : null

  // 알림 unread 카운트 — 홈 헤더 종과 동일 (notifications 테이블, read_at IS NULL)
  useEffect(() => {
    if (!user) return
    const supabase = getSupabase()
    ;(async () => {
      try {
        let q: any = supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null)
        // 🅲 광장 격리
        if (DEFAULT_PLAZA) q = q.eq("plaza_id", DEFAULT_PLAZA)
        const { count } = await q
        setUnreadNotif(count ?? 0)
      } catch { /* noop */ }
    })()
  }, [user, DEFAULT_PLAZA])

  // 사용자 account_type 조회 + 대기 중 초대 카운트
  useEffect(() => {
    if (!user) return
    const supabase = getSupabase()
    ;(async () => {
      try {
        // 프로필 + 초대 카운트 병렬 조회 (초대 카운트는 expert 아니면 무시)
        const [profRes, invRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("account_type")
            .eq("id", user.id)
            .single(),
          supabase
            .from("expert_invitations")
            .select("id", { count: "exact", head: true })
            .eq("expert_id", user.id)
            .eq("status", "pending"),
        ])
        const t = profRes.data?.account_type ?? null
        setAccountType(t)
        if (
          t === "agent" || t === "interior" || t === "moving" ||
          t === "cleaning" || t === "repair"
        ) {
          setPendingInviteCount(invRes.count ?? 0)
        }
      } catch {}
    })()
  }, [user])

  const fetchAll = useCallback(async () => {
    if (!user) return
    setError(null)
    const supabase = getSupabase()
    try {
      const [direct, clubs, gbs] = await Promise.all([
        // 광장 격리 해제 — 모든 광장의 채팅방 통합 표시
        listChatRooms(supabase, user.id, null),
        listClubRooms(supabase, null).catch(() => []),
        listGbRooms(supabase, { userId: user.id }).catch(() => []),
      ])
      // direct rooms 의 context 병렬 로드 — 모든 방에 대해 로드 (listChatRooms 이 50개 cap)
      const directWithCtx = await Promise.all(
        direct.map(async (r) => {
          const ctx = await loadPostContext(supabase, r as any, user.id, DEFAULT_PLAZA ?? null).catch(() => null)
          return { ...r, context: ctx }
        }),
      )
      setDirectRooms(directWithCtx)
      setClubRooms(clubs as ClubChatRoom[])
      setGbRooms(gbs as GbChatRoom[])
      // 캐시 저장 — 다음 진입 시 즉시 표시
      if (cacheKey) {
        AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ directWithCtx, clubs, gbs, ts: Date.now() }),
        ).catch(() => {})
      }
    } catch (e: any) {
      setError(e?.message || "채팅방을 불러오지 못했습니다")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user, cacheKey])

  // 마운트 시 캐시 즉시 hydrate → 백그라운드로 fresh 데이터 fetch (SWR 패턴)
  useEffect(() => {
    if (!cacheKey) return
    let cancelled = false
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (cancelled || !raw) return
        try {
          const c = JSON.parse(raw)
          if (Array.isArray(c.directWithCtx)) setDirectRooms(c.directWithCtx)
          if (Array.isArray(c.clubs)) setClubRooms(c.clubs)
          if (Array.isArray(c.gbs)) setGbRooms(c.gbs)
          setLoading(false) // 캐시 있으면 spinner 즉시 사라짐
        } catch {}
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [cacheKey])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // 채팅방에서 메시지 보내고 돌아왔을 때 last_message 즉시 반영 — 탭 포커스 시 재조회.
  // useFocusEffect 는 mount 시에도 fire — useEffect(fetchAll) 와 중복 호출 방지.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      if (!user) return
      fetchAll()
    }, [fetchAll, user]),
  )

  // 차단 필터
  const visibleDirect = useMemo(() => directRooms.filter((r) => !blockedSet.has(`direct:${r.id}`)), [directRooms, blockedSet])
  const visibleClubs = useMemo(() => clubRooms.filter((r) => !blockedSet.has(`club:${r.club_id}`)), [clubRooms, blockedSet])
  const visibleGbs = useMemo(() => gbRooms.filter((r) => !blockedSet.has(`gb:${r.post_id}`)), [gbRooms, blockedSet])

  // 카운트 (필터 탭 카운트)
  const counts: Record<ChatFilterKey, number> = useMemo(() => {
    const c: Record<ChatFilterKey, number> = {
      all: visibleDirect.length + visibleClubs.length + visibleGbs.length,
      property: 0,
      sharing: 0,
      new_store: 0,
      local_food: 0,
      service: 0,
      group_buying: visibleGbs.length,
      direct: 0,
      club: visibleClubs.length,
      notice: 0,
    }
    for (const r of visibleDirect) {
      const k = getCategory(r.post_type)
      if (k !== "other") c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [visibleDirect, visibleClubs, visibleGbs])

  // 필터 적용
  const filteredDirect = useMemo(
    () => activeFilter === "all"
      ? visibleDirect
      : visibleDirect.filter((r) => getCategory(r.post_type) === activeFilter),
    [activeFilter, visibleDirect],
  )
  const showClubs = activeFilter === "all" || activeFilter === "club"
  const showGbs = activeFilter === "all" || activeFilter === "group_buying"
  const showSectionHeader = activeFilter === "all"

  // ── SectionList sections ─────────────────────────────
  type SectionItem =
    | { type: "direct"; item: DirectRoom }
    | { type: "club"; item: ClubChatRoom }
    | { type: "gb"; item: GbChatRoom }
    | { type: "notice"; item: DirectRoom }

  type ChatSection = {
    key: string
    title: string
    icon: string
    iconColor?: string
    data: SectionItem[]
  }

  const sections: ChatSection[] = useMemo(() => {
    const result: ChatSection[] = []

    // Direct sections — categorized
    const directCategories = [
      "property",
      "sharing",
      "new_store",
      "local_food",
      "service",
      "group_buying",
      "direct",
    ] as const
    for (const sec of directCategories) {
      const rooms = filteredDirect.filter((r) => getCategory(r.post_type) === sec)
      if (rooms.length === 0) continue
      result.push({
        key: sec,
        title: SECTION_LABELS[sec],
        icon: "chatbubble-ellipses-outline",
        data: rooms.map((r) => ({ type: "direct" as const, item: r })),
      })
    }

    // GB rooms
    if (showGbs && visibleGbs.length > 0) {
      result.push({
        key: "gb",
        title: "공동구매 채팅",
        icon: "cart-outline",
        iconColor: "#3b82f6",
        data: visibleGbs.map((r) => ({ type: "gb" as const, item: r })),
      })
    }

    // Club rooms
    if (showClubs && visibleClubs.length > 0) {
      result.push({
        key: "club",
        title: "모임 채팅",
        icon: "people-outline",
        iconColor: lightColors.primary,
        data: visibleClubs.map((r) => ({ type: "club" as const, item: r })),
      })
    }

    // Notice section
    const notices = filteredDirect.filter((r) => r.post_type === "admin_notice")
    if (notices.length > 0) {
      result.push({
        key: "notice",
        title: "공지",
        icon: "megaphone-outline",
        iconColor: lightColors.primary,
        data: notices.map((r) => ({ type: "notice" as const, item: r })),
      })
    }

    return result
  }, [filteredDirect, visibleGbs, visibleClubs, showGbs, showClubs])

  // 차단 라벨 매핑
  const labelFor = useCallback(
    (key: string) => {
      if (key.startsWith("direct:")) {
        const id = key.slice(7)
        const r = directRooms.find((x) => x.id === id)
        return r?.otherUser?.nickname || r?.context?.title || `1:1 채팅 ${id.slice(0, 6)}`
      }
      if (key.startsWith("club:")) {
        const id = key.slice(5)
        return clubRooms.find((x) => x.club_id === id)?.title || `모임 ${id.slice(0, 6)}`
      }
      if (key.startsWith("gb:")) {
        const id = key.slice(3)
        return gbRooms.find((x) => x.post_id === id)?.title || `공동구매 ${id.slice(0, 6)}`
      }
      return key
    },
    [directRooms, clubRooms, gbRooms],
  )

  // ── Handlers ──────────────────────────────────────

  function toggleBulk(key: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function exitBulk() {
    setBulkMode(false)
    setBulkSelected(new Set())
  }

  function runBulkLeave() {
    const directIds = [...bulkSelected]
      .filter((k) => k.startsWith("direct:"))
      .map((k) => k.slice(7))
    if (directIds.length === 0) {
      Alert.alert("안내", "1:1 채팅만 일괄 나가기를 지원합니다")
      return
    }
    Alert.alert("일괄 나가기", `선택한 ${directIds.length}개 대화방에서 나가시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "나가기",
        style: "destructive",
        onPress: async () => {
          if (!user) return
          let failCount = 0
          for (const id of directIds) {
            try {
              await leaveDirectRoom(getSupabase(), id, user.id)
            } catch (e) {
              console.warn("[chat] leave room failed", id, e)
              failCount++
            }
          }
          await fetchAll()
          exitBulk()
          // 부분 실패를 사용자에게 알림 (이전엔 조용히 무시돼 방이 재등장)
          if (failCount > 0) {
            Alert.alert(
              "일부 실패",
              `${directIds.length}개 중 ${failCount}개 대화방을 나가지 못했습니다. 다시 시도해주세요.`,
            )
          }
        },
      },
    ])
  }

  function handleLeaveDirect(roomId: string) {
    if (!user) return
    Alert.alert("대화방 나가기", "이 대화방에서 나가시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "나가기",
        style: "destructive",
        onPress: async () => {
          try {
            await leaveDirectRoom(getSupabase(), roomId, user.id)
            setDirectRooms((prev) => prev.filter((r) => r.id !== roomId))
          } catch (e: any) {
            Alert.alert("실패", e?.message || "나가기에 실패했습니다")
          }
        },
      },
    ])
  }

  function openRow(target: RoomMenuTarget) {
    if (bulkMode && target.kind === "direct") {
      toggleBulk(`direct:${target.id}`)
      return
    }
    if (target.kind === "direct") {
      router.push(`/chat/${target.id}`)
    } else if (target.kind === "club") {
      router.push(`/chat/club/${target.id}`)
    } else if (target.kind === "gb") {
      router.push(`/chat/group-buying/${target.id}`)
    }
  }

  // ── SectionList render helpers ────────────────────
  const renderSectionHeader = useCallback(
    ({ section }: { section: ChatSection }) => {
      if (!showSectionHeader) return null
      return (
        <View style={styles.sectionHeader}>
          <Ionicons
            name={section.icon as any}
            size={16}
            color={section.iconColor || lightColors.ink500}
          />
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionCount}>({section.data.length})</Text>
        </View>
      )
    },
    [showSectionHeader],
  )

  const renderItem = useCallback(
    ({ item: entry }: { item: SectionItem }) => {
      if (entry.type === "direct") {
        const r = entry.item
        return (
          <MemoDirectRow
            room={r}
            muted={mutedSet.has(`direct:${r.id}`)}
            bulkMode={bulkMode}
            bulkChecked={bulkSelected.has(`direct:${r.id}`)}
            currentUserId={user?.id ?? null}
            onPress={() =>
              openRow({
                kind: "direct",
                id: r.id,
                label: r.otherUser?.nickname || r.context?.title || "대화방",
              })
            }
            onLongPress={() =>
              !bulkMode &&
              setRoomMenu({
                kind: "direct",
                id: r.id,
                label: r.otherUser?.nickname || r.context?.title || "대화방",
              })
            }
            onLeave={() => handleLeaveDirect(r.id)}
          />
        )
      }
      if (entry.type === "notice") {
        const r = entry.item
        return (
          <MemoDirectRow
            room={r}
            muted={mutedSet.has(`direct:${r.id}`)}
            bulkMode={false}
            bulkChecked={false}
            currentUserId={user?.id ?? null}
            onPress={() => router.push(`/chat/${r.id}`)}
            onLongPress={() => {}}
            onLeave={() => {}}
          />
        )
      }
      if (entry.type === "gb") {
        const r = entry.item
        return (
          <MemoGbRow
            room={r}
            muted={mutedSet.has(`gb:${r.post_id}`)}
            onPress={() =>
              openRow({ kind: "gb", id: r.post_id, label: r.title })
            }
            onLongPress={() =>
              setRoomMenu({ kind: "gb", id: r.post_id, label: r.title })
            }
          />
        )
      }
      if (entry.type === "club") {
        const r = entry.item
        return (
          <MemoClubRow
            room={r}
            muted={mutedSet.has(`club:${r.club_id}`)}
            onPress={() =>
              openRow({ kind: "club", id: r.club_id, label: r.title })
            }
            onLongPress={() =>
              setRoomMenu({ kind: "club", id: r.club_id, label: r.title })
            }
          />
        )
      }
      return null
    },
    [mutedSet, bulkMode, bulkSelected, user?.id],
  )

  const keyExtractor = useCallback((entry: SectionItem) => {
    if (entry.type === "direct" || entry.type === "notice") return `direct:${entry.item.id}`
    if (entry.type === "gb") return `gb:${entry.item.post_id}`
    if (entry.type === "club") return `club:${entry.item.club_id}`
    return "unknown"
  }, [])

  const listEmptyComponent = useMemo(() => {
    if (error) {
      return (
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
          <Text style={styles.emptyTitle}>채팅방을 불러오지 못했어요</Text>
          <Text style={styles.emptySub}>{error}</Text>
        </View>
      )
    }
    return (
      <View style={styles.empty}>
        <Ionicons name="chatbubble-ellipses-outline" size={56} color={lightColors.ink300} />
        <Text style={styles.emptyTitle}>채팅 내역이 없습니다</Text>
        <Text style={styles.emptySub}>매물/모임에서 대화를 시작해보세요</Text>
      </View>
    )
  }, [error])

  const listFooter = useMemo(() => <View style={{ height: spacing[10] }} />, [])

  // ── Render ────────────────────────────────────────

  // 비로그인 — 로그인 유도 화면
  if (!user) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Ionicons name="chatbubbles-outline" size={56} color={lightColors.ink300} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: lightColors.ink900, marginTop: 16 }}>
          로그인이 필요해요
        </Text>
        <Text style={{ fontSize: 13, color: lightColors.ink500, marginTop: 6, textAlign: "center", paddingHorizontal: 32 }}>
          채팅 기능을 사용하려면 로그인 해주세요
        </Text>
        <Pressable
          onPress={() => router.push("/auth/login")}
          style={{
            marginTop: 20,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: lightColors.primary,
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>
            로그인/회원가입 하기
          </Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>채팅</Text>
          </View>
        </View>
        <SkeletonChatList />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        {bulkMode ? (
          <>
            <Pressable onPress={exitBulk} hitSlop={8} style={styles.headerBtn}>
              <Ionicons name="close" size={22} color={lightColors.ink900} />
            </Pressable>
            <Text style={styles.headerTitle}>{bulkSelected.size}개 선택</Text>
            <Pressable
              onPress={runBulkLeave}
              disabled={bulkSelected.size === 0}
              hitSlop={8}
              style={[styles.headerBtn, bulkSelected.size === 0 && { opacity: 0.4 }]}
            >
              <Text style={styles.bulkLeaveText}>나가기</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* 왼쪽 — 초대요청 (전문가만), 비전문가는 빈 spacer */}
            {isExpert ? (
              <Pressable
                onPress={() => router.push("/invitations" as any)}
                hitSlop={8}
                style={styles.inviteBtn}
              >
                <Ionicons name="mail-outline" size={16} color={lightColors.primary} />
                <Text style={styles.inviteBtnText}>초대요청</Text>
                {pendingInviteCount > 0 && (
                  <View style={styles.inviteBadge}>
                    <Text style={styles.inviteBadgeText}>
                      {pendingInviteCount > 99 ? "99+" : String(pendingInviteCount)}
                    </Text>
                  </View>
                )}
              </Pressable>
            ) : (
              <View style={{ width: 40 }} />
            )}
            {/* 가운데 — 채팅 (absolute centering 으로 화면 정중앙 고정) */}
            <View style={styles.headerCenter} pointerEvents="none">
              <Text style={styles.headerTitle}>채팅</Text>
            </View>
            {/* 오른쪽 — 종 + 점세개 */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {user && (
                <Pressable
                  onPress={() => router.push("/notifications" as any)}
                  hitSlop={8}
                  style={styles.headerBtn}
                >
                  <Ionicons name="notifications-outline" size={22} color={lightColors.ink900} />
                  {unreadNotif > 0 && (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>
                        {unreadNotif > 99 ? "99+" : String(unreadNotif)}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}
              <Pressable
                onPress={() => setHeaderMenuOpen(true)}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <Ionicons name="ellipsis-vertical" size={22} color={lightColors.ink900} />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Filter tabs */}
      <ChatFilterTabs active={activeFilter} counts={counts} onChange={setActiveFilter} />

      <SectionList<SectionItem, ChatSection>
        sections={error || counts.all === 0 ? [] : sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={listFooter}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              fetchAll()
            }}
          />
        }
      />

      {/* Sheets */}
      <ChatHeaderMenu
        visible={headerMenuOpen}
        notifOff={notifOff}
        blockedCount={blockedSet.size}
        onClose={() => setHeaderMenuOpen(false)}
        onBulkEdit={() => {
          setHeaderMenuOpen(false)
          setBulkMode(true)
        }}
        onToggleNotif={(on) => chatPrefs.setNotifOffAll(!on)}
        onBlockedManager={() => {
          setHeaderMenuOpen(false)
          setBlockedManagerOpen(true)
        }}
      />

      <RoomMenuSheet
        target={roomMenu}
        isMuted={
          roomMenu ? mutedSet.has(`${roomMenu.kind}:${roomMenu.id}`) : false
        }
        onClose={() => setRoomMenu(null)}
        onToggleMute={() => {
          if (!roomMenu) return
          chatPrefs.toggleMuted(`${roomMenu.kind}:${roomMenu.id}`)
          setRoomMenu(null)
        }}
        onBlock={() => {
          if (!roomMenu) return
          const target = roomMenu
          setRoomMenu(null)
          Alert.alert("차단", "이 대화방을 차단하시겠습니까?\n목록에서 숨겨집니다.", [
            { text: "취소", style: "cancel" },
            {
              text: "차단",
              style: "destructive",
              onPress: () => chatPrefs.block(`${target.kind}:${target.id}`),
            },
          ])
        }}
        onReport={() => {
          if (!roomMenu) return
          const t = roomMenu
          setRoomMenu(null)
          setReportFor(t)
        }}
        onLeave={() => {
          if (!roomMenu) return
          const t = roomMenu
          setRoomMenu(null)
          if (t.kind === "direct") {
            handleLeaveDirect(t.id)
          } else {
            Alert.alert("나가기", "이 대화방을 목록에서 제거하시겠습니까?", [
              { text: "취소", style: "cancel" },
              {
                text: "제거",
                style: "destructive",
                onPress: () => chatPrefs.block(`${t.kind}:${t.id}`),
              },
            ])
          }
        }}
      />

      <BlockedManagerSheet
        visible={blockedManagerOpen}
        blocked={[...blockedSet]}
        labelFor={labelFor}
        onClose={() => setBlockedManagerOpen(false)}
        onUnblock={(k) => chatPrefs.unblock(k)}
      />

      <ReportSheet
        visible={reportFor !== null}
        targetLabel={reportFor?.label ?? ""}
        onClose={() => setReportFor(null)}
        onSubmit={async (reason: ChatReportReason, detail: string) => {
          if (!reportFor || !user) return
          try {
            await reportChatRoom(getSupabase(), {
              reporterId: user.id,
              targetKind: reportFor.kind,
              targetId: reportFor.id,
              reason,
              detail,
            })
            Alert.alert("접수 완료", "신고가 접수되었습니다")
          } catch (e: any) {
            Alert.alert("실패", e?.message || "신고 접수에 실패했습니다")
          }
        }}
      />
    </SafeAreaView>
  )
}

// ─── Section / Row 컴포넌트 ──────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  property: "부동산 채팅",
  sharing: "나눔 채팅",
  new_store: "신장개업 채팅",
  local_food: "로컬푸드 채팅",
  service: "서비스 채팅",
  group_buying: "공동구매 1:1 문의",
  direct: "다이렉트 메시지",
}

function DirectRow({
  room,
  muted,
  bulkMode,
  bulkChecked,
  currentUserId,
  onPress,
  onLongPress,
  onLeave,
}: {
  room: DirectRoom
  muted: boolean
  bulkMode: boolean
  bulkChecked: boolean
  currentUserId: string | null
  onPress: () => void
  onLongPress: () => void
  onLeave: () => void
}) {
  const isAdminNotice = room.post_type === "admin_notice"
  const otherName = room.otherUser?.nickname || "사용자"
  const ctx = room.context
  // 광장 뱃지 — 모든 채팅방에 광장 이름 표시 (격리 해제 후 통합 목록)
  const roomPlaza = (room as any).otherPlazaForDisplay ?? room.plaza_id
  const plazaLabel = roomPlaza ? plazaName(roomPlaza as string) : null

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: lightColors.muted },
        isAdminNotice && { backgroundColor: "#eff6ff" },
        muted && { opacity: 0.6 },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {bulkMode && !isAdminNotice && (
        <View style={[styles.checkbox, bulkChecked && styles.checkboxOn]}>
          {bulkChecked && <Ionicons name="checkmark" size={14} color="#ffffff" />}
        </View>
      )}
      <View style={{ position: "relative" }}>
        <View style={[styles.thumb, isAdminNotice ? styles.thumbAdmin : undefined]}>
          {isAdminNotice ? (
            <Text style={{ fontSize: 22 }}>🏛️</Text>
          ) : ctx?.image ? (
            <Image source={{ uri: ctx.image }} style={styles.thumbImg} cachePolicy="memory-disk" transition={120} contentFit="cover" />
          ) : room.otherUser?.avatar_url ? (
            <Image source={{ uri: room.otherUser.avatar_url }} style={styles.thumbImg} cachePolicy="memory-disk" transition={120} contentFit="cover" />
          ) : (
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={lightColors.ink500} />
          )}
        </View>
        {/* 다인 채팅 (3명+) — 겹치는 아바타 2개 + ... */}
        {!isAdminNotice && (room.participantsCount ?? 2) >= 3 && room.participantAvatars && room.participantAvatars.length > 0 ? (
          <View style={styles.multiAvatarRow}>
            {room.participantAvatars.slice(0, 2).map((url: string, idx: number) => (
              <View key={idx} style={[styles.multiAvatar, { zIndex: 2 - idx, marginLeft: idx > 0 ? -8 : 0 }]}>
                <Image source={{ uri: url }} style={styles.multiAvatarImg} cachePolicy="memory-disk" contentFit="cover" />
              </View>
            ))}
            {(room.participantsCount ?? 2) > 2 && (
              <View style={[styles.multiAvatarMore, { marginLeft: -6 }]}>
                <Text style={styles.multiAvatarMoreText}>···</Text>
              </View>
            )}
          </View>
        ) : !isAdminNotice && room.post_type !== "direct" && ctx?.image && room.otherUser?.avatar_url ? (
          <View style={styles.thumbAvatarBadge}>
            <Image source={{ uri: room.otherUser.avatar_url }} style={styles.thumbAvatarImg} cachePolicy="memory-disk" contentFit="cover" />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
            {plazaLabel && (
              <View style={styles.plazaChip}>
                <Text style={styles.plazaChipText}>{plazaLabel}</Text>
              </View>
            )}
            <Text
              style={[styles.name, isAdminNotice && { color: lightColors.primary }]}
              numberOfLines={1}
            >
              {isAdminNotice
                ? `${plazaName(roomPlaza as string) || "광장"} 관리자`
                : (room.participantsCount ?? 2) >= 3
                ? `${ctx?.title || "다인 채팅"} · ${room.participantsCount}명`
                : otherName}
              {muted ? "  🔕" : ""}
            </Text>
          </View>
          <Text style={styles.time}>{formatTime(room.last_message_at ?? null)}</Text>
        </View>
        <Text style={styles.last} numberOfLines={1}>
          {room.last_message || "새로운 대화를 시작해보세요"}
        </Text>
        {ctx?.title && !isAdminNotice && (
          <Text style={styles.contextLine} numberOfLines={1}>
            {ctx.title}
            {ctx.meta ? ` · ${ctx.meta}` : ""}
          </Text>
        )}
      </View>
      {!muted && room.unreadCount > 0 && !bulkMode && (
        <View style={styles.unread}>
          <Text style={styles.unreadText}>
            {room.unreadCount > 9 ? "9+" : room.unreadCount}
          </Text>
        </View>
      )}
      {!isAdminNotice && !bulkMode && (
        <Pressable onPress={onLeave} hitSlop={6} style={styles.leaveBtn}>
          <Ionicons name="exit-outline" size={18} color={lightColors.ink500} />
        </Pressable>
      )}
    </Pressable>
  )
}

const MemoDirectRow = React.memo(DirectRow)

function ClubRow({
  room,
  muted,
  onPress,
  onLongPress,
}: {
  room: ClubChatRoom
  muted: boolean
  onPress: () => void
  onLongPress: () => void
}) {
  const icon =
    room.sport_type === "러닝"
      ? "🏃"
      : room.sport_type === "축구"
      ? "⚽"
      : room.sport_type === "배드민턴"
      ? "🏸"
      : room.sport_type === "등산"
      ? "⛰️"
      : "🎯"
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: lightColors.muted },
        muted && { opacity: 0.6 },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={[styles.thumb, { backgroundColor: "#6366f1" }]}>
        {room.images?.[0] ? (
          <Image source={{ uri: room.images[0] }} style={styles.thumbImg} cachePolicy="memory-disk" transition={120} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 22 }}>{icon}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {room.title}
            {muted ? "  🔕" : ""}
          </Text>
          <Text style={styles.time}>{formatTime(room.last_message_at)}</Text>
        </View>
        <Text style={styles.last} numberOfLines={1}>
          {room.last_message || "채팅방이 열렸습니다"}
        </Text>
        <Text style={styles.contextLine} numberOfLines={1}>
          👥 {room.current_members}/{room.max_members}명
        </Text>
      </View>
      {!muted && room.unread_count > 0 && (
        <View style={styles.unread}>
          <Text style={styles.unreadText}>
            {room.unread_count > 99 ? "99+" : room.unread_count}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const MemoClubRow = React.memo(ClubRow)

function GbRow({
  room,
  muted,
  onPress,
  onLongPress,
}: {
  room: GbChatRoom
  muted: boolean
  onPress: () => void
  onLongPress: () => void
}) {
  const statusLabel =
    room.status === "pending_payment"
      ? "입금 대기"
      : room.status === "in_progress"
      ? "주문 진행중"
      : room.status === "completed"
      ? "완료"
      : room.status
  // 광장 뱃지 — 모든 공구 채팅방에 광장 이름 표시 (격리 해제 후 통합 목록)
  const plazaLabel = room.plaza_id ? plazaName(room.plaza_id) : null
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: lightColors.muted },
        muted && { opacity: 0.6 },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={[styles.thumb, { backgroundColor: "#3b82f6" }]}>
        {room.images?.[0] ? (
          <Image source={{ uri: room.images[0] }} style={styles.thumbImg} cachePolicy="memory-disk" transition={120} contentFit="cover" />
        ) : (
          <Ionicons name="cart" size={22} color="#ffffff" />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
            {plazaLabel && (
              <View style={styles.plazaChip}>
                <Text style={styles.plazaChipText}>{plazaLabel}</Text>
              </View>
            )}
            <Text style={styles.name} numberOfLines={1}>
              {room.title}
              {muted ? "  🔕" : ""}
            </Text>
          </View>
          <Text style={styles.time}>{formatTime(room.last_message_at)}</Text>
        </View>
        <Text style={styles.last} numberOfLines={1}>
          {room.last_message || "채팅방이 열렸습니다"}
        </Text>
        <Text style={[styles.contextLine, { color: "#3b82f6" }]} numberOfLines={1}>
          🛒 {statusLabel} · {room.current_participants}
          {room.max_participants ? `/${room.max_participants}` : ""}명
        </Text>
      </View>
      {!muted && room.unread_count > 0 && (
        <View style={styles.unread}>
          <Text style={styles.unreadText}>
            {room.unread_count > 99 ? "99+" : room.unread_count}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const MemoGbRow = React.memo(GbRow)

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
    position: "relative",
  },
  inviteBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  inviteBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.background,
  },
  notifBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    paddingHorizontal: 4,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 12,
  },
  headerBtn: { padding: 6, minWidth: 36 },
  headerCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.ink900,
  },
  bulkLeaveText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: "#dc2626",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.ink900,
    marginTop: spacing[3],
  },
  emptySub: {
    fontSize: fontSize.sm,
    color: colors.ink500,
    marginTop: 4,
  },
  section: {
    // 카테고리 간 구분선 제거 (요청)
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.ink900,
  },
  sectionCount: {
    fontSize: fontSize.xs,
    color: colors.ink500,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.background,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbAdmin: {
    backgroundColor: colors.primary,
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbAvatarBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.background,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  thumbAvatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 11,
  },
  multiAvatarRow: {
    position: "absolute",
    bottom: -4,
    right: -6,
    flexDirection: "row",
    alignItems: "center",
  },
  multiAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.background,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  multiAvatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  multiAvatarMore: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  multiAvatarMoreText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748b",
    marginTop: -2,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  plazaChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(124,58,237,0.12)",
  },
  plazaChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#7c3aed",
  },
  name: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "500",
    color: colors.ink900,
    marginRight: spacing[2],
  },
  time: {
    fontSize: 11,
    color: colors.ink500,
  },
  last: {
    fontSize: fontSize.sm,
    color: colors.ink500,
  },
  contextLine: {
    fontSize: 11,
    color: colors.primary,
    marginTop: 2,
  },
  unread: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  leaveBtn: {
    padding: 6,
  },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
// TODO: Dark-mode broken — DirectRow, ClubRow, GbRow reference this module-level
// `styles` which is always built from lightColors. Each row component needs to
// receive a theme-aware `styles` via props (or useColorScheme inside) so that
// dark-mode colors are applied correctly.
const styles = makeStyles(lightColors)
