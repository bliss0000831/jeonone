/**
 * StoryViewer — 광장 web story-viewer.tsx 1:1 미러.
 *
 * 풀스크린 모달 + 상단 progress bar + 좌우 탭 영역 + 자동 진행.
 * 비디오는 react-native-webview 의 HTML5 <video> 로 재생 (autoPlay, playsInline).
 * 이미지는 5초, 비디오는 최대 15초 후 자동 다음으로.
 */

import { createElement, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { Image } from "expo-image"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import type { ProfileHighlight } from "@gwangjang/features/profile"

// 네이티브 비디오 플레이어 — Android/iOS 만 로드.
// WebView 의 HTML5 <video> 검정 화면 이슈 해결 + HEVC 등 모든 코덱 지원.
const VideoView: any =
  Platform.OS === "web" ? null : require("expo-video").VideoView
const useVideoPlayer: any =
  Platform.OS === "web" ? null : require("expo-video").useVideoPlayer
// 캐시 사이즈 — expo-video 가 디스크 캐시 자동 관리 (default 1GB → 2GB 확장)
const setVideoCacheSizeAsync: ((n: number) => Promise<void>) | null =
  Platform.OS === "web" ? null : require("expo-video").setVideoCacheSizeAsync

let _cacheConfigured = false

const IMAGE_DURATION = 5000
const VIDEO_MAX_DURATION = 15000

type HL = ProfileHighlight & {
  media_url?: string | null
  media_type?: "image" | "video" | null
  duration_ms?: number | null
}

interface Props {
  visible: boolean
  items: HL[]
  startIndex: number
  authorName?: string | null
  authorAvatar?: string | null
  canDelete?: boolean
  onDelete?: (id: string) => Promise<void> | void
  onClose: () => void
}

export function StoryViewer({
  visible,
  items,
  startIndex,
  authorName,
  authorAvatar,
  canDelete = false,
  onDelete,
  onClose,
}: Props) {
  const [index, setIndex] = useState(startIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const insets = useSafeAreaInsets()

  // 스와이프 다운 → 닫기
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 80) onClose()
      },
    }),
  ).current
  const startRef = useRef<number>(Date.now())
  const elapsedRef = useRef<number>(0)
  const rafRef = useRef<any>(null)

  useEffect(() => {
    if (visible) setIndex(startIndex)
  }, [visible, startIndex])

  // index 가 바뀌면 로딩 인디케이터 다시 표시
  useEffect(() => {
    setLoaded(false)
  }, [index])

  // ⚡️ 열리자마자 전체 하이라이트 이미지 prefetch (memory-disk).
  // 인스타 처럼 누르자마자 뜨도록 — 동영상은 expo-video 가 알아서 스트리밍 시작.
  useEffect(() => {
    if (!visible || items.length === 0) return
    const urls = items
      .filter((h) => (h as HL).media_type !== "video")
      .map((h) => (h as HL).media_url || h.cover_url)
      .filter((u): u is string => !!u)
    if (urls.length > 0) {
      try { Image.prefetch(urls, "memory-disk") } catch { /* noop */ }
    }
  }, [visible, items])

  // ⚡️ 인접 (이전/다음) 미디어 우선순위 prefetch — 좌/우 탭에 즉시 반응
  useEffect(() => {
    if (!visible) return
    const neighborIdx = [index - 1, index + 1].filter((i) => i >= 0 && i < items.length)
    // 이미지 인접: expo-image 캐시
    const imageUrls = neighborIdx
      .map((i) => items[i])
      .filter((h) => (h as HL).media_type !== "video")
      .map((h) => (h as HL).media_url || h.cover_url)
      .filter((u): u is string => !!u)
    if (imageUrls.length > 0) {
      try { Image.prefetch(imageUrls, "memory-disk") } catch { /* noop */ }
    }
    // 동영상 인접: 포스터(cover_url) 도 prefetch — 로딩 중 즉시 표시
    const videoPosterUrls = neighborIdx
      .map((i) => items[i])
      .filter((h) => (h as HL).media_type === "video" && h.cover_url)
      .map((h) => h.cover_url!)
    if (videoPosterUrls.length > 0) {
      try { Image.prefetch(videoPosterUrls, "memory-disk") } catch { /* noop */ }
    }
  }, [index, visible, items])

  // ⚡️ expo-video 디스크 캐시 1GB → 2GB 확장 (한 번만)
  useEffect(() => {
    if (_cacheConfigured || !setVideoCacheSizeAsync) return
    _cacheConfigured = true
    setVideoCacheSizeAsync(2 * 1024 * 1024 * 1024).catch(() => {
      _cacheConfigured = false
    })
  }, [])

  // 다음 동영상 hidden pre-buffer — 좌/우 탭 시 즉시 재생되도록
  const nextItem = items[index + 1]
  const nextVideoUrl =
    nextItem && (nextItem as HL).media_type === "video"
      ? (nextItem as HL).media_url
      : null

  const current = items[index]
  const isVideo = current?.media_type === "video"
  const duration = Math.min(
    current?.duration_ms || (isVideo ? VIDEO_MAX_DURATION : IMAGE_DURATION),
    isVideo ? VIDEO_MAX_DURATION : IMAGE_DURATION,
  )

  // 진행률 타이머
  useEffect(() => {
    if (!visible || !current) return
    setProgress(0)
    elapsedRef.current = 0
    startRef.current = Date.now()
    if (rafRef.current) clearInterval(rafRef.current)

    const interval = setInterval(() => {
      if (paused) {
        startRef.current = Date.now()
        return
      }
      const now = Date.now()
      const delta = now - startRef.current
      startRef.current = now
      elapsedRef.current += delta
      const p = Math.min(1, elapsedRef.current / duration)
      setProgress(p)
      if (p >= 1) {
        clearInterval(interval)
        next()
      }
    }, 50)
    rafRef.current = interval
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, duration, paused, visible])

  function next() {
    if (index < items.length - 1) setIndex(index + 1)
    else onClose()
  }
  function prev() {
    if (index > 0) setIndex(index - 1)
    else {
      elapsedRef.current = 0
      setProgress(0)
      startRef.current = Date.now()
    }
  }

  async function handleDelete() {
    if (!canDelete || !current || deleting) return
    setPaused(true)
    Alert.alert("삭제 확인", "이 하이라이트를 삭제할까요?", [
      { text: "취소", style: "cancel", onPress: () => setPaused(false) },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          setDeleting(true)
          try {
            await onDelete?.(current.id)
            if (items.length <= 1) onClose()
            else if (index >= items.length - 1)
              setIndex(Math.max(0, index - 1))
          } catch (e: any) {
            Alert.alert("오류", e?.message || "삭제 실패")
          } finally {
            setDeleting(false)
            setPaused(false)
          }
        },
      },
    ])
  }

  if (!current) return null
  const mediaUrl = (current as HL).media_url || current.cover_url

  const HEADER_BLOCK = insets.top + 72 // progress + 헤더 높이 (탭 영역 회피)
  const FOOTER_BLOCK = insets.bottom + 24

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root} {...panResponder.panHandlers}>
        {/* ⚡️ 다음 동영상 hidden pre-buffer — 1x1 px, opacity 0 */}
        {nextVideoUrl && Platform.OS !== "web" && (
          <HiddenVideoPrebuffer key={`prebuf-${nextVideoUrl}`} uri={nextVideoUrl} />
        )}
        {/* 미디어 (가장 아래 레이어) */}
        <View style={styles.media}>
          {isVideo && mediaUrl ? (
            Platform.OS === "web" ? (
              createElement("video", {
                key: current.id,
                src: mediaUrl,
                autoPlay: true,
                playsInline: true,
                controls: false,
                onLoadedData: () => setLoaded(true),
                style: {
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "#000",
                },
              })
            ) : (
              <>
                <NativeVideoPlayer
                  key={current.id}
                  uri={mediaUrl}
                  onReady={() => setLoaded(true)}
                />
                {/* 영상 로딩 중 cover 포스터 — 검은 화면 대신 즉시 시각 피드백 */}
                {!loaded && current.cover_url && (
                  <Image
                    source={{ uri: current.cover_url }}
                    style={[styles.fullImage, StyleSheet.absoluteFillObject]}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    priority="high"
                    transition={0}
                    pointerEvents="none"
                  />
                )}
              </>
            )
          ) : mediaUrl ? (
            <Image
              source={{ uri: mediaUrl }}
              style={styles.fullImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              priority="high"
              transition={0}
              recyclingKey={current.id}
              onLoadEnd={() => setLoaded(true)}
            />
          ) : (
            <Text style={styles.noMedia}>미디어 없음</Text>
          )}

          {!loaded && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </View>

        {/* 좌/우 탭 영역 — 헤더/푸터 침범 안 함 */}
        <Pressable
          onPress={prev}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          style={[
            styles.tapLeft,
            { top: HEADER_BLOCK, bottom: FOOTER_BLOCK },
          ]}
        />
        <Pressable
          onPress={next}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          style={[
            styles.tapRight,
            { top: HEADER_BLOCK, bottom: FOOTER_BLOCK },
          ]}
        />

        {/* 상단 scrim — 텍스트 가독성 */}
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
          style={[styles.topScrim, { height: HEADER_BLOCK + 16 }]}
          pointerEvents="none"
        />
        {/* 하단 scrim — 홈 인디케이터 영역 */}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)"]}
          style={[styles.bottomScrim, { height: FOOTER_BLOCK + 24 }]}
          pointerEvents="none"
        />

        {/* 상단 progress bars */}
        <View
          style={[styles.barsRow, { paddingTop: insets.top + 8 }]}
          pointerEvents="none"
        >
          {items.map((_, i) => (
            <View key={i} style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  {
                    width:
                      i < index
                        ? "100%"
                        : i === index
                        ? `${progress * 100}%`
                        : "0%",
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {/* 상단 헤더 */}
        <View
          style={[styles.header, { top: insets.top + 18 }]}
          pointerEvents="box-none"
        >
          <View style={styles.headerLeft}>
            {authorAvatar ? (
              <Image source={{ uri: authorAvatar }} cachePolicy="memory-disk" style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: "rgba(255,255,255,0.2)" }]} />
            )}
            <View>
              <Text style={styles.authorName} numberOfLines={1}>
                {authorName ?? "프로필"}
              </Text>
              <Text style={styles.title} numberOfLines={1}>
                {current.title}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {canDelete && (
              <Pressable
                onPress={handleDelete}
                disabled={deleting}
                hitSlop={8}
                style={styles.iconBtn}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="trash-outline" size={22} color="#fff" />
                )}
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={8} style={styles.iconBtn}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

/**
 * HiddenVideoPrebuffer — 다음 동영상을 보이지 않게 마운트해서 디스크 캐시에 미리 받아둠.
 * 1x1 px, opacity 0. muted + pause 상태로 두면 expo-video 가 background 버퍼링 시작.
 * 사용자가 다음으로 넘기면 같은 URL → 디스크 캐시 hit → 즉시 재생.
 */
function HiddenVideoPrebuffer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p: any) => {
    p.muted = true
    p.pause()
  })
  return (
    <View
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        opacity: 0,
        top: 0,
        left: 0,
        zIndex: -1,
      }}
      pointerEvents="none"
    >
      <VideoView
        player={player}
        style={{ width: 1, height: 1 }}
        nativeControls={false}
      />
    </View>
  )
}

