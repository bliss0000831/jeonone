/**
 * 중고거래 첫 채팅 시 안전수칙 안내 모달.
 *
 * AsyncStorage 에 "다시 보지 않기" 저장 → 다음 채팅부터 자동 통과.
 * 사용 패턴:
 *   const { gate } = useSecondhandSafetyGate()
 *   await gate()  // 처음이면 사용자 확인 대기, 두 번째부턴 즉시 resolve
 *   await openChat()
 */

import { useCallback, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

const STORAGE_KEY = "secondhand-safety-modal-skip:v1"

/**
 * `gate()` 호출 시 첫 채팅이면 모달 노출 → 사용자 확인 후 resolve.
 * 이미 확인했으면 즉시 resolve.
 */
export function useSecondhandSafetyGate() {
  const [visible, setVisible] = useState(false)
  const [skipNext, setSkipNext] = useState(false)
  const [pending, setPending] = useState<{
    resolve: () => void
    reject: () => void
  } | null>(null)

  const gate = useCallback(async (): Promise<void> => {
    const skipped = await AsyncStorage.getItem(STORAGE_KEY)
    if (skipped === "true") return
    return new Promise<void>((resolve, reject) => {
      setPending({ resolve, reject })
      setVisible(true)
    })
  }, [])

  const handleConfirm = useCallback(async () => {
    if (skipNext) await AsyncStorage.setItem(STORAGE_KEY, "true")
    pending?.resolve()
    setPending(null)
    setVisible(false)
  }, [pending, skipNext])

  const handleClose = useCallback(() => {
    pending?.reject()
    setPending(null)
    setVisible(false)
  }, [pending])

  const Modal_ = (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="lock-closed" size={20} color={lightColors.primary} />
            <Text style={styles.title}>안전한 거래를 위한 안내</Text>
          </View>
          <View style={styles.body}>
            <Bullet text="가급적 직거래를 권장합니다" />
            <Bullet
              text="선입금 요구·계좌이체 유도는 사기일 수 있어요"
              warn
            />
            <Bullet text="사이버캅(경찰청)에서 계좌·번호 사기 이력 조회 가능" />
            <Bullet
              text="분쟁 시 본 플랫폼은 중재에 한계가 있으며, 법적 책임은 거래 당사자에게 있습니다"
            />
            <Bullet text="개인정보(주민번호·신분증·계좌비밀번호) 요구 시 즉시 신고" warn />
          </View>
          <Pressable
            onPress={() => setSkipNext((v) => !v)}
            style={styles.skipRow}
            hitSlop={6}
          >
            <View style={[styles.checkbox, skipNext && styles.checkboxOn]}>
              {skipNext && <Ionicons name="checkmark" size={12} color="#fff" />}
            </View>
            <Text style={styles.skipText}>다시 보지 않기</Text>
          </Pressable>
          <Pressable onPress={handleConfirm} style={styles.confirmBtn}>
            <Text style={styles.confirmText}>확인했습니다</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )

  return { gate, Modal: Modal_ }
}

function Bullet({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <View style={styles.bullet}>
      <Text style={[styles.bulletDot, warn && styles.bulletWarn]}>•</Text>
      <Text style={[styles.bulletText, warn && styles.bulletWarn]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[4],
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: lightColors.ink900,
  },
  body: { gap: 8 },
  bullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  bulletDot: {
    fontSize: 14,
    color: lightColors.ink500,
    lineHeight: 18,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.ink700,
    lineHeight: 19,
  },
  bulletWarn: {
    color: "#b91c1c",
    fontWeight: "600",
  },
  skipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: lightColors.ink300,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  skipText: {
    fontSize: 12,
    color: lightColors.ink700,
  },
  confirmBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  confirmText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontWeight: "700",
  },
})
