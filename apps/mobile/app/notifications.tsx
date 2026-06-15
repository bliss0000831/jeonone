/**
 * 알림 페이지 — 광장 web /notifications 1:1 미러.
 *
 * 정독 매핑:
 *   - 헤더: ← 알림 + (안 읽음 N) + "모두 읽음" 버튼
 *   - 9 필터 탭 (전체/안읽음/읽음/채팅/매물/초대요청/게시판/공구/모임)
 *     초대요청 탭은 INVITATION_ROLES 만 노출
 *   - 날짜 그룹 (오늘 / 어제 / 이번 주 / 그 이전)
 *   - 항목: 타입별 colored circle 아이콘 + 제목 + 메시지 + 시간
 *     클릭 → 읽음 처리 + link 이동, 우측 swipe/long-press → 삭제
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { FlashList } from "@shopify/flash-list"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useQuery } from "@tanstack/react-query"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@gwangjang/features/notifications"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"


type FilterKey =
  | "all" | "unread" | "read" | "chat" | "property"
  | "group_buying" | "club" | "board" | "invitation"

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "unread", label: "안 읽음" },
  { key: "read", label: "읽음" },
  { key: "chat", label: "채팅" },
  { key: "board", label: "소식통" },
]

const INVITATION_ROLES = new Set([
  "agent", "interior", "moving", "cleaning", "repair",
])

function typeMeta(type: string): { bg: string; icon: any } {
  if (type === "chat") return { bg: "#3b82f6", icon: "chatbubble" }
  if (type.startsWith("board_")) return { bg: "#6366f1", icon: "document-text" }
  if (type === "price_change") return { bg: "#10b981", icon: "trending-down" }
  if (type === "favorite") return { bg: "#f43f5e", icon: "heart" }
  if (type.startsWith("group_buying")) return { bg: "#8b5cf6", icon: "cart" }
  if (type.startsWith("club")) return { bg: "#059669", icon: "people" }
  if (type === "expert_invitation") return { bg: "#14b8a6", icon: "person-add" }
  if (type === "expert_invitation_response") return { bg: "#0d9488", icon: "checkmark-circle" }
  if (type === "admin_notice") return { bg: "#f97316", icon: "megaphone" }
  if (type.startsWith("order")) return { bg: "#2563eb", icon: "cube" }
  if (type.startsWith("rental")) return { bg: "#16a34a", icon: "calendar" }
  if (type.startsWith("auction")) return { bg: "#d97706", icon: "hammer" }
  if (type === "follow") return { bg: "#db2777", icon: "person-add" }
  if (type === "account_type_review") return { bg: "#6366f1", icon: "shield-checkmark" }
  if (type === "system") return { bg: "#f59e0b", icon: "notifications" }
  return { bg: "#71717a", icon: "information-circle" }
}

function matchesFilter(n: AppNotification, f: FilterKey): boolean {
  if (f === "all") return true
  if (f === "unread") return !n.is_read
  if (f === "read") return n.is_read
  if (f === "chat") return n.type === "chat"
  if (f === "property") return n.type === "price_change" || n.type === "favorite"
  if (f === "board") return n.type.startsWith("board_")
  if (f === "group_buying") return n.type.startsWith("group_buying")
  if (f === "club") return n.type.startsWith("club")
  if (f === "invitation") return n.type.startsWith("expert_invitation")
  return true
}

function dateGroup(iso: string): "today" | "yesterday" | "week" | "older" {
  const d = new Date(iso)
  const now = new Date()
  const sToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const sDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const day = Math.round((sToday - sDate) / 86_400_000)
  if (day <= 0) return "today"
  if (day === 1) return "yesterday"
  if (day < 7) return "week"
  return "older"
}

const GROUP_LABEL: Record<string, string> = {
  today: "오늘",
  yesterday: "어제",
  week: "이번 주",
  older: "그 이전",
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  const hr = Math.floor(diff / 3_600_000)
  const day = Math.floor(diff / 86_400_000)
  if (min < 1) return "방금 전"
  if (min < 60) return `${min}분 전`
  if (hr < 24) return `${hr}시간 전`
  if (day < 7) return `${day}일 전`
  return d.toLocaleDateString("ko-KR")
}

export default function NotificationsScreen() {
  const styles = useThemedStyles(makeStyles)
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const { user } = useAuth()
  const [items, setItems] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<FilterKey>("all")
  const [accountType, setAccountType] = useState<string | null>(null)

  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 50
  // 페이지네이션 상태 추적 — background/focus refetch 가 이미 불러온 다음 페이지를
  // 덮어쓰지 않도록 (스크롤 초기화 방지). pull-to-refresh 만 명시적으로 1페이지로 리셋.
  const paginatedRef = useRef(false)
  const resetOnNextDataRef = useRef(false)

  // TanStack Query 로 알림 + 프로필 동시 로드 — staleTime 5s, 사용자/광장 변경 시 자동 재요청
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["notifications", user?.id ?? null, DEFAULT_PLAZA ?? null],
    enabled: !!user,
    staleTime: 5_000,
    queryFn: async () => {
      const supabase = getSupabase()
      const [list, profileRes] = await Promise.all([
        listNotifications(supabase, user!.id, { plazaId: DEFAULT_PLAZA, limit: PAGE_SIZE }),
        supabase
          .from("profiles")
          .select("account_type")
          .eq("id", user!.id)
          .maybeSingle(),
      ])
      return { list, accountType: profileRes.data?.account_type ?? null }
    },
  })

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !user) return
    setLoadingMore(true)
    try {
      const supabase = getSupabase()
      const more = await listNotifications(supabase, user.id, {
        plazaId: DEFAULT_PLAZA,
        limit: PAGE_SIZE,
        offset: items.length,
      })
      if (more.length < PAGE_SIZE) setHasMore(false)
      if (more.length > 0) {
        // 포커스 refetch 가 head 에 항목을 prepend 해 offset 이 어긋나면 겹칠 수 있어 id 중복 제거
        setItems((prev) => {
          const seen = new Set(prev.map((n) => n.id))
          const fresh = more.filter((n) => !seen.has(n.id))
          return fresh.length > 0 ? [...prev, ...fresh] : prev
        })
        paginatedRef.current = true
      }
    } catch { /* ignore */ } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, user, items.length, DEFAULT_PLAZA])

  // query 결과를 로컬 state 로 미러 (낙관적 업데이트가 setItems 를 직접 변경하므로)
  useEffect(() => {
    if (!data) return
    // 초기 로드, 단일 페이지, 또는 pull-to-refresh → 최신 목록으로 완전 교체.
    const reset = resetOnNextDataRef.current || !paginatedRef.current
    resetOnNextDataRef.current = false
    if (reset) {
      paginatedRef.current = false
      setItems(data.list)
      setHasMore(data.list.length >= PAGE_SIZE)
    } else {
      // 페이지네이션된 상태의 background/focus refetch — 최신 페이지(head)만 갱신하고
      // 이미 불러온 이후 페이지 항목은 보존 (중복 제거). hasMore 는 유지.
      setItems((prev) => {
        const freshIds = new Set(data.list.map((n) => n.id))
        return [...data.list, ...prev.filter((n) => !freshIds.has(n.id))]
      })
    }
    setAccountType(data.accountType)
  }, [data])

  const loading = isLoading && !data

  // useFocusEffect 는 mount 시에도 fire — useQuery 의 initial fetch 와 중복 호출 방지.
  const firstFocusRef = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      refetch()
    }, [refetch]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    resetOnNextDataRef.current = true // 당겨서 새로고침 — 1페이지로 완전 리셋
    try { await refetch() } finally { setRefreshing(false) }
  }, [refetch])

  const visibleFilters = useMemo(() => {
    const showInvitation =
      accountType != null && INVITATION_ROLES.has(accountType)
    return FILTERS.filter((f) => f.key !== "invitation" || showInvitation)
  }, [accountType])

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items],
  )

  const filtered = useMemo(
    () => items.filter((n) => matchesFilter(n, filter)),
    [items, filter],
  )

  const sections = useMemo(() => {
    const groups: Record<string, AppNotification[]> = {
      today: [], yesterday: [], week: [], older: [],
    }
    for (const n of filtered) groups[dateGroup(n.created_at)].push(n)
    return (["today", "yesterday", "week", "older"] as const)
      .map((k) => ({ key: k, label: GROUP_LABEL[k], items: groups[k] }))
      .filter((s) => s.items.length > 0)
  }, [filtered])

  const filterCounts = useMemo(() => {
    const acc: Record<FilterKey, number> = {
      all: items.length,
      unread: unreadCount,
      read: items.length - unreadCount,
      chat: 0,
      property: 0,
      board: 0,
      group_buying: 0,
      club: 0,
      invitation: 0,
    }
    for (const n of items) {
      for (const f of FILTERS) {
        if (f.key === "all" || f.key === "unread" || f.key === "read") continue
        if (matchesFilter(n, f.key)) acc[f.key]++
      }
    }
    return acc
  }, [items, unreadCount])

  async function handleMarkAll() {
    if (!user) return
    const prev = items
    setItems((p) => p.map((n) => ({ ...n, is_read: true })))
    try {
      await markAllNotificationsRead(getSupabase(), user.id)
    } catch (e) {
      console.warn("[notifications] mark all failed", e)
      setItems(prev) // 롤백 — 실패 시 원복하여 DB/UI 불일치 방지
      Alert.alert("오류", "모두 읽음 처리에 실패했습니다. 다시 시도해 주세요.")
    }
  }

  function handleItemPress(n: AppNotification) {
    if (!n.is_read) {
      const prev = items
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      markNotificationRead(getSupabase(), n.id).catch((e) => {
        console.warn("[notifications] mark read failed", e)
        setItems(prev) // 롤백
      })
    }
    if (n.link) {
      // web 내부 링크 → RN 라우트 매핑.
      // 보안: 경로 traversal/external scheme 방지 — 화이트리스트 prefix 만 허용.
      try {
        const raw = String(n.link).trim()
        if (!raw.startsWith("/") || raw.startsWith("//")) return
        // ".." 또는 url-encoded traversal 차단
        if (raw.includes("..") || /%2e%2e/i.test(raw)) return
        const ALLOWED_PREFIXES = [
          "/secondhand/",
          "/board/",
          "/local-food/",
          "/jobs/",
          "/sharing/",
          "/auction/",
          "/rental/",
          "/group-buying/",
          "/profile/",
          "/chat/",
          "/notifications",
          "/mypage",
          "/news",
          "/support",
        ]
        const ok = ALLOWED_PREFIXES.some((p) => raw === p || raw.startsWith(p))
        if (ok) router.push(raw as any)
      } catch {}
    }
  }

  async function handleDelete(id: string) {
    const prev = items
    setItems((p) => p.filter((n) => n.id !== id))
    try {
      await deleteNotification(getSupabase(), id)
    } catch (e) {
      console.warn("[notifications] delete failed", e)
      setItems(prev) // 롤백 — 삭제 실패 시 항목 복원
      Alert.alert("오류", "알림 삭제에 실패했습니다. 다시 시도해 주세요.")
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>알림</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <Pressable
            onPress={handleMarkAll}
            hitSlop={8}
            style={({ pressed }) => [styles.markAllBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="모두 읽음 처리"
            accessibilityRole="button"
          >
            <Ionicons name="checkmark" size={14} color={lightColors.primary} />
            <Text style={styles.markAllText}>모두 읽음</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* 필터 탭 */}
      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {visibleFilters.map((f) => {
            const active = filter === f.key
            const count = filterCounts[f.key]
            const dim = count === 0 && f.key !== "all"
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.filterChip,
                  active && styles.filterChipActive,
                  dim && { opacity: 0.5 },
                ]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.filterCount,
                      active && styles.filterCountActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterCountText,
                        active && { color: "#ffffff" },
                      ]}
                    >
                      {count > 99 ? "99+" : count}
                    </Text>
                  </View>
                )}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* 롱프레스 삭제 힌트 */}
      {filtered.length > 0 && (
        <View style={{ paddingHorizontal: spacing[3], paddingBottom: 4 }}>
          <Text style={{ fontSize: 13, color: lightColors.ink500, textAlign: "right" }}>
            길게 눌러 삭제
          </Text>
        </View>
      )}

      {/* 본문 */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-outline" size={28} color={lightColors.ink500} />
          </View>
          <Text style={styles.emptyTitle}>새로운 알림이 없어요</Text>
          <Text style={styles.emptyHint}>중요한 소식이 도착하면 여기에 표시됩니다</Text>
        </View>
      ) : (
        <FlashList
          data={sections}
          keyExtractor={(s) => s.key}
          contentContainerStyle={{ padding: spacing[3], paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={() => { loadMore() }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={() =>
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" />
              </View>
            ) : null
          }
          renderItem={({ item: section }) => (
            <View style={{ marginBottom: spacing[4] }}>
              <Text style={styles.groupLabel}>{section.label}</Text>
              <View style={styles.sectionCard}>
                {section.items.map((n, i) => {
                  const meta = typeMeta(n.type)
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => handleItemPress(n)}
                      onLongPress={() =>
                        Alert.alert("알림 삭제", "이 알림을 삭제하시겠습니까?", [
                          { text: "취소", style: "cancel" },
                          { text: "삭제", style: "destructive", onPress: () => handleDelete(n.id) },
                        ])
                      }
                      delayLongPress={500}
                      style={({ pressed }) => [
                        styles.row,
                        i > 0 && styles.divider,
                        pressed && { backgroundColor: lightColors.muted },
                        !n.is_read && styles.rowUnread,
                      ]}
                    >
                      {!n.is_read && <View style={styles.unreadBar} />}
                      {n.thumbnail_url ? (
                        <View style={styles.thumbWrap}>
                          <Image
                            source={{ uri: n.thumbnail_url }}
                            style={styles.thumbImg}
                            cachePolicy="memory-disk"
                            contentFit="cover"
                            transition={120}
                          />
                          <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
                            <Ionicons name={meta.icon} size={9} color="#fff" />
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.icon, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={16} color="#ffffff" />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rowTop}>
                          <Text
                            style={[
                              styles.itemTitle,
                              !n.is_read && { fontWeight: "700" },
                            ]}
                            numberOfLines={1}
                          >
                            {n.title}
                          </Text>
                          {!n.is_read && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.itemMessage} numberOfLines={2}>
                          {n.message}
                        </Text>
                        <Text style={styles.itemTime}>{formatTime(n.created_at)}</Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(241,245,249,0.4)" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, padding: 6 },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.ink900,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.1)",
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },

  // Filter
  filterWrap: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRow: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: 6,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterChipActive: {
    backgroundColor: "#1f2937",
    borderColor: "#1f2937",
  },
  filterText: {
    fontSize: 12.5,
    fontWeight: "500",
    color: colors.ink900,
  },
  filterTextActive: { color: "#ffffff" },
  filterCount: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.ink500,
  },

  // Body
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[3],
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.ink900,
  },
  emptyHint: {
    fontSize: 12,
    color: colors.ink500,
    marginTop: 4,
  },

  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.ink500,
    paddingHorizontal: 4,
    marginBottom: spacing[2],
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    position: "relative" as const,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowUnread: {
    backgroundColor: "rgba(59,130,246,0.04)",
  },
  unreadBar: {
    position: "absolute" as const,
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative" as const,
  },
  thumbImg: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  typeBadge: {
    position: "absolute" as const,
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.ink900,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  itemMessage: {
    fontSize: 12.5,
    color: colors.ink700,
    lineHeight: 18,
    marginTop: 2,
  },
  itemTime: {
    fontSize: 11,
    color: colors.ink500,
    marginTop: 6,
  },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
