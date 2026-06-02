/**
 * CategoryChips — 가로 스크롤 칩 (전체 / 매물 / 게시판 ...).
 * 활성 칩은 primary 배경 + 흰 글자.
 */

import { Pressable, ScrollView, StyleSheet, Text } from "react-native"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

export interface ChipItem {
  key: string
  label: string
  count?: number
}

interface Props {
  items: ChipItem[]
  active: string
  onChange: (key: string) => void
}

export function CategoryChips({ items, active, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {items.map((it) => {
        const isActive = it.key === active
        return (
          <Pressable
            key={it.key}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onChange(it.key)}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {it.label}
            </Text>
            {typeof it.count === "number" && it.count > 0 && (
              <Text style={[styles.count, isActive && styles.countActive]}>
                {" "}{it.count}
              </Text>
            )}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[1],
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
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
    fontSize: fontSize.xs,
    fontWeight: "500",
    color: lightColors.ink500,
  },
  labelActive: {
    color: "#ffffff",
  },
  count: {
    fontSize: 10,
    color: lightColors.ink500,
  },
  countActive: {
    color: "rgba(255,255,255,0.85)",
  },
})
