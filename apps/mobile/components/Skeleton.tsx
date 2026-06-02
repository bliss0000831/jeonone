/**
 * Skeleton — 로딩 중 카드 골격을 회색 블록으로 표시.
 *
 * 사용: <Skeleton width="100%" height={60} />  또는  <SkeletonChatRoom />  같은 preset.
 *
 * 미세 펄스 애니메이션으로 "로딩 중" 시그널만 살짝.
 */

import { useEffect, useRef } from "react"
import { Animated, StyleSheet, View } from "react-native"
import { lightColors, spacing, radius } from "@gwangjang/tokens"

interface Props {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: any
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 6, style }: Props) {
  const op = useRef(new Animated.Value(0.55)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.95, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [op])
  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: "#e5e7eb",
          opacity: op,
        },
        style,
      ]}
    />
  )
}

// ── Preset: 채팅방 한 행 ────────────────────────────
export function SkeletonChatRoom() {
  return (
    <View style={skeletonStyles.chatRow}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="80%" height={12} />
        <Skeleton width="60%" height={11} />
      </View>
    </View>
  )
}

// ── Preset: 채팅 목록 (6개 행) ────────────────────────────
export function SkeletonChatList() {
  return (
    <View style={{ padding: 0 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonChatRoom key={i} />
      ))}
    </View>
  )
}

// ── Preset: 마이페이지 ────────────────────────────
export function SkeletonMypage() {
  return (
    <View style={skeletonStyles.mypage}>
      {/* 배너 자리 */}
      <View style={{ height: 140, backgroundColor: "#e0f2fe" }} />
      {/* 프로필 row */}
      <View style={skeletonStyles.profRow}>
        <Skeleton width={96} height={96} borderRadius={48} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="50%" height={20} />
          <Skeleton width="35%" height={13} />
        </View>
      </View>
      {/* Counters */}
      <View style={skeletonStyles.counters}>
        <Skeleton width="32%" height={56} borderRadius={radius.lg} />
        <Skeleton width="32%" height={56} borderRadius={radius.lg} />
        <Skeleton width="32%" height={56} borderRadius={radius.lg} />
      </View>
      {/* CTA */}
      <View style={skeletonStyles.cta}>
        <Skeleton width="48%" height={40} borderRadius={radius.md} />
        <Skeleton width="48%" height={40} borderRadius={radius.md} />
      </View>
    </View>
  )
}

const skeletonStyles = StyleSheet.create({
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  mypage: {
    flex: 1,
  },
  profRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
    paddingHorizontal: spacing[4],
    marginTop: -16,
    paddingBottom: 4,
  },
  counters: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    marginTop: 4,
  },
  cta: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    marginTop: spacing[4],
  },
})
