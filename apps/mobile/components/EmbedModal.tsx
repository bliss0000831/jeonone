/**
 * EmbedModal — 인스타/유튜브 게시물을 모달 안 WebView 로 인라인 임베드.
 *
 * 웹의 InstagramEmbed / YouTubeEmbed 와 동일한 UX:
 *   - 별도 화면 이동 없이 게시물만 인라인 재생
 *   - 인스타: https://www.instagram.com/p/{code}/embed/captioned/
 *   - 유튜브: https://www.youtube-nocookie.com/embed/{id}?rel=0&modestbranding=1
 */

import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

interface Props {
  visible: boolean
  onClose: () => void
  /** "instagram" | "youtube" */
  kind: "instagram" | "youtube"
  /** 원본 URL (instagram.com/p/... 또는 youtube.com/watch?v=...) */
  url: string
}

// Instagram URL → embed URL
function toInstagramEmbed(raw: string): string | null {
  try {
    const u = new URL(raw)
    // /p/{code}/ 또는 /reel/{code}/ 또는 /tv/{code}/
    const m = u.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/)
    if (!m) return null
    const kind = m[1] === "p" ? "p" : m[1] === "reel" ? "reel" : "tv"
    return `https://www.instagram.com/${kind}/${m[2]}/embed/captioned/`
  } catch {
    return null
  }
}

// YouTube URL → video ID
function toYouTubeId(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1).split("/")[0] || null
    }
    if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/")) {
      return u.pathname.split("/")[2] || null
    }
    if (u.pathname === "/watch") {
      return u.searchParams.get("v")
    }
    return null
  } catch {
    return null
  }
}

// YouTube iframe HTML — 웹(apps/web/components/youtube-embed.tsx) 과 동일한 전략.
// nocookie 도메인 + 단순 파라미터 + referrer 가 gwangjang.app 으로 가도록 메타 추가.
// WebView 의 baseUrl 을 https://gwangjang.app 으로 설정해 Referer 헤더가 gwangjang.app 으로 가게 함.
function buildYouTubeHtml(id: string): string {
  const src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1`
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta name="referrer" content="strict-origin-when-cross-origin" />
<style>
  html,body{margin:0;padding:0;background:#000;height:100%;width:100%;overflow:hidden}
  .wrap{position:fixed;inset:0;}
  iframe{width:100%;height:100%;border:0;display:block}
</style>
</head><body>
<div class="wrap">
  <iframe id="yt" src="${src}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen playsinline webkit-playsinline referrerpolicy="strict-origin-when-cross-origin"></iframe>
</div>
</body></html>`
}

export function EmbedModal({ visible, onClose, kind, url }: Props) {
  const instagramUrl = kind === "instagram" ? toInstagramEmbed(url) : null
  const youtubeId = kind === "youtube" ? toYouTubeId(url) : null
  const title = kind === "instagram" ? "인스타그램" : "유튜브"

  if (kind === "instagram" && !instagramUrl) return null
  if (kind === "youtube" && !youtubeId) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.dialog}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
              onPress={() => {
                Linking.openURL(url).catch(() => {})
                onClose()
              }}
              hitSlop={8}
              style={styles.externalBtn}
            >
              <Ionicons name="open-outline" size={16} color={lightColors.ink900} />
              <Text style={styles.externalBtnText}>외부에서 열기</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={lightColors.ink900} />
            </Pressable>
          </View>
        </View>
        <WebView
          source={
            kind === "youtube"
              ? {
                  html: buildYouTubeHtml(youtubeId as string),
                  // 웹과 동일한 전략 — Referer 가 gwangjang.app 으로 전송돼야 YouTube 임베드 허용.
                  baseUrl: "https://gwangjang.app",
                }
              : { uri: instagramUrl as string }
          }
          style={[
            styles.webview,
            kind === "youtube" && { backgroundColor: "#000" },
          ]}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          mixedContentMode="always"
          originWhitelist={["https://*", "http://*"]}
          onStartShouldSetResponder={() => true}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  dialog: {
    position: "absolute",
    top: "10%",
    bottom: "10%",
    left: 16,
    right: 16,
    backgroundColor: "#ffffff",
    borderRadius: radius.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightColors.border,
  },
  title: { fontSize: fontSize.md, fontWeight: "700", color: lightColors.ink900 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  externalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: lightColors.muted,
  },
  externalBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  webview: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
})
