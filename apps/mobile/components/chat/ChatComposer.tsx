/**
 * ChatComposer — 메시지 입력 + 전송.
 *
 * RN 강점:
 *   - KeyboardAvoidingView (호출 측에서 감싸기)
 *   - 햅틱 (impactLight on send)
 *   - multiline + 자동 높이
 *
 * Phase 2B-1: 텍스트만. 이미지 첨부는 Phase 2B-2.
 */

import { useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { impactLight } from "@gwangjang/platform/haptics"

interface ChatComposerProps {
  onSend: (content: string) => Promise<void> | void
  /** 전문가 초대 등 좌측 추가 버튼 (옵션) */
  leftSlot?: React.ReactNode
  /** placeholder */
  placeholder?: string
  /** 비활성화 상태 (예: 거래완료된 매물) */
  disabled?: boolean
  /** 입력 변경 시 호출 — typing indicator broadcast 용 (호출 측에서 debounce) */
  onTyping?: () => void
}

export function ChatComposer({
  onSend,
  leftSlot,
  placeholder = "메시지 입력...",
  disabled = false,
  onTyping,
}: ChatComposerProps) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const typingThrottleRef = useRef<number>(0)

  function handleChange(v: string) {
    setText(v)
    // 1초 간격으로만 broadcast (도배 방지)
    if (onTyping) {
      const now = Date.now()
      if (now - typingThrottleRef.current > 1000) {
        typingThrottleRef.current = now
        onTyping()
      }
    }
  }

  const canSend = !!text.trim() && !sending && !disabled

  async function handleSend() {
    if (!canSend) return
    const content = text.trim()
    setSending(true)
    setText("")
    try {
      await impactLight()
    } catch {
      /* 햅틱 실패 무시 */
    }
    try {
      await onSend(content)
    } catch (err) {
      // 실패 시 입력값 복원
      setText(content)
      throw err
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={styles.container}>
      {leftSlot}
      <View style={[styles.inputWrap, disabled && styles.inputWrapDisabled]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={lightColors.ink500}
          multiline
          maxLength={5000}
          // sending 중에도 editable 유지 — 비활성화하면 TextInput 이 blur 되어
          // 키보드가 자동으로 내려감. 전송 후에도 입력 상태 유지하려면 editable 고정.
          editable={!disabled}
          blurOnSubmit={false}
          accessibilityLabel="메시지 입력"
        />
      </View>
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        accessibilityLabel="메시지 전송"
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.sendButton,
          !canSend && styles.sendButtonDisabled,
          pressed && canSend && styles.sendButtonPressed,
        ]}
      >
        {sending ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Ionicons
            name="send"
            size={20}
            color={canSend ? "#ffffff" : lightColors.ink500}
          />
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center", // 단일 줄 입력 시 input ↔ send 버튼 수직 중앙 정렬
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: lightColors.background,
    gap: spacing[2],
  },
  inputWrap: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: lightColors.input,
    borderRadius: radius.xl,
    paddingHorizontal: spacing[3],
    paddingVertical: 9, // 40 - lineHeight 22 = 18 / 2 ≈ 9 (텍스트 수직 정중앙)
  },
  inputWrapDisabled: {
    opacity: 0.5,
  },
  input: {
    fontSize: fontSize.base,
    color: lightColors.ink900,
    lineHeight: 22, // 폰트 16 기준 line-height 명시 — 패딩 9 + 22 = 40 (minHeight)
    maxHeight: 100,
    textAlignVertical: "center",
    includeFontPadding: false,
    padding: 0, // 안드 기본 패딩 완전 제거
    margin: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: lightColors.muted,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
})
