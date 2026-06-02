/**
 * VideoThumbnailImage — 동영상 URL 에서 첫 프레임을 추출하여 이미지로 표시.
 *
 * expo-video-thumbnails 로 프레임 추출 후 메모리 캐시에 저장.
 * 리스트에서 동일 URL 재요청 시 즉시 반환 (in-memory LRU).
 *
 * 사용:
 *   <VideoThumbnailImage uri="https://...mp4" style={{ width: 64, height: 64 }} />
 */

import { useEffect, useState } from "react"
import { View, type StyleProp, type ViewStyle } from "react-native"
import { Image } from "expo-image"
import { Ionicons } from "@expo/vector-icons"

let _getThumbnailAsync: ((uri: string, options?: any) => Promise<{ uri: string }>) | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("expo-video-thumbnails")
  _getThumbnailAsync = mod.getThumbnailAsync
} catch {
  /* 모듈 미설치 환경 — fallback placeholder */
}

// ── In-memory cache (URL → local thumbnail URI) ──
const thumbCache = new Map<string, string>()
const MAX_CACHE = 200
function cacheSet(key: string, value: string) {
  if (thumbCache.size >= MAX_CACHE) {
    // 가장 오래된 항목 제거
    const first = thumbCache.keys().next().value
    if (first) thumbCache.delete(first)
  }
  thumbCache.set(key, value)
}

interface Props {
  uri: string
  style?: StyleProp<ViewStyle>
  /** 프레임 추출 시간 (ms). default: 0 (첫 프레임) */
  timeMs?: number
}

export function VideoThumbnailImage({ uri, style, timeMs = 0 }: Props) {
  const [thumbUri, setThumbUri] = useState<string | null>(thumbCache.get(uri) ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (thumbCache.has(uri)) {
      setThumbUri(thumbCache.get(uri)!)
      return
    }
    if (!_getThumbnailAsync) {
      setFailed(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const result = await _getThumbnailAsync!(uri, { time: timeMs })
        if (cancelled) return
        cacheSet(uri, result.uri)
        setThumbUri(result.uri)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [uri, timeMs])

  if (failed || (!thumbUri && !_getThumbnailAsync)) {
    return (
      <View style={[{ backgroundColor: "#334155", alignItems: "center", justifyContent: "center" }, style]}>
        <Ionicons name="videocam" size={22} color="#94a3b8" />
      </View>
    )
  }

  if (!thumbUri) {
    // 로딩 중 — 빈 placeholder
    return <View style={[{ backgroundColor: "#e2e8f0" }, style]} />
  }

  return (
    <Image
      source={{ uri: thumbUri }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  )
}
