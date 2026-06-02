/**
 * 채팅방 신고 시트 — 사유 라디오 + 상세.
 */

import { useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import type { ChatReportReason } from "@gwangjang/features/chat"

const REASONS: ChatReportReason[] = [
  "스팸/광고",
  "욕설/비방",
  "음란/선정성",
  "사기/허위 정보",
  "기타",
]

interface Props {
  visible: boolean
  targetLabel: string
  onClose: () => void
  onSubmit: (reason: ChatReportReason, detail: string) => Promise<void>
}

export function ReportSheet({ visible, targetLabel, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<ChatReportReason>(REASONS[0])
  const [detail, setDetail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>신고하기</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={lightColors.ink900} />
            </Pressable>
          </View>

          <View style={{ padding: spacing[4], gap: spacing[3] }}>
            <Text style={styles.target} numberOfLines={1}>
              대상: {targetLabel}
            </Text>

            <View style={{ gap: 6 }}>
              {REASONS.map((r) => {
                const active = reason === r
                return (
                  <Pressable
                    key={r}
                    onPress={() => setReason(r)}
                    style={[styles.reason, active && styles.reasonActive]}
                  >
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.reasonText}>{r}</Text>
                  </Pressable>
                )
              })}
            </View>

            <TextInput
              value={detail}
              onChangeText={setDetail}
              placeholder="상세 내용 (선택)"
              placeholderTextColor={lightColors.ink500}
              multiline
              maxLength={500}
              style={styles.textarea}
            />

            <Pressable
              style={[styles.submit, submitting && { opacity: 0.5 }]}
              disabled={submitting}
              onPress={async () => {
                setSubmitting(true)
                try {
                  await onSubmit(reason, detail)
                  onClose()
                  setReason(REASONS[0])
                  setDetail("")
                } finally {
                  setSubmitting(false)
                }
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>신고 접수</Text>
              )}
            </Pressable>
          </View>
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
  target: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  reason: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  reasonActive: {
    borderColor: lightColors.primary,
    backgroundColor: "#eff6ff",
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: lightColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: lightColors.primary },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: lightColors.primary,
  },
  reasonText: {
    fontSize: fontSize.sm,
    color: lightColors.ink900,
  },
  textarea: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radius.md,
    padding: spacing[3],
    fontSize: fontSize.sm,
    color: lightColors.ink900,
    textAlignVertical: "top",
  },
  submit: {
    height: 44,
    backgroundColor: "#dc2626",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    color: "#ffffff",
    fontSize: fontSize.md,
    fontWeight: "700",
  },
})
