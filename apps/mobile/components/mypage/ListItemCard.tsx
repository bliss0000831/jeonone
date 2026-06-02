/**
 * ListItemCard — 마이페이지 서브화면의 공통 카드.
 * 이미지 + 제목 + 부제 + 메타 + 우측 화살표.
 */

import { Image, Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

interface Props {
  image?: string | null
  imageFallback?: React.ComponentProps<typeof Ionicons>["name"]
  title: string
  subtitle?: string | null
  /** 강조 정보 (가격 등) — 굵고 진한 색 */
  meta?: string | null
  /** 부가 정보 (날짜·찜 표시 등) — 작고 옅은 회색 */
  footer?: string | null
  badge?: { label: string; tone?: "primary" | "amber" | "emerald" | "muted" | "rose" }
  onPress?: () => void
  rightContent?: React.ReactNode
}

const BADGE_BG: Record<NonNullable<Props["badge"]>["tone"] & string, string> = {
  primary: "#dbeafe",
  amber: "#fef3c7",
  emerald: "#d1fae5",
  muted: lightColors.muted,
  rose: "#fce7f3",
}
const BADGE_FG: Record<NonNullable<Props["badge"]>["tone"] & string, string> = {
  primary: lightColors.primary,
  amber: "#b45309",
  emerald: "#047857",
  muted: lightColors.ink500,
  rose: "#be185d",
}

export function ListItemCard({
  image,
  imageFallback = "image-outline",
  title,
  subtitle,
  meta,
  footer,
  badge,
  onPress,
  rightContent,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && styles.pressed,
      ]}
    >
      {image ? (
        <Image source={{ uri: image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Ionicons name={imageFallback} size={24} color={lightColors.ink500} />
        </View>
      )}
      <View style={styles.body}>
        {badge && (
          <View
            style={[
              styles.badge,
              { backgroundColor: BADGE_BG[badge.tone ?? "muted"] },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: BADGE_FG[badge.tone ?? "muted"] },
              ]}
            >
              {badge.label}
            </Text>
          </View>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        {meta && (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        )}
        {footer && (
          <Text style={styles.footer} numberOfLines={1}>
            {footer}
          </Text>
        )}
      </View>
      {rightContent ?? (
        onPress && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={lightColors.ink500}
          />
        )
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: lightColors.background,
    gap: spacing[3],
  },
  pressed: { opacity: 0.7 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: lightColors.muted,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  meta: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  footer: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 2,
  },
})
