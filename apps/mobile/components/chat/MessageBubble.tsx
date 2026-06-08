/**
 * MessageBubble — 채팅 메시지 버블.
 *
 * 광장 web 의 message-primitives.tsx 와 동일 톤 + 발신자 정보.
 * isMe(자신) vs 상대방 분리 + 시스템 메시지 별도 처리.
 */

import { useState } from "react"
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"
import { Ionicons } from "@expo/vector-icons"
import type { Message } from "@gwangjang/features/chat"

interface MessageBubbleProps {
  message: Message
  isMe: boolean
  /** 시간 표시 (같은 발신자 연속 메시지면 false 권장) */
  showTime?: boolean
  /** 상대방 메시지 시 발신자 이름 + 아바타 표시 */
  showSenderInfo?: boolean
  senderName?: string | null
  senderAvatar?: string | null
  /** 발신자 아바타/이름 누를 때 호출 — 보통 /profile/{id} 로 이동 */
  onSenderPress?: () => void
}

export function MessageBubble({
  message,
  isMe,
  showTime = true,
  showSenderInfo = false,
  senderName,
  senderAvatar,
  onSenderPress,
}: MessageBubbleProps) {
  // 사진 확대 보기 + 깨진 이미지 fallback
  const [imageExpanded, setImageExpanded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = message.image_url ?? null
  // 시스템 메시지는 중앙 정렬 pill
  if (message.is_system) {
    return (
      <View style={styles.systemRow}>
        <View style={styles.systemPill}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.outer}>
      {/* 상대방 메시지: 발신자 정보 (아바타 + 이름) — 그룹의 첫 메시지만 */}
      {!isMe && showSenderInfo && (
        <Pressable
          onPress={onSenderPress}
          disabled={!onSenderPress}
          style={({ pressed }) => [
            styles.senderInfo,
            pressed && onSenderPress ? { opacity: 0.6 } : null,
          ]}
          hitSlop={4}
        >
          {senderAvatar ? (
            <Image source={{ uri: senderAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarLetter}>
                {senderName?.[0] ?? "?"}
              </Text>
            </View>
          )}
          <Text style={styles.senderName}>{senderName ?? "이웃"}</Text>
        </Pressable>
      )}

      <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
        {/* 상대방 측: 아바타 자리 (이름 표시 안 한 연속 메시지면 빈 공간만) */}
        {!isMe && !showSenderInfo && <View style={styles.avatarSpacer} />}

        {!isMe && showSenderInfo && (
          /* 첫 메시지의 아바타는 senderInfo 에 이미 표시됨 → 빈 공간 */
          <View style={styles.avatarSpacer} />
        )}

        {isMe && showTime && (
          <View style={styles.timeWrap}>
            {/* 읽음 표시 — 내가 보낸 메시지가 상대방이 읽음 처리되면 노출 */}
            {message.is_read && <Text style={styles.readMark}>읽음</Text>}
            <Text style={styles.time}>{formatTime(message.created_at)}</Text>
          </View>
        )}

        {imageUrl ? (
          /* 사진 메시지 — 썸네일. 탭하면 전체화면 확대. */
          <Pressable
            onPress={() => !imageFailed && setImageExpanded(true)}
            disabled={imageFailed}
            accessibilityLabel="사진 보기"
            accessibilityRole="imagebutton"
            style={styles.imageWrap}
          >
            {imageFailed ? (
              <View style={styles.imageFallback}>
                <Ionicons
                  name="image-outline"
                  size={28}
                  color={lightColors.ink500}
                />
                <Text style={styles.imageFallbackText}>
                  사진을 불러올 수 없어요
                </Text>
              </View>
            ) : (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            )}
            {/* 사진과 함께 보낸 캡션 (있으면) */}
            {message.content ? (
              <View
                style={[
                  styles.bubble,
                  isMe ? styles.bubbleMe : styles.bubbleOther,
                  styles.captionBubble,
                ]}
              >
                <Text style={[styles.content, isMe && styles.contentMe]}>
                  {message.content}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <View
            style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}
          >
            <Text style={[styles.content, isMe && styles.contentMe]}>
              {message.content}
            </Text>
          </View>
        )}

        {!isMe && showTime && (
          <Text style={styles.time}>{formatTime(message.created_at)}</Text>
        )}
      </View>

      {/* 사진 전체화면 확대 보기 */}
      {imageUrl && !imageFailed && (
        <Modal
          visible={imageExpanded}
          transparent
          animationType="fade"
          onRequestClose={() => setImageExpanded(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setImageExpanded(false)}
          >
            <Pressable
              onPress={() => setImageExpanded(false)}
              accessibilityLabel="닫기"
              accessibilityRole="button"
              style={styles.modalClose}
              hitSlop={12}
            >
              <Ionicons name="close" size={30} color="#ffffff" />
            </Pressable>
            <Image
              source={{ uri: imageUrl }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          </Pressable>
        </Modal>
      )}
    </View>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h < 12 ? "오전" : "오후"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${period} ${h12}:${m.toString().padStart(2, "0")}`
}

const BUBBLE_RADIUS = 18
const AVATAR_SIZE = 32

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: spacing[3],
    paddingVertical: 3,
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: spacing[2],
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: lightColors.muted,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: lightColors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: lightColors.primary,
  },
  senderName: {
    fontSize: fontSize.xs,
    fontWeight: "500",
    color: lightColors.ink700,
  },
  avatarSpacer: {
    width: AVATAR_SIZE + spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
  },
  rowMe: {
    justifyContent: "flex-end",
  },
  rowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "70%",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: BUBBLE_RADIUS,
  },
  bubbleMe: {
    backgroundColor: lightColors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: lightColors.muted,
    borderBottomLeftRadius: 4,
  },
  content: {
    fontSize: fontSize.base,
    color: lightColors.ink900,
    lineHeight: 20,
  },
  contentMe: {
    color: "#ffffff",
  },
  // 사진 메시지 — 썸네일
  imageWrap: {
    maxWidth: "70%",
  },
  image: {
    width: 220,
    height: 220,
    maxWidth: "100%",
    borderRadius: BUBBLE_RADIUS,
    backgroundColor: lightColors.muted,
  },
  imageFallback: {
    width: 180,
    height: 140,
    borderRadius: BUBBLE_RADIUS,
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  imageFallbackText: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  captionBubble: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalImage: {
    width: "100%",
    height: "80%",
  },
  modalClose: {
    position: "absolute",
    top: 48,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  time: {
    fontSize: 11,
    color: lightColors.ink500,
    marginBottom: 2,
  },
  timeWrap: {
    alignItems: "flex-end",
    marginBottom: 2,
  },
  readMark: {
    fontSize: 10,
    color: lightColors.primary,
    fontWeight: "700",
  },
  systemRow: {
    alignItems: "center",
    paddingVertical: spacing[2],
  },
  systemPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radius["2xl"],
    backgroundColor: lightColors.muted,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  systemText: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
})
