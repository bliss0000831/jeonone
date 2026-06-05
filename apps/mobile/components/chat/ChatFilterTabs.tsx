/**
 * 채팅 목록 상단 필터 탭 — 전원일기 농촌 플랫폼 유지 도메인.
 * 카운트 0 인 탭은 자동 숨김 (전체 제외).
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

export type ChatFilterKey =
  | "all" | "sharing" | "local_food" | "secondhand"
  | "jobs" | "notice" | "direct"

interface Props {
  active: ChatFilterKey
  counts: Record<ChatFilterKey, number>
  onChange: (key: ChatFilterKey) => void
}

const TABS: Array<{ key: ChatFilterKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "sharing", label: "나눔" },
  { key: "local_food", label: "로컬푸드" },
  { key: "secondhand", label: "농기구" },
  { key: "jobs", label: "일손" },
  { key: "direct", label: "DM" },
  { key: "notice", label: "공지" },
]

export function ChatFilterTabs({ active, counts, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {TABS.map((t) => {
          const c = counts[t.key] ?? 0
          if (t.key !== "all" && c === 0) return null
          const isActive = active === t.key
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {t.label}
              </Text>
              {c > 0 && (
                <View style={[styles.count, isActive && styles.countActive]}>
                  <Text style={[styles.countText, isActive && styles.countTextActive]}>
                    {c}
                  </Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: lightColors.background,
    // 필터 탭 ↔ 첫 섹션 사이 구분선 제거 (요청)
  },
  content: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing[3],
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  chipActive: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  label: {
    fontSize: fontSize.sm,
    color: lightColors.ink900,
  },
  labelActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  count: {
    minWidth: 18,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  countActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  countText: {
    fontSize: 10,
    fontWeight: "700",
    color: lightColors.ink500,
  },
  countTextActive: {
    color: "#ffffff",
  },
})
