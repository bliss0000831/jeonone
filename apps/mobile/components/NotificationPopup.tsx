import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"
import { getSupabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useCurrentPlaza } from "@/lib/plaza"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@gwangjang/features/notifications"

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
  if (type === "system") return { bg: "#f59e0b", icon: "notifications" }
  return { bg: "#71717a", icon: "information-circle" }
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

interface Props {
  visible: boolean
  onClose: () => void
}

export function NotificationPopup({ visible, onClose }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const plazaId = useCurrentPlaza()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const unreadCount = items.filter((n) => !n.is_read).length

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const supabase = getSupabase()
      const list = await listNotifications(supabase, user.id, {
        plazaId: plazaId ?? undefined,
        limit: 15,
      })
      setItems(list)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [user, plazaId])

  useEffect(() => {
    if (visible) fetchNotifications()
  }, [visible, fetchNotifications])

  const handleMarkAllRead = async () => {
    if (!user) return
    const supabase = getSupabase()
    await markAllNotificationsRead(supabase, user.id)
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const handleItemPress = async (n: AppNotification) => {
    if (!n.is_read && user) {
      const supabase = getSupabase()
      markNotificationRead(supabase, n.id).catch(() => {})
      setItems((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item)),
      )
    }
    onClose()
    if (n.link) router.push(n.link as any)
  }

  const handleViewAll = () => {
    onClose()
    router.push("/notifications" as any)
  }

  const renderThumbnail = (n: AppNotification) => {
    const meta = typeMeta(n.type)

    if (n.thumbnail_url) {
      // 썸네일 이미지 + 우하단 타입 뱃지
      return (
        <View style={s.thumbWrap}>
          <Image
            source={{ uri: n.thumbnail_url }}
            style={s.thumbImg}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={120}
          />
          <View style={[s.typeBadge, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={9} color="#fff" />
          </View>
        </View>
      )
    }

    // 썸네일 없음 → 컬러 아이콘 원형
    return (
      <View style={[s.iconCircle, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={18} color="#fff" />
      </View>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <View style={s.anchor}>
          <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View style={s.header}>
              <View style={s.headerLeft}>
                <Ionicons name="notifications" size={15} color="#18181b" style={{ marginTop: 1 }} />
                <Text style={s.headerTitle}>알림</Text>
                {unreadCount > 0 && (
                  <View style={s.countBadge}>
                    <Text style={s.countBadgeText}>
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </Text>
                  </View>
                )}
              </View>
              {unreadCount > 0 && (
                <Pressable hitSlop={8} onPress={handleMarkAllRead} style={s.markAllBtn}>
                  <Ionicons name="checkmark-done" size={14} color={lightColors.primary} />
                  <Text style={s.markAllText}>모두 읽음</Text>
                </Pressable>
              )}
            </View>

            {/* List */}
            <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
              {loading ? (
                <View style={s.emptyWrap}>
                  <ActivityIndicator size="small" color={lightColors.primary} />
                </View>
              ) : items.length === 0 ? (
                <View style={s.emptyWrap}>
                  <View style={s.emptyIcon}>
                    <Ionicons name="notifications-off-outline" size={28} color="#a1a1aa" />
                  </View>
                  <Text style={s.emptyTitle}>알림이 없습니다</Text>
                  <Text style={s.emptySubtext}>새로운 소식이 오면 알려드릴게요</Text>
                </View>
              ) : (
                items.slice(0, 10).map((n) => (
                  <Pressable
                    key={n.id}
                    style={[s.item, !n.is_read && s.itemUnread]}
                    onPress={() => handleItemPress(n)}
                  >
                    {!n.is_read && <View style={s.unreadBar} />}
                    {renderThumbnail(n)}
                    <View style={s.itemContent}>
                      <Text
                        style={[s.itemTitle, !n.is_read && s.itemTitleBold]}
                        numberOfLines={1}
                      >
                        {n.title}
                      </Text>
                      <Text style={s.itemMessage} numberOfLines={2}>
                        {n.message}
                      </Text>
                      <Text style={s.itemTime}>{formatTime(n.created_at)}</Text>
                    </View>
                    {!n.is_read && <View style={s.unreadDot} />}
                  </Pressable>
                ))
              )}
            </ScrollView>

            {/* Footer */}
            {items.length > 0 && (
              <Pressable style={s.footer} onPress={handleViewAll}>
                <Text style={s.footerText}>모든 알림 보기</Text>
                <Ionicons name="chevron-forward" size={14} color={lightColors.primary} />
              </Pressable>
            )}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  anchor: {
    position: "absolute",
    top: 56,
    right: 8,
    width: 340,
    maxHeight: 500,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },

  /* ── Header ── */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f4f4f5",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#18181b",
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: lightColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.06)",
  },
  markAllText: {
    fontSize: 11,
    fontWeight: "600",
    color: lightColors.primary,
  },

  /* ── List ── */
  list: {
    maxHeight: 380,
  },

  /* ── Item ── */
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f4f4f5",
    position: "relative",
  },
  itemUnread: {
    backgroundColor: "rgba(59,130,246,0.035)",
  },
  unreadBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: lightColors.primary,
  },

  /* ── Thumbnail (이미지 있을 때) ── */
  thumbWrap: {
    width: 44,
    height: 44,
    position: "relative",
    flexShrink: 0,
  },
  thumbImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f4f4f5",
  },
  typeBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  /* ── Icon (이미지 없을 때) ── */
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Content ── */
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: "#18181b",
  },
  itemTitleBold: {
    fontWeight: "700",
  },
  itemMessage: {
    fontSize: 12,
    lineHeight: 17,
    color: "#71717a",
    marginTop: 2,
  },
  itemTime: {
    fontSize: 11,
    color: "#a1a1aa",
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: lightColors.primary,
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },

  /* ── Empty ── */
  emptyWrap: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f4f4f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#52525b",
  },
  emptySubtext: {
    fontSize: 12,
    color: "#a1a1aa",
    marginTop: 4,
  },

  /* ── Footer ── */
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f4f4f5",
    backgroundColor: "#fafafa",
  },
  footerText: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.primary,
  },
})
