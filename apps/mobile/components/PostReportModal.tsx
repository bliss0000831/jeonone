/**
 * 게시물 신고 모달 — 광장 web ReportButton 1:1 미러.
 *
 * 정독 매핑 (apps/web/components/report-button.tsx):
 *   - 신고 사유 5개 (업자 의심 / 스팸·광고 / 사기 의심 / 부적절한 내용 / 기타)
 *   - 추가 상세 입력 (textarea)
 *   - POST /api/reports {targetType, targetId, reason, reasonDetail}
 *   - 응답 처리:
 *     · 200 OK → "신고가 접수되었습니다. 감사합니다."
 *     · 409 → "이미 신고하신 글입니다."
 *     · 400 본인 → "본인이 작성한 글은 신고할 수 없습니다."
 *     · 401 → "로그인이 필요합니다."
 */

import { useState } from "react"
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { gwangjangFetch } from "@/lib/supabase"

export type ReportTargetType =
  | "secondhand" | "jobs" | "sharing" | "clubs" | "new-store"
  | "board" | "property" | "group_buying" | "local_food"
  | "interior" | "moving" | "cleaning" | "repair" | "requests"

interface Props {
  visible: boolean
  onClose: () => void
  targetType: ReportTargetType
  targetId: string
}

const REASONS: { value: string; label: string }[] = [
  { value: "commercial",    label: "업자 의심" },
  { value: "spam",          label: "스팸/광고" },
  { value: "fraud",         label: "사기 의심" },
  { value: "inappropriate", label: "부적절한 내용" },
  { value: "other",         label: "기타" },
]

export function PostReportModal({ visible, onClose, targetType, targetId }: Props) {
  const [reason, setReason] = useState("commercial")
  const [detail, setDetail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const r = await gwangjangFetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          reasonDetail: detail || null,
        }),
      })
      const data = await r.json().catch(() => ({} as any))
      if (r.ok) {
        Alert.alert("접수 완료", "신고가 접수되었습니다. 감사합니다.")
        setDetail("")
        onClose()
      } else if (r.status === 409) {
        Alert.alert("알림", "이미 신고하신 글입니다.")
        onClose()
      } else if (
        r.status === 400 &&
        typeof data?.error === "string" &&
        data.error.includes("본인")
      ) {
        Alert.alert("알림", "본인이 작성한 글은 신고할 수 없습니다.")
        onClose()
      } else if (r.status === 401) {
        Alert.alert("알림", "로그인이 필요합니다.")
      } else {
        Alert.alert("실패", data?.error || "신고에 실패했습니다.")
      }
    } catch {
      Alert.alert("실패", "신고 요청 중 오류가 발생했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* 헤더 */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="alert-circle" size={20} color="#ef4444" />
              <Text style={styles.title}>게시물 신고</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={lightColors.ink500} />
            </Pressable>
          </View>

          <Text style={styles.label}>신고 사유</Text>
          <View style={styles.reasonsWrap}>
            {REASONS.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => setReason(r.value)}
                style={[
                  styles.reasonChip,
                  reason === r.value && styles.reasonChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.reasonChipText,
                    reason === r.value && { color: "#ffffff", fontWeight: "700" },
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 14 }]}>상세 내용 (선택)</Text>
          <TextInput
            value={detail}
            onChangeText={setDetail}
            placeholder="구체적인 사유를 입력해 주세요"
            placeholderTextColor={lightColors.ink500}
            multiline
            style={styles.detailInput}
          />

          <View style={styles.actionRow}>
            <Pressable onPress={onClose} style={[styles.actionBtn, styles.cancelBtn]}>
              <Text style={styles.cancelBtnText}>취소</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={[styles.actionBtn, styles.submitBtn, submitting && { opacity: 0.6 }]}
              disabled={submitting}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? "접수 중..." : "신고하기"}
              </Text>
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
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 16, fontWeight: "700", color: lightColors.ink900 },

  label: {
    fontSize: 13,
    fontWeight: "600",
    color: lightColors.ink900,
    marginBottom: 8,
  },
  reasonsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.background,
  },
  reasonChipActive: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  reasonChipText: { fontSize: 13, color: lightColors.ink900 },

  detailInput: {
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.border,
    fontSize: 13,
    color: lightColors.ink900,
    textAlignVertical: "top",
  },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { backgroundColor: lightColors.muted },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: lightColors.ink900 },
  submitBtn: { backgroundColor: "#ef4444" },
  submitBtnText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
})
