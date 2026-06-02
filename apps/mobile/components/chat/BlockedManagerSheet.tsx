/**
 * 차단된 대화방 관리 모달.
 * 차단 키 → 라벨 매핑은 사용자가 prop 으로 전달.
 */

import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

interface Props {
  visible: boolean
  blocked: string[]
  labelFor: (key: string) => string
  onClose: () => void
  onUnblock: (key: string) => void
}

export function BlockedManagerSheet({
  visible,
  blocked,
  labelFor,
  onClose,
  onUnblock,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={6} style={{ padding: 6 }}>
            <Ionicons name="close" size={24} color={lightColors.ink900} />
          </Pressable>
          <Text style={styles.title}>
            차단 목록 관리
            <Text style={styles.subCount}>  {blocked.length}</Text>
          </Text>
          <View style={{ width: 36 }} />
        </View>
        {blocked.length === 0 ? (
          <Text style={styles.empty}>차단한 대화방이 없습니다</Text>
        ) : (
          <FlatList
            data={blocked}
            keyExtractor={(k) => k}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {labelFor(item)}
                </Text>
                <Pressable onPress={() => onUnblock(item)} hitSlop={6}>
                  <Text style={styles.unblock}>차단 해제</Text>
                </Pressable>
              </View>
            )}
          
            removeClippedSubviews={true}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={11}
          />
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  subCount: {
    fontWeight: "400",
    color: lightColors.ink500,
    fontSize: fontSize.sm,
  },
  empty: {
    textAlign: "center",
    color: lightColors.ink500,
    marginTop: 60,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    marginRight: spacing[3],
  },
  unblock: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: lightColors.primary,
  },
})
