/**
 * ReviewsModal — 이웃별 / 후기 (web 1:1 — 중앙 카드 모달).
 */

import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import type { ReviewEntry } from "@gwangjang/features/profile"

interface Props {
  visible: boolean
  trustScore: number | null | undefined
  reviewCount: number | null | undefined
  reviews: ReviewEntry[]
  loading: boolean
  onClose: () => void
}

export function ReviewsModal({
  visible,
  trustScore,
  reviewCount,
  reviews,
  loading,
  onClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation && e.stopPropagation()}
        >
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>이웃 별 & 후기</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={lightColors.ink900} />
            </Pressable>
          </View>

          {/* 점수 카드 (web 1:1) */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreLineWrap}>
              <View style={styles.scoreLine}>
                <Ionicons name="star-outline" size={18} color={lightColors.ink900} />
                <Text style={styles.scoreLabel}>이웃 별</Text>
              </View>
              <Text style={styles.scoreReviewCount}>
                {(reviewCount ?? 0) === 0 ? "아직 후기가 없어요" : `${reviewCount}개 후기`}
              </Text>
            </View>
            {/* 별 5개 */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => {
                const filled = typeof trustScore === "number" && i <= Math.round(trustScore)
                return (
                  <Ionicons
                    key={i}
                    name={filled ? "star" : "star-outline"}
                    size={22}
                    color={filled ? "#eab308" : "#cbd5e1"}
                  />
                )
              })}
            </View>
            <View style={styles.scoreFooter}>
              <Ionicons name="chatbubble-outline" size={14} color={lightColors.ink500} />
              <Text style={styles.scoreFooterText}>
                거래 후기 {reviewCount ?? 0}개
              </Text>
            </View>
          </View>

          {/* 후기 목록 */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={lightColors.primary} />
            </View>
          ) : reviews.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="chatbubble-outline" size={32} color={lightColors.ink300} />
              <Text style={styles.empty}>아직 후기가 없습니다</Text>
            </View>
          ) : (
            <FlatList
              data={reviews}
              keyExtractor={(r) => r.id}
              contentContainerStyle={{ padding: spacing[3], gap: spacing[2] }}
              renderItem={({ item }) => (
                <View style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewer}>{item.reviewer_name || "익명"}</Text>
                    <View style={styles.ratingLine}>
                      <Ionicons name="star" size={14} color="#eab308" />
                      <Text style={styles.ratingValue}>
                        {item.total_score?.toFixed(1) ?? "—"}
                      </Text>
                    </View>
                  </View>
                  {item.content ? (
                    <Text style={styles.reviewContent}>{item.content}</Text>
                  ) : null}
                  <View style={styles.subScores}>
                    <SubScore label="응답" value={item.response_speed} />
                    <SubScore label="정확" value={item.accuracy} />
                    <SubScore label="친절" value={item.kindness} />
                  </View>
                  <Text style={styles.reviewDate}>
                    {new Date(item.created_at).toLocaleDateString("ko-KR")}
                  </Text>
                </View>
              )}
            
              removeClippedSubviews={true}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={11}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function SubScore({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.subScore}>
      <Text style={styles.subLabel}>{label}</Text>
      <Text style={styles.subValue}>{value ?? "—"}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: lightColors.background,
    borderRadius: 20,
    width: "100%",
    maxWidth: 440,
    maxHeight: Math.round(Dimensions.get("window").height * 0.7),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },

  // 점수 카드
  scoreCard: {
    margin: spacing[4],
    padding: spacing[4],
    backgroundColor: lightColors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  scoreLineWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  scoreLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  scoreReviewCount: {
    fontSize: 12,
    color: lightColors.ink500,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
    marginBottom: 8,
  },
  scoreFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
  },
  scoreFooterText: {
    fontSize: 11,
    color: lightColors.ink500,
  },

  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  empty: {
    fontSize: 13,
    color: lightColors.ink500,
  },

  // 후기 카드
  reviewCard: {
    backgroundColor: lightColors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: spacing[3],
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  reviewer: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  ratingLine: { flexDirection: "row", alignItems: "center", gap: 2 },
  ratingValue: { fontSize: fontSize.sm, fontWeight: "600", color: lightColors.ink900 },
  reviewContent: {
    fontSize: fontSize.sm,
    color: lightColors.ink700,
    marginBottom: 6,
  },
  subScores: { flexDirection: "row", gap: spacing[3], marginTop: 4 },
  subScore: { flexDirection: "row", gap: 2 },
  subLabel: { fontSize: 11, color: lightColors.ink500 },
  subValue: { fontSize: 11, fontWeight: "600", color: lightColors.ink700 },
  reviewDate: {
    marginTop: 6,
    fontSize: 11,
    color: lightColors.ink500,
  },
})
