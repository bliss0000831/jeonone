/**
 * ChatRoomMenu — 채팅방 헤더의 ⋯ 클릭 시 뜨는 바텀 시트.
 * 광장 web 의 chat-header 메뉴와 동일 항목.
 */

import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

interface Props {
  visible: boolean
  isMuted: boolean
  onClose: () => void
  onToggleMute: () => void
  onReport: () => void
  onBlock: () => void
  onLeave: () => void
}

export function ChatRoomMenu({
  visible,
  isMuted,
  onClose,
  onToggleMute,
  onReport,
  onBlock,
  onLeave,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>채팅방 메뉴</Text>

          <Item
            icon={isMuted ? "notifications-outline" : "notifications-off-outline"}
            label={isMuted ? "알림 켜기" : "알림 끄기"}
            onPress={onToggleMute}
          />
          <Item icon="ban-outline" label="차단하기" onPress={onBlock} />
          <Item icon="flag-outline" label="신고하기" onPress={onReport} />
          <Item
            icon="exit-outline"
            label="대화방 나가기"
            destructive
            onPress={onLeave}
          />

          <View style={styles.divider} />

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
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
      style={({ pressed }) => [
        styles.item,
        pressed && { backgroundColor: lightColors.muted },
      ]}
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
    paddingBottom: spacing[4],
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightColors.border,
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
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
  divider: {
    height: 8,
    backgroundColor: lightColors.muted,
    marginTop: 4,
  },
  cancel: {
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  cancelText: {
    fontSize: fontSize.md,
    fontWeight: "500",
    color: lightColors.ink500,
  },
})
