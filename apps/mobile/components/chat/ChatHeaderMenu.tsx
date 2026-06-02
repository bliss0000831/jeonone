/**
 * 채팅 목록 헤더의 ⋯ 더보기 시트.
 * - 대화방 일괄편집
 * - 전체 알림 토글
 * - 차단 목록 관리
 */

import { Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

interface Props {
  visible: boolean
  notifOff: boolean
  blockedCount: number
  onClose: () => void
  onBulkEdit: () => void
  onToggleNotif: (on: boolean) => void
  onBlockedManager: () => void
}

export function ChatHeaderMenu({
  visible,
  notifOff,
  blockedCount,
  onClose,
  onBulkEdit,
  onToggleNotif,
  onBlockedManager,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>대화방 설정</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={lightColors.ink900} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: lightColors.muted }]}
            onPress={onBulkEdit}
          >
            <Ionicons name="create-outline" size={20} color={lightColors.ink500} />
            <Text style={styles.itemLabel}>대화방 일괄편집</Text>
          </Pressable>

          <View style={styles.notifRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[3], flex: 1 }}>
              <Ionicons
                name={notifOff ? "notifications-off-outline" : "notifications-outline"}
                size={20}
                color={lightColors.ink500}
              />
              <View>
                <Text style={styles.itemLabel}>알림 설정</Text>
                <Text style={styles.notifSub}>
                  {notifOff ? "전체 채팅 알림이 꺼져 있습니다" : "전체 채팅 알림이 켜져 있습니다"}
                </Text>
              </View>
            </View>
            <Switch
              value={!notifOff}
              onValueChange={(on) => onToggleNotif(on)}
              trackColor={{ false: lightColors.border, true: lightColors.primary }}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: lightColors.muted }]}
            onPress={onBlockedManager}
          >
            <Ionicons name="ban-outline" size={20} color={lightColors.ink500} />
            <Text style={[styles.itemLabel, { flex: 1 }]}>차단 목록 관리</Text>
            <Text style={styles.itemRight}>{blockedCount}개</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    color: lightColors.ink900,
  },
  itemRight: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  notifSub: {
    fontSize: 11,
    color: lightColors.ink500,
    marginTop: 2,
  },
})
