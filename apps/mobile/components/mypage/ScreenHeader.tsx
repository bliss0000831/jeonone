/**
 * ScreenHeader — 마이페이지 서브화면 공통 헤더.
 */

import { Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

interface Props {
  title: string
  rightSlot?: React.ReactNode
}

export function ScreenHeader({ title, rightSlot }: Props) {
  const router = useRouter()
  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        hitSlop={8}
        accessibilityLabel="뒤로 가기"
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={24} color={lightColors.ink900} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.right}>{rightSlot ?? <View style={{ width: 40 }} />}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    backgroundColor: lightColors.background,
  },
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  pressed: { opacity: 0.6 },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: lightColors.ink900,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  right: {
    minWidth: 40,
    alignItems: "flex-end",
  },
})
