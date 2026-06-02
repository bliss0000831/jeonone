/**
 * QuickReplies — Composer 위 자주 쓰는 답변 pill 버튼.
 * 광장 web 의 QuickReplies 와 동일.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

interface Props {
  items: string[]
  onPick: (text: string) => void
}

export function QuickReplies({ items, onPick }: Props) {
  if (items.length === 0) return null
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((text) => (
          <Pressable
            key={text}
            onPress={() => onPick(text)}
            style={({ pressed }) => [
              styles.pill,
              pressed && styles.pillPressed,
            ]}
          >
            <Text style={styles.pillText}>{text}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing[2],
    backgroundColor: lightColors.background,
    // 위아래 구분선 제거 (요청)
  },
  row: {
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius["2xl"],
    backgroundColor: lightColors.muted,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  pillPressed: {
    backgroundColor: lightColors.secondary,
  },
  pillText: {
    fontSize: fontSize.sm,
    color: lightColors.ink700,
  },
})
