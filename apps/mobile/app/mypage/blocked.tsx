/**
 * 차단 관리 페이지.
 *
 * 두 가지 차단 메커니즘:
 *   1) 사용자 차단 (block_users) — 글로벌 DB-level, 모든 광장 적용
 *   2) 채팅방 차단 (chatPrefs) — AsyncStorage, 디바이스 단위
 */

import { useEffect, useState } from "react"
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { useThemedStyles } from "@/components/useColorScheme"
import { chatPrefs } from "@/lib/chat-prefs"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import {
  listBlockedUsers,
  unblockUser,
  type BlockedUserRow,
} from "@gwangjang/features/profile"

function labelFor(key: string): string {
  if (key.startsWith("direct:")) return "1:1 채팅"
  if (key.startsWith("club:")) return "모임 채팅"
  if (key.startsWith("gb:")) return "공동구매 채팅"
  if (key.startsWith("lf:")) return "로컬푸드 채팅"
  return key
}

function iconFor(key: string): keyof typeof Ionicons.glyphMap {
  if (key.startsWith("club:")) return "people-outline"
  if (key.startsWith("gb:")) return "cart-outline"
  if (key.startsWith("lf:")) return "leaf-outline"
  return "chatbubble-outline"
}

type Tab = "users" | "rooms"

export default function BlockedScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>("users")

  const [users, setUsers] = useState<BlockedUserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [rooms, setRooms] = useState<string[]>([])

  // 사용자 차단 로드
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await listBlockedUsers(getSupabase(), user.id)
        if (!cancelled) setUsers(list)
      } catch {
        // RLS 차단 또는 마이그레이션 미적용 → 빈 배열
        if (!cancelled) setUsers([])
      } finally {
        if (!cancelled) setLoadingUsers(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  // 채팅방 차단 로드
  useEffect(() => {
    let cancelled = false
    chatPrefs.ready()
      .then(() => { if (!cancelled) setRooms([...chatPrefs.getBlocked()]) })
      .catch(() => {})
    const unsub = chatPrefs.subscribe(() => {
      if (!cancelled) setRooms([...chatPrefs.getBlocked()])
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  async function handleUnblockUser(target: BlockedUserRow) {
    if (!user) return
    Alert.alert(
      "차단 해제",
      `${target.nickname || "이 사용자"}의 차단을 해제하시겠어요?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "해제",
          style: "destructive",
          onPress: async () => {
            try {
              await unblockUser(getSupabase(), {
                viewerId: user.id,
                targetId: target.blocked_id,
              })
              setUsers((prev) =>
                prev.filter((u) => u.blocked_id !== target.blocked_id),
              )
            } catch {
              Alert.alert("실패", "차단 해제에 실패했습니다")
            }
          },
        },
      ],
    )
  }

  function handleUnblockRoom(key: string) {
    Alert.alert(
      "차단 해제",
      `${labelFor(key)} 차단을 해제하시겠어요?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "해제",
          style: "destructive",
          onPress: () => chatPrefs.unblock(key),
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>차단 관리</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabBar}>
        <Pressable onPress={() => setTab("users")} style={[styles.tab, tab === "users" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "users" && styles.tabTextActive]}>
            사용자 ({users.length})
          </Text>
        </Pressable>
        <Pressable onPress={() => setTab("rooms")} style={[styles.tab, tab === "rooms" && styles.tabActive]}>
          <Text style={[styles.tabText, tab === "rooms" && styles.tabTextActive]}>
            대화방 ({rooms.length})
          </Text>
        </Pressable>
      </View>

      {tab === "users" ? (
        users.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="person-remove-outline" size={48} color={lightColors.ink300} />
            <Text style={styles.emptyTitle}>차단한 사용자가 없습니다</Text>
            <Text style={styles.emptyHint}>
              프로필 페이지의 "차단" 버튼으로 차단할 수 있어요
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.blocked_id}
            contentContainerStyle={{ padding: spacing[3] }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/profile/${item.blocked_id}` as any)}
                style={styles.row}
              >
                <View style={styles.rowLeft}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} cachePolicy="memory-disk" style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>
                        {(item.nickname || "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.rowLabel}>{item.nickname || "(닉네임 없음)"}</Text>
                    <Text style={styles.rowKey}>
                      {new Date(item.created_at).toLocaleDateString("ko-KR")} 차단
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => handleUnblockUser(item)}
                  style={styles.unblockBtn}
                  hitSlop={6}
                >
                  <Text style={styles.unblockText}>해제</Text>
                </Pressable>
              </Pressable>
            )}
          
            removeClippedSubviews={true}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={11}
          />
        )
      ) : rooms.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="ban-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.emptyTitle}>차단한 대화방이 없습니다</Text>
          <Text style={styles.emptyHint}>
            채팅방에서 차단한 대화방이 여기 표시돼요
          </Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(k) => k}
          contentContainerStyle={{ padding: spacing[3] }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconWrap}>
                  <Ionicons name={iconFor(item)} size={20} color={lightColors.ink500} />
                </View>
                <View>
                  <Text style={styles.rowLabel}>{labelFor(item)}</Text>
                  <Text style={styles.rowKey}>{item}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => handleUnblockRoom(item)}
                style={styles.unblockBtn}
                hitSlop={6}
              >
                <Text style={styles.unblockText}>해제</Text>
              </Pressable>
            </View>
          )}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </SafeAreaView>
  )
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backBtn: { padding: 6 },
  title: { fontSize: fontSize.md, fontWeight: "700", color: colors.ink900 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: spacing[3], alignItems: "center" },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: { fontSize: fontSize.sm, color: colors.ink500, fontWeight: "600" },
  tabTextActive: { color: colors.primary, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[4] },
  emptyTitle: {
    marginTop: spacing[2],
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.ink700,
  },
  emptyHint: {
    marginTop: spacing[1],
    fontSize: fontSize.sm,
    color: colors.ink500,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing[3],
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginBottom: spacing[2],
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing[3], flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: fontSize.md, fontWeight: "700", color: colors.ink500 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink900 },
  rowKey: { fontSize: fontSize.xs, color: colors.ink500, marginTop: 2 },
  unblockBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.primary + "1a",
  },
  unblockText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "700" },
})
}

// module-level fallback — light 색상 (외부 함수에서 styles 참조용)
const styles = makeStyles(lightColors)
