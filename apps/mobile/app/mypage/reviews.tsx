/**
 * 받은 후기 목록.
 */

import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import { listReviews, type ReviewEntry } from "@gwangjang/features/profile"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase"
import { ScreenHeader } from "@/components/mypage/ScreenHeader"

export default function ReviewsScreen() {
  const { user } = useAuth()
  const [items, setItems] = useState<ReviewEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const list = await listReviews(getSupabase(), user.id)
        setItems(list)
      } catch (e) {
        console.warn("[reviews] load failed", e)
        Alert.alert("불러오기 실패", "후기를 불러오지 못했어요. 다시 시도해 주세요.")
      } finally {
        setLoading(false)
      }
    })()
  }, [user])

  const avg =
    items.length === 0
      ? 0
      : items.reduce((sum, r) => sum + r.total_score, 0) / items.length

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="받은 후기" />

      {!loading && items.length > 0 && (
        <View style={styles.summary}>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons
                key={s}
                name={s <= Math.round(avg) ? "star" : "star-outline"}
                size={20}
                color="#fbbf24"
              />
            ))}
          </View>
          <Text style={styles.avg}>{avg.toFixed(1)} / 5</Text>
          <Text style={styles.count}>총 {items.length}개의 후기</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="star-outline" size={48} color={lightColors.ink300} />
          <Text style={styles.empty}>아직 받은 후기가 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => <ReviewRow review={item} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </SafeAreaView>
  )
}

function ReviewRow({ review }: { review: ReviewEntry }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.reviewer}>{review.reviewer_name}</Text>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Ionicons
              key={s}
              name={s <= review.total_score ? "star" : "star-outline"}
              size={14}
              color="#fbbf24"
            />
          ))}
        </View>
      </View>
      {review.content && <Text style={styles.content}>{review.content}</Text>}
      <View style={styles.subscores}>
        <Text style={styles.subscore}>응답 {review.response_speed}</Text>
        <Text style={styles.subscore}>정확 {review.accuracy}</Text>
        <Text style={styles.subscore}>친절 {review.kindness}</Text>
      </View>
      <Text style={styles.date}>{new Date(review.created_at).toLocaleDateString("ko-KR")}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.muted },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  empty: {
    fontSize: fontSize.md,
    color: lightColors.ink500,
    marginTop: spacing[2],
  },
  summary: {
    backgroundColor: lightColors.background,
    paddingVertical: spacing[5],
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  starRow: { flexDirection: "row", gap: 2 },
  avg: {
    fontSize: fontSize["2xl"],
    fontWeight: "800",
    color: lightColors.ink900,
    marginTop: 4,
  },
  count: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    marginTop: 4,
  },
  row: {
    backgroundColor: lightColors.background,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: 4,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewer: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  content: {
    fontSize: fontSize.sm,
    color: lightColors.ink700,
    lineHeight: 20,
    marginTop: 4,
  },
  subscores: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: 4,
  },
  subscore: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  date: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 4,
  },
  sep: { height: 1, backgroundColor: lightColors.border },
})
