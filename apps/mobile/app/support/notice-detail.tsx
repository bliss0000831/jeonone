/**
 * 공지사항 상세 페이지 — 목록에서 전달받은 title/content 표시.
 *
 * params: id, title, content, created_at, is_pinned
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

export default function NoticeDetailScreen() {
  const router = useRouter()
  const { title, content, created_at, is_pinned } = useLocalSearchParams<{
    id: string
    title: string
    content: string
    created_at: string
    is_pinned: string
  }>()

  const isPinned = is_pinned === "1"
  const dateStr = created_at
    ? new Date(created_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : ""

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          공지사항
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* 제목 영역 */}
        <View style={styles.titleWrap}>
          {isPinned && (
            <View style={styles.pinBadge}>
              <Ionicons name="bookmark" size={12} color="#dc2626" />
              <Text style={styles.pinText}>고정</Text>
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
          {dateStr ? <Text style={styles.date}>{dateStr}</Text> : null}
        </View>

        {/* 구분선 */}
        <View style={styles.divider} />

        {/* 본문 */}
        <Text style={styles.content}>{content}</Text>
      </ScrollView>
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
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  body: {
    padding: spacing[4],
    paddingBottom: 60,
  },
  titleWrap: {
    gap: 8,
  },
  pinBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(220,38,38,0.1)",
  },
  pinText: { fontSize: 11, fontWeight: "700", color: "#dc2626" },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: lightColors.ink900,
    lineHeight: 26,
  },
  date: {
    fontSize: 12,
    color: lightColors.ink500,
  },
  divider: {
    height: 1,
    backgroundColor: lightColors.border,
    marginVertical: spacing[4],
  },
  content: {
    fontSize: 15,
    color: lightColors.ink700,
    lineHeight: 24,
  },
})
