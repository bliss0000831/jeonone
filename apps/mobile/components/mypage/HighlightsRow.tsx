/**
 * HighlightsRow — 광장 web 의 components/profile/profile-highlights.tsx 1:1 미러.
 *
 * 핵심 분기 (웹 정독 기반):
 *   1. 빈 + self 모드: 작은 인라인 "+ 대표 사진 추가" 링크 (큰 원 X)
 *   2. 빈 + other 모드: 섹션 자체 숨김 (null)
 *   3. 채워짐: 가로 스크롤
 *      - self 면 첫 칸에 "추가/수정" 점선 원
 *      - 각 대표 사진는 gradient ring (yellow→pink→purple, p-0.5)
 *        안에 background bg p-0.5, 그 안에 이미지 원형
 *      - 비디오면 우하단에 ▶ 뱃지
 *
 * 대표 사진 원 = 64x64. ring = 2px outer + 2px inner padding.
 */

import { useEffect } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Image } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"
import type { ProfileHighlight } from "@gwangjang/features/profile"
import { VideoPoster } from "./VideoPoster"

interface Props {
  items: ProfileHighlight[]
  mode?: "self" | "other"
  onAdd?: () => void
  onOpen?: (h: ProfileHighlight, index: number) => void
}

export function HighlightsRow({ items, mode = "self", onAdd, onOpen }: Props) {
  // ⚡️ 썸네일 행 마운트되자마자 풀사이즈 미디어 백그라운드 prefetch.
  // 사용자가 누르기 전에 미리 캐시 → StoryViewer 열릴 때 즉시 표시.
  useEffect(() => {
    if (items.length === 0) return
    const urls = items
      .filter((h) => (h as any).media_type !== "video" && h.kind !== "video")
      .map((h) => (h as any).media_url || h.cover_url)
      .filter((u): u is string => !!u)
    if (urls.length > 0) {
      try { Image.prefetch(urls, "memory-disk") } catch { /* noop */ }
    }
  }, [items])

  // 1. 타인 + 빈 → 섹션 숨김
  if (items.length === 0 && mode !== "self") return null

  // 2. 본인 + 빈 → 작은 인라인 링크
  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.6 }]}
          hitSlop={6}
        >
          <Ionicons name="add" size={14} color={lightColors.ink500} />
          <Text style={styles.emptyText}>대표 사진 추가</Text>
        </Pressable>
      </View>
    )
  }

  // 3. 채워짐 — 가로 스크롤
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollWrap}
      contentContainerStyle={styles.scrollContent}
    >
      {mode === "self" && (
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.addCircle}>
            <Ionicons name="add" size={24} color={lightColors.ink500} />
          </View>
          <Text style={styles.cellLabel} numberOfLines={1}>추가/수정</Text>
        </Pressable>
      )}

      {items.map((h, i) => {
        const isVideo = (h as any).media_type === "video" || h.kind === "video"
        const cover = h.cover_url
        const mediaUrl = (h as any).media_url ?? null
        return (
          <Pressable
            key={h.id}
            onPress={() => onOpen?.(h, i)}
            style={({ pressed }) => [styles.cell, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            {/* 외곽 그라디언트 ring (yellow→pink→purple) */}
            <LinearGradient
              colors={["#fbbf24", "#ec4899", "#9333ea"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientRing}
            >
              {/* 안쪽 background (흰 패딩) */}
              <View style={styles.innerRing}>
                {cover ? (
                  <Image
                    source={{ uri: cover }}
                    style={styles.thumb}
                    cachePolicy="memory-disk"
                    transition={0}
                    contentFit="cover"
                  />
                ) : isVideo && mediaUrl ? (
                  <VideoPoster
                    src={mediaUrl}
                    style={styles.thumb}
                    borderRadius={(SIZE - RING * 2 - PAD * 2) / 2}
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Text style={styles.thumbFallbackText} numberOfLines={1}>
                      {h.title.slice(0, 3)}
                    </Text>
                  </View>
                )}
              </View>
              {/* 비디오 ▶ 뱃지 */}
              {isVideo && (
                <View style={styles.videoBadge}>
                  <Ionicons name="play" size={8} color="#ffffff" />
                </View>
              )}
            </LinearGradient>
            <Text style={styles.cellLabel} numberOfLines={1}>
              {h.title}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

// 웹: w-16 h-16 = 64x64. p-0.5 (ring) + p-0.5 (inner bg)
const SIZE = 64
const RING = 2
const PAD = 2

const styles = StyleSheet.create({
  emptyWrap: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: lightColors.background,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyText: {
    fontSize: fontSize.xs,
    color: lightColors.ink500,
  },
  scrollWrap: {
    backgroundColor: lightColors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: 16, // gap-4
    alignItems: "flex-start",
  },
  cell: {
    alignItems: "center",
    width: SIZE + 8,
    gap: 6,
    flexShrink: 0,
  },
  cellLabel: {
    fontSize: fontSize.xs,
    color: lightColors.ink900,
    maxWidth: SIZE,
    textAlign: "center",
  },
  addCircle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: lightColors.border,
    backgroundColor: "rgba(241,245,249,0.4)", // secondary/40
    alignItems: "center",
    justifyContent: "center",
  },
  gradientRing: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    padding: RING,
    position: "relative",
  },
  innerRing: {
    width: SIZE - RING * 2,
    height: SIZE - RING * 2,
    borderRadius: (SIZE - RING * 2) / 2,
    backgroundColor: lightColors.background,
    padding: PAD,
  },
  thumb: {
    width: SIZE - RING * 2 - PAD * 2,
    height: SIZE - RING * 2 - PAD * 2,
    borderRadius: (SIZE - RING * 2 - PAD * 2) / 2,
  },
  thumbFallback: {
    backgroundColor: lightColors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbFallbackText: {
    fontSize: 10,
    fontWeight: "500",
    color: lightColors.ink500,
  },
  videoBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
})
