/**
 * 채팅방 행 길게 누름 / 메뉴 버튼 시 뜨는 바텀 시트.
 * 알림 켜기/끄기 · 차단 · 신고 · 나가기.
 */

import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

export type RoomMenuTarget = {
  kind: "direct" | "club" | "gb"
  id: string
  label: string
}

interface Props {
  target: RoomMenuTarget | null
  isMuted: boolean
  onClose: () => void
  onToggleMute: () => void
  onBlock: () => void
  onReport: () => void
  onLeave: () => void
}

export function RoomMenuSheet({
  target,
  isMuted,
  onClose,
  onToggleMute,
  onBlock,
  onReport,
  onLeave,
}: Props) {
  if (!target) return null
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>대화방 관리</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{target.label}</Text>
          </View>

          <Item
            icon={isMuted ? "notifications-outline" : "notifications-off-outline"}
            label={isMuted ? "알림 켜기" : "알림 끄기"}
            onPress={onToggleMute}
          />
          <Item icon="ban-outline" label="차단하기" onPress={onBlock} />
          <Item icon="flag-outline" label="신고하기" onPress={onReport} />
          <Item icon="trash-outline" label="대화방 나가기" destructive onPress={onLeave} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function Item({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: any
  label: string
  destructive?: boolean
  onPress: () => void
}) {
  const color = destructive ? "#dc2626" : lightColors.ink900
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: lightColors.muted }]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.itemLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing[3],
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
    marginTop: 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  itemLabel: {
    fontSize: fontSize.md,
    fontWeight: "500",
  },
})
