/**
 * ChatComposer — 메시지 입력 + 전송.
 *
 * RN 강점:
 *   - KeyboardAvoidingView (호출 측에서 감싸기)
 *   - 햅틱 (impactLight on send)
 *   - multiline + 자동 높이
 *
 * 사진 전송: 카메라/갤러리 버튼 → expo-image-picker → 호출 측 onPickImage(uri).
 * 어르신 친화 — 사진 버튼을 큼직하게.
 */

import { useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native"
import * as ImagePicker from "expo-image-picker"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { impactLight } from "@gwangjang/platform/haptics"

interface ChatComposerProps {
  onSend: (content: string) => Promise<void> | void
  /** 사진 선택 시 호출 — 로컬 URI 전달. 호출 측에서 업로드 + 메시지 전송 처리. */
  onPickImage?: (localUri: string) => Promise<void> | void
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
  onPickImage,
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

  // 선택된 사진 URI 를 정규화 후 호출 측에 전달 (업로드는 호출 측 책임)
  async function deliverImage(uri: string) {
    if (!onPickImage) return
    const u =
      uri.startsWith("file://") ||
      uri.startsWith("http") ||
      uri.startsWith("content://") ||
      uri.startsWith("/")
        ? uri
        : `file://${uri}`
    setSending(true)
    try {
      await impactLight()
    } catch {
      /* 햅틱 실패 무시 */
    }
    try {
      await onPickImage(u)
    } catch {
      /* 실패 시 호출 측에서 Alert 처리 */
    } finally {
      setSending(false)
    }
  }

  // 갤러리에서 사진 선택
  async function pickFromLibrary() {
    if (disabled || sending) return
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert("권한 필요", "사진 라이브러리 권한이 필요합니다. 설정에서 허용해 주세요.")
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.8,
      })
      const asset = result.assets?.[0]
      if (!asset) return
      await deliverImage(asset.uri)
    } catch (err) {
      Alert.alert("오류", err instanceof Error ? err.message : "사진을 불러오지 못했습니다.")
    }
  }

  // 카메라로 촬영
  async function takePhoto() {
    if (disabled || sending) return
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert("권한 필요", "카메라 권한이 필요합니다. 설정에서 허용해 주세요.")
        return
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      })
      const asset = result.assets?.[0]
      if (!asset) return
      await deliverImage(asset.uri)
    } catch (err) {
      Alert.alert("오류", err instanceof Error ? err.message : "사진을 촬영하지 못했습니다.")
    }
  }

  return (
    <View style={styles.container}>
      {leftSlot}
      {/* 사진 버튼 — 어르신 친화로 큼직하게. 카메라 + 갤러리 */}
      {onPickImage && (
        <>
          <Pressable
            onPress={takePhoto}
            disabled={disabled || sending}
            accessibilityLabel="사진 촬영"
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [
              styles.mediaButton,
              (disabled || sending) && styles.mediaButtonDisabled,
              pressed && styles.sendButtonPressed,
            ]}
          >
            <Ionicons name="camera" size={26} color={lightColors.primary} />
          </Pressable>
          <Pressable
            onPress={pickFromLibrary}
            disabled={disabled || sending}
            accessibilityLabel="사진 첨부"
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [
              styles.mediaButton,
              (disabled || sending) && styles.mediaButtonDisabled,
              pressed && styles.sendButtonPressed,
            ]}
          >
            <Ionicons name="image" size={26} color={lightColors.primary} />
          </Pressable>
        </>
      )}
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
  // 어르신 친화 — 사진 버튼 큼직하게 (44pt 터치 타겟)
  mediaButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaButtonDisabled: {
    opacity: 0.4,
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
