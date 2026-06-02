/**
 * ProfileCounters — 광장 web 의 components/profile/profile-counters.tsx 1:1 미러.
 *
 * 웹 구조:
 *   <div class="grid grid-cols-3 divide-x divide-border bg-card rounded-xl border border-border">
 *     <button>팔로워 / count</button>
 *     <button>팔로잉 / count</button>
 *     <button class="bg-amber-50/60">이웃 별 / star + score</button>
 *
 * 핵심:
 *   - 3-column grid, 세로 구분선 (divide-x)
 *   - 이웃별만 amber 배경 (#fffbeb 70% opacity)
 *   - 후기 0 이면 NEW 상태 (회색 별, "0" 표시)
 *   - 숫자 포맷: 1만, 1.5만, 1.0천 등
 */

import { Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, radius } from "@gwangjang/tokens"

export type CounterKind = "posts" | "followers" | "following" | "trust"

interface Props {
  followers: number
  following: number
  trustScore?: number | null
  reviewCount?: number | null
  onClick?: (kind: CounterKind) => void
}

export function ProfileCounters({
  followers,
  following,
  trustScore,
  reviewCount,
  onClick,
}: Props) {
  const rc = reviewCount ?? 0
  const validScore =
    trustScore != null && trustScore >= 0 && trustScore <= 5 && rc > 0
      ? trustScore
      : null

  return (
    <View style={styles.wrap}>
      {/* 팔로워 */}
      <Pressable
        onPress={() => onClick?.("followers")}
        style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
      >
        <Text style={styles.value}>{formatCount(followers)}</Text>
        <Text style={styles.label}>팔로워</Text>
      </Pressable>

      <View style={styles.divider} />

      {/* 팔로잉 */}
      <Pressable
        onPress={() => onClick?.("following")}
        style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
      >
        <Text style={styles.value}>{formatCount(following)}</Text>
        <Text style={styles.label}>팔로잉</Text>
      </Pressable>

      <View style={styles.divider} />

      {/* 이웃 별 */}
      <Pressable
        onPress={() => onClick?.("trust")}
        style={({ pressed }) => [
          styles.cell,
          styles.cellAmber,
          pressed && styles.cellAmberPressed,
        ]}
      >
        <View style={styles.starRow}>
          <Ionicons
            name={validScore != null ? "star" : "star-outline"}
            size={14}
            color={validScore != null ? "#fbbf24" : "rgba(217,119,6,0.6)"}
            style={{ marginRight: 2 }}
          />
          <Text style={styles.amberValue}>
            {validScore != null ? validScore.toFixed(1) : "0"}
          </Text>
        </View>
        <Text style={styles.label}>
          별 · 후기{rc > 0 ? ` (${rc})` : ""}
        </Text>
      </Pressable>
    </View>
  )
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}천`
  return String(n)
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  cell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  cellPressed: {
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  cellAmber: {
    backgroundColor: "rgba(254,243,199,0.6)", // amber-50/60
  },
  cellAmberPressed: {
    backgroundColor: "rgba(253,230,138,0.7)", // amber-100/70
  },
  divider: {
    width: 1,
    backgroundColor: lightColors.border,
  },
  value: {
    fontSize: 15,
    fontWeight: "700",
    color: lightColors.ink900,
    lineHeight: 18,
  },
  amberValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#b45309", // amber-700
    lineHeight: 18,
  },
  label: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    marginTop: 2,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
})
