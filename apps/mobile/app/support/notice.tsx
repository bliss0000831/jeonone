/**
 * 공지사항 — 광장 web /notice 와 동일 데이터 (board_posts category=공지).
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { listNotices, type NoticePost } from "@gwangjang/features/support"
import { getSupabase } from "@/lib/supabase"
import { useCurrentPlaza } from "@/lib/plaza"


export default function NoticeScreen() {
  const DEFAULT_PLAZA = useCurrentPlaza()
  const router = useRouter()
  const [items, setItems] = useState<NoticePost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listNotices(getSupabase(), DEFAULT_PLAZA)
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.title}>공지사항</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="megaphone-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.emptyTitle}>등록된 공지가 없습니다</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing[3] }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/support/notice-detail" as any,
                  params: {
                    id: item.id,
                    title: item.title,
                    content: item.content,
                    created_at: item.created_at,
                    is_pinned: item.is_pinned ? "1" : "0",
                  },
                })
              }
              style={({ pressed }) => [
                styles.card,
                pressed && { backgroundColor: lightColors.muted },
              ]}
            >
              <View style={styles.cardTop}>
                {item.is_pinned && (
                  <View style={styles.pinBadge}>
                    <Ionicons name="bookmark" size={11} color="#dc2626" />
                    <Text style={styles.pinText}>고정</Text>
                  </View>
                )}
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              <Text style={styles.cardSummary} numberOfLines={2}>
                {item.content}
              </Text>
              <Text style={styles.cardDate}>
                {new Date(item.created_at).toLocaleDateString("ko-KR")}
              </Text>
            </Pressable>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  back: { padding: 6, width: 36 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    marginTop: spacing[3],
  },
  card: {
    backgroundColor: lightColors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: spacing[3],
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  pinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(220,38,38,0.1)",
  },
  pinText: { fontSize: 10, fontWeight: "700", color: "#dc2626" },
  cardTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  cardSummary: {
    fontSize: 13,
    lineHeight: 18,
    color: lightColors.ink500,
    marginBottom: 6,
  },
  cardDate: {
    fontSize: 11,
    color: lightColors.ink500,
  },
})
