/**
 * MediaItem — URL 이 이미지/동영상에 따라 자동 분기 렌더.
 *
 * 사용:
 *   <MediaItem uri={url} style={...} />
 *
 * 동영상: expo-video 의 VideoView + useVideoPlayer (네이티브 player, 디스크 캐시 자동).
 * 이미지: expo-image (memory-disk cache).
 *
 * Web (react-native-web) 환경에선 expo-video 가 깨지므로 placeholder fallback.
 */

import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { Image as ExpoImage } from "expo-image"
import { Ionicons } from "@expo/vector-icons"
import { lightColors } from "@gwangjang/tokens"

// expo-video 는 native 만 — web 에선 require 시 throw → try/catch
let _VideoView: any = null
let _useVideoPlayer: any = null
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("expo-video")
    _VideoView = m.VideoView
    _useVideoPlayer = m.useVideoPlayer
  } catch {
    /* 모듈 미설치 환경 — 정적 placeholder */
  }
}

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/i.test(url)
}

interface Props {
  uri: string
  style?: StyleProp<ViewStyle>
  /** 비디오 자동 재생 (default: false) */
  autoplay?: boolean
  /** 비디오 음소거 (default: true) */
  muted?: boolean
  /** 비디오 루프 (default: false) */
  loop?: boolean
  /** contentFit (이미지) */
  contentFit?: "cover" | "contain"
  /** 비디오: 컨트롤 표시 (default: true) */
  videoControls?: boolean
  /** 탭 시 호출 (이미지/비디오 공통) — 풀스크린 모달 등 */
  onPress?: () => void
}

export function MediaItem({
  uri,
  style,
  autoplay = false,
  muted = true,
  loop = false,
  contentFit = "cover",
  videoControls = true,
  onPress,
}: Props) {
  const video = isVideoUrl(uri)

  if (!video) {
    const img = (
      <ExpoImage
        source={{ uri }}
        style={[StyleSheet.absoluteFill as any]}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        transition={120}
      />
    )
    return (
      <View style={[styles.wrap, style]}>
        {onPress ? <Pressable onPress={onPress} style={StyleSheet.absoluteFill as any}>{img}</Pressable> : img}
      </View>
    )
  }

  // Video — expo-video 미지원 환경에선 placeholder
  if (!_VideoView || !_useVideoPlayer) {
    return (
      <Pressable onPress={onPress} style={[styles.wrap, styles.fallback, style]}>
        <Ionicons name="play-circle" size={48} color="#ffffff" />
        <Text style={styles.fallbackText}>비디오</Text>
      </Pressable>
    )
  }

  return (
    <View style={[styles.wrap, style]}>
      <NativeVideo uri={uri} autoplay={autoplay} muted={muted} loop={loop} videoControls={videoControls} onPress={onPress} />
    </View>
  )
}

function NativeVideo({
  uri,
  autoplay,
  muted,
  loop,
  videoControls,
  onPress,
}: {
  uri: string
  autoplay: boolean
  muted: boolean
  loop: boolean
  videoControls: boolean
  onPress?: () => void
}) {
  const player = _useVideoPlayer(uri, (p: any) => {
    p.muted = muted
    p.loop = loop
    if (autoplay) p.play()
  })
  const VideoView = _VideoView
  const node = (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill as any}
      nativeControls={videoControls}
      contentFit="cover"
    />
  )
  return onPress ? <Pressable onPress={onPress} style={StyleSheet.absoluteFill as any}>{node}</Pressable> : node
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#0f172a",
  },
  fallbackText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
})