/**
 * NativeVideoPlayer — expo-video 의 useVideoPlayer + VideoView 사용.
 * Android ExoPlayer / iOS AVPlayer 로 네이티브 재생. HEVC/H.264 둘 다 지원.
 * Modal 안에서도 surface 합성 문제 없음 (WebView 한계 회피).
 */
function NativeVideoPlayer({
  uri,
  onReady,
}: {
  uri: string
  onReady?: () => void
}) {
  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = false
    p.muted = true
    p.play()
  })

  useEffect(() => {
    if (!player) return
    const sub = player.addListener?.("statusChange", (status: any) => {
      // status === "readyToPlay" 시점에 첫 프레임 표시 가능
      if (status?.status === "readyToPlay" || status === "readyToPlay") {
        onReady?.()
      }
    })
    return () => {
      try {
        sub?.remove?.()
      } catch {}
    }
  }, [player, onReady])

  return (
    <VideoView
      player={player}
      style={{ flex: 1, width: "100%", backgroundColor: "#000" }}
      contentFit="contain"
      nativeControls={false}
      allowsFullscreen
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  barsRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
  },
  barBg: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 999,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: "#fff" },
  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 25,
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 25,
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#333" },
  authorName: { color: "#fff", fontSize: 13, fontWeight: "600" },
  title: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  iconBtn: { padding: 8, borderRadius: 999 },
  media: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  webview: { flex: 1, width: "100%", backgroundColor: "#000" },
  fullImage: { width: "100%", height: "100%" },
  noMedia: { color: "rgba(255,255,255,0.6)" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  tapLeft: {
    position: "absolute",
    left: 0,
    width: "33%",
    zIndex: 20,
  },
  tapRight: {
    position: "absolute",
    right: 0,
    width: "33%",
    zIndex: 20,
  },
})
