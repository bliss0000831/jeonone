/**
 * VideoPoster — 영상 URL 의 첫 프레임을 "사진처럼" 표시.
 *
 * RN 에 네이티브 video 컴포넌트 없이도 동작하도록 WebView 안 HTML5 <video> 를
 * 사용해 첫 프레임만 로드 (preload="metadata", autoplay 안 함). 컨트롤 숨김.
 *
 * 웹 (Platform.OS === "web") 은 HTMLVideoElement 직접 사용 — WebView 미지원.
 */

import { createElement } from "react"
import { Image, Platform, StyleSheet, View } from "react-native"

type Style = any

interface Props {
  src: string | null
  /** 영상이 아닌 일반 이미지(cover_url) 가 우선 표시될 때 */
  cover?: string | null
  style?: Style
  /** 모서리 둥글림 — 부모 View 의 borderRadius 와 매칭해 잘림 제거 */
  borderRadius?: number
}

const WebView: any =
  Platform.OS === "web" ? null : require("react-native-webview").WebView

export function VideoPoster({ src, cover, style, borderRadius }: Props) {
  // cover 우선
  if (cover) {
    return <Image source={{ uri: cover }} style={style} />
  }
  if (!src) {
    return <View style={style} />
  }

  if (Platform.OS === "web") {
    // 웹: 그냥 video 요소 (poster 동작)
    return createElement("video", {
      src,
      preload: "metadata",
      muted: true,
      playsInline: true,
      controls: false,
      style: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: borderRadius ?? 0,
        background: "#000",
      },
    })
  }

  // 네이티브: WebView + HTML5 <video> 로 영상 첫 프레임만 정적 표시.
  // autoplay+muted 로 페인트 트리거 → loadeddata 즉시 pause + seek(0.1) → "움직이지 않는 포스터".
  const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" /><style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}video{width:100%;height:100%;object-fit:cover;display:block}</style></head><body><video id="v" src="${src}" autoplay muted playsinline webkit-playsinline preload="auto"></video><script>var v=document.getElementById('v');if(v){v.addEventListener('loadeddata',function(){try{v.currentTime=0.1;v.pause();}catch(e){}});}</script></body></html>`

  return (
    <View
      style={[
        style,
        { overflow: "hidden", backgroundColor: "#000", borderRadius },
      ]}
      pointerEvents="none"
    >
      <WebView
        source={{ html }}
        style={{ flex: 1, backgroundColor: "#000" }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        setBuiltInZoomControls={false}
        androidLayerType="hardware"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
      />
    </View>
  )
}
