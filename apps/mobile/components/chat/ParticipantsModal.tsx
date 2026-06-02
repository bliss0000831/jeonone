/**
 * ParticipantsModal — 채팅방 참가자 strip 클릭 시 뜨는 시트.
 * 광장 web 의 components/chat/participants-modal.tsx 와 동일 동작:
 *   - 참가자 목록 표시 (아바타·이름·역할 뱃지)
 *   - 본인 제외 다른 참가자 클릭 → 프로필 페이지 (WebView)
 */

import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import type { ChatParticipant } from "@gwangjang/features/chat"

interface Props {
  visible: boolean
  participants: ChatParticipant[]
  currentUserId: string | null
  onClose: () => void
  onSelect: (p: ChatParticipant) => void
}

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  buyer:  { label: "구매자",   color: "#3b82f6" },
  seller: { label: "판매자",   color: "#22c55e" },
  expert: { label: "전문가",   color: "#a855f7" },
}

export function ParticipantsModal({
  visible,
  participants,
  currentUserId,
  onClose,
  onSelect,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>참가자 ({participants.length}명)</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={lightColors.ink900} />
            </Pressable>
          </View>

          <FlatList
            data={participants}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingVertical: spacing[2] }}
            renderItem={({ item }) => {
              const isMe = item.id === currentUserId
              const role = ROLE_LABEL[item.role]
              return (
                <Pressable
                  onPress={() => !isMe && onSelect(item)}
                  disabled={isMe}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && !isMe && { backgroundColor: lightColors.muted },
                  ]}
                >
                  <View style={styles.avatar}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarLetter}>
                        {(item.nickname?.[0] ?? "?").toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.nickname || "이웃"}
                        {isMe ? " (나)" : ""}
                      </Text>
                      {role && (
                        <View style={[styles.roleBadge, { backgroundColor: role.color }]}>
                          <Text style={styles.roleText}>{role.label}</Text>
                        </View>
                      )}
                    </View>
                    {!isMe && (
                      <Text style={styles.viewProfile}>프로필 보기 →</Text>
                    )}
                  </View>
                </Pressable>
              )
            }}
          
            removeClippedSubviews={true}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={11}
          />
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
    maxHeight: "75%",
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: lightColors.primary,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
  },
  viewProfile: {
    fontSize: fontSize.xs,
    color: lightColors.primary,
    marginTop: 2,
  },
})
