/**
 * PostListRow — UnifiedPost / SavedItem 공통 카드 행.
 * 광장 web 의 li.flex.gap-3.p-3.bg-card 와 시각 일치.
 */

import { Image, Pressable, StyleSheet, Text, View } from "react-native"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { ListCardMenu, type ListCardKind } from "@/components/ListCardMenu"

interface Props {
  title: string
  excerpt?: string | null
  image?: string | null
  kindLabel: string
  metaRight?: string
  highlight?: boolean
  onPress: () => void
  /** ⋮ 메뉴 활성화 — 마이페이지/프로필 리스트에서 사용 */
  menuKind?: ListCardKind
  postId?: string
  authorId?: string | null
  onChanged?: () => void
}

export function PostListRow({
  title,
  excerpt,
  image,
  kindLabel,
  metaRight,
  highlight,
  onPress,
  menuKind,
  postId,
  authorId,
  onChanged,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      {image ? (
        <Image source={{ uri: image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <View style={[styles.kindBadge, highlight && styles.kindBadgeAlt]}>
            <Text style={[styles.kindText, highlight && styles.kindTextAlt]}>
              {kindLabel}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {excerpt ? (
          <Text style={styles.excerpt} numberOfLines={2}>
            {excerpt}
          </Text>
        ) : null}
        {metaRight ? (
          <Text style={styles.meta}>{metaRight}</Text>
        ) : null}
      </View>
      {menuKind && postId && (
        <View style={{ alignSelf: "flex-start" }}>
          <ListCardMenu
            kind={menuKind}
            postId={postId}
            authorId={authorId ?? null}
            title={title}
            placement="row"
            onChanged={onChanged}
          />
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing[3],
    padding: spacing[3],
    backgroundColor: lightColors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
    marginBottom: spacing[2],
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: lightColors.muted,
  },
  thumbEmpty: {},
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#dbeafe",
  },
  kindBadgeAlt: {
    backgroundColor: "#ede9fe",
  },
  kindText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1d4ed8",
  },
  kindTextAlt: {
    color: "#7c3aed",
  },
  title: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: lightColors.ink900,
  },
  excerpt: {
    marginTop: 4,
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  meta: {
    marginTop: 4,
    fontSize: 11,
    color: lightColors.ink500,
  },
})
