/**
 * CategoryPills — 마이페이지 리스트 화면 상단의 둥근 필터 칩.
 *
 * 활성: 파란 배경 + 흰 글자, 비활성: 흰 배경 + 회색 테두리.
 * 카테고리별 카운트 (>0) 옆에 작게 표시.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { lightColors } from "@gwangjang/tokens"

export interface CategoryPillItem {
  kind: string
  label: string
  count: number
}

interface Props {
  items: CategoryPillItem[]
  value: string
  onChange: (kind: string) => void
}

export function CategoryPills({ items, value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {items.map((it) => {
          const active = value === it.kind
          return (
            <Pressable
              key={it.kind}
              onPress={() => onChange(it.kind)}
              style={({ pressed }) => [
                styles.pill,
                active ? styles.pillActive : styles.pillIdle,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                style={[styles.label, active ? styles.labelActive : styles.labelIdle]}
              >
                {it.label}
              </Text>
              {it.count > 0 && (
                <Text
                  style={[
                    styles.count,
                    active ? styles.labelActive : { color: lightColors.primary },
                  ]}
                >
                  {" "}
                  {it.count}
                </Text>
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
    paddingVertical: 10,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillIdle: {
    backgroundColor: "#ffffff",
    borderColor: lightColors.border,
  },
  pillActive: {
    backgroundColor: "#eff6ff",
    borderColor: lightColors.primary,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  labelIdle: { color: lightColors.ink700 },
  labelActive: { color: lightColors.primary },
  count: {
    fontSize: 13,
    fontWeight: "700",
  },
})
