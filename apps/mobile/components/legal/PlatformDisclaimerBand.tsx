/**
 * 통신판매중개자 면책 띠 — 각 서비스 메인 페이지 *하단* 에 노출.
 *
 * 전상법 제20조의2 면책 요건: 통신판매중개자 지위 명시 + 거래 당사자가 아님 안내.
 * 누르면 약관 페이지로 이동.
 */

import { Pressable, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

export function PlatformDisclaimerBand({
  variant = "default",
}: {
  /** "default" = 표준 안내, "list-bottom" = 리스트 마지막에 붙는 컴팩트 버전 */
  variant?: "default" | "list-bottom"
}) {
  const router = useRouter()
  const compact = variant === "list-bottom"
  return (
    <Pressable
      onPress={() => router.push("/legal/terms")}
      style={[styles.band, compact && styles.bandCompact]}
      hitSlop={4}
    >
      <Ionicons
        name="information-circle-outline"
        size={16}
        color={lightColors.ink700}
        style={{ marginRight: 6, marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>
          본 플랫폼은 통신판매중개자로서 거래 당사자가 아닙니다.{" "}
          <Text style={styles.link}>자세히 →</Text>
        </Text>
        {!compact && (
          <Text style={styles.sub}>
            게시 상품·매물·서비스의 정확성·적법성 및 거래 이행의 책임은 등록자에게 있습니다.
          </Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  band: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    marginHorizontal: spacing[3],
    marginTop: spacing[4],
    marginBottom: spacing[4],
    backgroundColor: lightColors.muted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  bandCompact: {
    paddingVertical: spacing[2],
    marginTop: spacing[2],
    marginBottom: spacing[3],
  },
  text: {
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    lineHeight: 20,
    fontWeight: "500",
  },
  sub: {
    fontSize: fontSize.sm,
    color: lightColors.ink700,
    lineHeight: 19,
    marginTop: 5,
  },
  link: {
    color: lightColors.primary,
    fontWeight: "700",
  },
})
