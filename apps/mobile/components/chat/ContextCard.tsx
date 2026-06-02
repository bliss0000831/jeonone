/**
 * ContextCard — 채팅방 상단의 매물/게시글 정보 카드.
 *
 * 광장 web 의 ChatContextCard 와 동일 구조 — Image + 제목 + 부제 + 가격 + 상태 뱃지.
 */

import { Image, Pressable, StyleSheet, Text, View } from "react-native"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import type { ChatContextDescriptor } from "@gwangjang/features/chat"

interface ContextCardProps {
  context: ChatContextDescriptor
  /** 클릭 시 광장 web 페이지 이동 (WebView 새 화면 또는 외부 브라우저) */
  onPress?: () => void
}

export function ContextCard({ context, onPress }: ContextCardProps) {
  const tone = TONE_MAP[context.badgeTone ?? "muted"]

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      {context.image ? (
        <Image source={{ uri: context.image }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {context.title}
          </Text>
          {context.badgeLabel && (
            <View style={[styles.badge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.badgeText, { color: tone.fg }]}>
                {context.badgeLabel}
              </Text>
            </View>
          )}
        </View>
        {context.subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {context.subtitle}
          </Text>
        )}
        {context.meta && (
          <Text style={styles.meta} numberOfLines={1}>
            {context.meta}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

const TONE_MAP = {
  primary: { bg: "#dbeafe", fg: lightColors.primary },
  amber: { bg: "#fef3c7", fg: "#b45309" },
  emerald: { bg: "#d1fae5", fg: "#047857" },
  muted: { bg: lightColors.muted, fg: lightColors.ink500 },
  rose: { bg: "#fce7f3", fg: "#be185d" },
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    margin: spacing[3],
    padding: spacing[3],
    backgroundColor: lightColors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: lightColors.border,
    gap: spacing[3],
  },
  pressed: {
    opacity: 0.85,
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: lightColors.muted,
  },
  imagePlaceholder: {},
  content: {
    flex: 1,
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  title: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    marginTop: 2,
  },
  meta: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.primary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.md,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
})
