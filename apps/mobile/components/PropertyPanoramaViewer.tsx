/**
 * 360° 가상 투어 뷰어 (모바일).
 *
 * 웹의 PropertyPanoramaViewer 와 동일한 Pannellum 엔진을
 * WebView 로 임베드. 이미지 URL 만 inject 하면 CDN 에서 라이브러리 로드 후
 * 자동 회전 + 터치 드래그 360° 가능.
 *
 * 입력: panoramaImages = [{ url, title }, ...]
 * 동작:
 *   - 첫 이미지를 기본 표시
 *   - 여러 장이면 하단 chip 으로 전환
 *   - 인터넷 끊기면 빈 화면 (offline graceful — fallback 텍스트)
 */

import { useMemo, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

export interface PanoramaImage {
  url: string
  title?: string | null
}

interface Props {
  images: PanoramaImage[]
  height?: number
}

function buildHtml(imageUrl: string): string {
  // Pannellum 2.5.6 CDN (jsdelivr 안정 미러)
  // autoLoad: true, autoRotate: -2, hfov: 110
  // showZoomCtrl/showFullscreenCtrl 끄고 모바일 친화 UI
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css" />
<style>
  html, body { margin:0; padding:0; height:100%; background:#000; overflow:hidden; }
  #panorama { width:100vw; height:100vh; }
  .pnlm-controls-container { display:none !important; }
  .pnlm-load-box, .pnlm-error-msg { color:#fff; font-family:system-ui; }
</style>
</head>
<body>
<div id="panorama"></div>
<script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
<script>
  try {
    pannellum.viewer("panorama", {
      type: "equirectangular",
      panorama: ${JSON.stringify(imageUrl)},
      autoLoad: true,
      autoRotate: -2,
      hfov: 110,
      showControls: false,
    });
  } catch (e) {
    document.body.innerHTML = '<div style="color:#fff;padding:20px;font-family:system-ui">파노라마 로드 실패</div>';
  }
</script>
</body>
</html>`
}

export function PropertyPanoramaViewer({ images, height = 360 }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const current = images[activeIdx]
  const html = useMemo(
    () => (current ? buildHtml(current.url) : ""),
    [current?.url],
  )

  if (images.length === 0) return null

  return (
    <View>
      <View style={[styles.viewer, { height }]}>
        <WebView
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://cdn.jsdelivr.net" }}
          style={{ flex: 1, backgroundColor: "#000" }}
          // 성능: HW accel + cache, scroll 비활성
          androidLayerType="hardware"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
        />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>360°</Text>
        </View>
      </View>

      {/* 여러 방 — chip 전환 */}
      {images.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {images.map((img, idx) => {
            const active = idx === activeIdx
            return (
              <Pressable
                key={idx}
                onPress={() => setActiveIdx(idx)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {img.title || `방 ${idx + 1}`}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  viewer: {
    backgroundColor: "#000",
    borderRadius: radius.lg,
    overflow: "hidden",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
    backgroundColor: lightColors.muted,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  chipActive: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  chipText: { fontSize: fontSize.sm, color: lightColors.ink700, fontWeight: "600" },
  chipTextActive: { color: "#ffffff" },
})
