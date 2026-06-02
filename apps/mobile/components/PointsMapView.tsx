/**
 * PointsMapView — 마커 리스트를 지도 위에 표시 (web/native 공용).
 *
 * Native (Android/iOS APK): WebView 안에 Naver Maps HTML 임베드
 * Web (Expo web): window.naver 직접 사용
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Platform, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  hasNativeNaverMap,
  type NaverMapViewRef,
} from "@/lib/naver-map-loader"
import { lightColors, fontSize, spacing } from "@gwangjang/tokens"

export interface MapPoint {
  id: string
  lat: number
  lng: number
  label?: string  // 마커에 표시할 짧은 텍스트 (가격 등)
  title?: string  // 클릭 시 alert/popup 의 제목
  /** 마커 배경색 (default: primary blue) */
  color?: string
  /** 아이콘 (이모지 또는 ionicon name) */
  icon?: string
  /**
   * 커스텀 마커 HTML (web) — 지정 시 기본 원형 배경/아이콘 대신 사용.
   * 예: `<svg>...</svg>` 형태. 앵커는 항상 (16, 32).
   */
  iconHtml?: string
  /**
   * 커스텀 마커 React Node (native) — 지정 시 NaverMapMarkerOverlay 의 children 으로 렌더.
   * iconWidth / iconHeight 필수.
   */
  iconNode?: React.ReactNode
  iconWidth?: number
  iconHeight?: number
}

interface Props {
  points: MapPoint[]
  /** 지도 중심 (없으면 첫 마커 또는 fallback) */
  center?: { lat: number; lng: number; zoom?: number }
  height?: number
  /** 마커 클릭 콜백 */
  onMarkerPress?: (id: string) => void
  /** 내 위치 (있으면 별도 마커 표시) */
  myLocation?: { lat: number; lng: number } | null
  /**
   * 외부에서 지도 중심을 강제로 이동 — 값이 바뀔 때마다 카메라가 부드럽게 이동.
   * 리스트 카드 탭/내위치 버튼 등에서 사용.
   */
  focus?: { lat: number; lng: number; zoom?: number; nonce?: number } | null
}

const FALLBACK_CENTER = { lat: 37.881, lng: 127.730, zoom: 14 } // chuncheon

export function PointsMapView({
  points,
  center,
  height = 320,
  onMarkerPress,
  myLocation,
  focus,
}: Props) {
  if (Platform.OS === "web") {
    return (
      <PointsMapViewWeb
        points={points}
        center={center}
        height={height}
        onMarkerPress={onMarkerPress}
        myLocation={myLocation}
        focus={focus}
      />
    )
  }
  return (
    <PointsMapViewNative
      points={points}
      center={center}
      height={height}
      onMarkerPress={onMarkerPress}
      myLocation={myLocation}
      focus={focus}
    />
  )
}

function PointsMapViewNative({
  points,
  center,
  height,
  onMarkerPress,
  myLocation,
  focus,
}: Props) {
  const mapRef = useRef<NaverMapViewRef | null>(null)

  // focus 가 바뀔 때마다 카메라 이동 (내 위치 / 리스트 카드 탭)
  useEffect(() => {
    if (!focus || !mapRef.current) return
    try {
      mapRef.current.animateCameraTo({
        latitude: focus.lat,
        longitude: focus.lng,
        zoom: focus.zoom,
        duration: 500,
      } as any)
    } catch { /* noop */ }
  }, [focus?.lat, focus?.lng, focus?.zoom, focus?.nonce])

  if (!hasNativeNaverMap || !NaverMapView) {
    return (
      <View style={[styles.box, { height, alignItems: "center", justifyContent: "center" }]}>
        <Text style={styles.errText}>지도 모듈을 불러올 수 없어요</Text>
      </View>
    )
  }
  const c = center ?? FALLBACK_CENTER
  return (
    <View style={[styles.box, { height }]}>
      <NaverMapView
        ref={mapRef as any}
        style={{ flex: 1 }}
        initialCamera={{
          latitude: c.lat,
          longitude: c.lng,
          zoom: c.zoom ?? 14,
        }}
        isShowZoomControls={false}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
      >
        {points.map((p) => {
          // 커스텀 React View 마커 (예: 화장실 핀)
          if (p.iconNode && p.iconWidth && p.iconHeight) {
            return (
              <NaverMapMarkerOverlay
                key={p.id}
                latitude={p.lat}
                longitude={p.lng}
                width={p.iconWidth}
                height={p.iconHeight}
                anchor={{ x: 0.5, y: 1 }}
                caption={
                  p.label
                    ? { text: p.label, textSize: 11 }
                    : undefined
                }
                onTap={() => onMarkerPress?.(p.id)}
              >
                <View
                  collapsable={false}
                  style={{ width: p.iconWidth, height: p.iconHeight }}
                >
                  {p.iconNode}
                </View>
              </NaverMapMarkerOverlay>
            )
          }
          return (
            <NaverMapMarkerOverlay
              key={p.id}
              latitude={p.lat}
              longitude={p.lng}
              caption={
                p.label
                  ? {
                      text: p.label,
                      textSize: 11,
                    }
                  : undefined
              }
              onTap={() => onMarkerPress?.(p.id)}
            />
          )
        })}
        {myLocation && (
          <NaverMapMarkerOverlay
            latitude={myLocation.lat}
            longitude={myLocation.lng}
            caption={{ text: "내 위치", textSize: 10 }}
          />
        )}
      </NaverMapView>
    </View>
  )
}

// expo web 전용 — 직접 Naver Maps SDK 로드
function PointsMapViewWeb({
  points,
  center,
  height,
  onMarkerPress,
  myLocation,
  focus,
}: Props) {
  const containerRef = useRef<View>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const w = window as any
    const clientId =
      process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID ||
      process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ||
      ""
    if (!clientId) {
      setError("지도 키 미설정")
      return
    }
    function loadSdk(): Promise<void> {
      if (w.naver?.maps) return Promise.resolve()
      return new Promise((resolve, reject) => {
        const id = "naver-maps-sdk"
        const existing = document.getElementById(id) as HTMLScriptElement | null
        if (existing) {
          existing.addEventListener("load", () => resolve())
          existing.addEventListener("error", () => reject())
          return
        }
        const s = document.createElement("script")
        s.id = id
        s.async = true
        s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&ncpClientId=${clientId}`
        s.onload = () => resolve()
        s.onerror = () => reject()
        document.head.appendChild(s)
      })
    }
    loadSdk()
      .then(() => {
        if (cancelled) return
        const naver = w.naver
        if (!naver?.maps) {
          setError("SDK 로드 실패")
          return
        }
        const c = center ?? FALLBACK_CENTER
        const node = (containerRef.current as unknown) as HTMLElement
        const el = node || (document.getElementById("rn-points-map") as HTMLElement | null)
        if (!el) {
          setError("컨테이너 없음")
          return
        }
        const map = new naver.maps.Map(el, {
          center: new naver.maps.LatLng(c.lat, c.lng),
          zoom: c.zoom ?? 14,
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.TOP_LEFT },
        })
        mapRef.current = map
        setReady(true)
      })
      .catch(() => setError("지도 로드 실패"))
    return () => {
      cancelled = true
      markersRef.current.forEach((m) => { try { m.setMap(null) } catch {} })
      markersRef.current = []
      if (mapRef.current) {
        try { mapRef.current.destroy() } catch {}
        mapRef.current = null
      }
    }
  }, [center?.lat, center?.lng])

  // 마커 갱신
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const naver = (window as any).naver
    if (!naver?.maps) return
    markersRef.current.forEach((m) => { try { m.setMap(null) } catch {} })
    markersRef.current = []
    const bounds = new naver.maps.LatLngBounds()
    points.forEach((p) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return
      const pos = new naver.maps.LatLng(p.lat, p.lng)
      bounds.extend(pos)
      const color = p.color || "#2563eb"
      const labelHtml = p.label
        ? `<div style="margin-top:2px;background:#fff;color:${color};padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;border:1px solid ${color};white-space:nowrap;">${p.label}</div>`
        : ""
      const iconContent = p.iconHtml
        ? `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;">${p.iconHtml}${labelHtml}</div>`
        : `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;">` +
            `<div style="width:32px;height:32px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;">${p.icon ?? "📍"}</div>` +
            labelHtml +
          `</div>`
      const marker = new naver.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: p.title || p.id,
        icon: {
          content: iconContent,
          anchor: new naver.maps.Point(16, 32),
        },
      })
      naver.maps.Event.addListener(marker, "click", () => {
        onMarkerPress?.(p.id)
      })
      markersRef.current.push(marker)
    })
    // 내 위치 마커 (있으면)
    if (myLocation) {
      const myPos = new naver.maps.LatLng(myLocation.lat, myLocation.lng)
      bounds.extend(myPos)
      const my = new naver.maps.Marker({
        position: myPos,
        map: mapRef.current,
        icon: {
          content:
            `<div style="width:14px;height:14px;border-radius:999px;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 2px rgba(59,130,246,0.4);"></div>`,
          anchor: new naver.maps.Point(7, 7),
        },
      })
      markersRef.current.push(my)
    }
    // 자동 fitBounds 제거 — center/focus 가 항상 우선 (내 위치 / 카드 탭 기준)
  }, [points, ready, myLocation])

  // focus 변경 시 카메라 이동
  useEffect(() => {
    if (!ready || !mapRef.current || !focus) return
    const naver = (window as any).naver
    if (!naver?.maps) return
    try {
      mapRef.current.panTo(new naver.maps.LatLng(focus.lat, focus.lng))
      if (typeof focus.zoom === "number") mapRef.current.setZoom(focus.zoom)
    } catch { /* noop */ }
  }, [focus?.lat, focus?.lng, focus?.zoom, focus?.nonce, ready])

  if (error) {
    return (
      <View style={[styles.box, { height }]}>
        <Text style={styles.errText}>{error}</Text>
      </View>
    )
  }
  return (
    <View style={[styles.box, { height }]}>
      {/* @ts-ignore — RN web nativeID = HTML id */}
      <View ref={containerRef as any} nativeID="rn-points-map" style={{ flex: 1 }} />
    </View>
  )
}

function buildHtml(
  clientId: string,
  center: { lat: number; lng: number; zoom?: number },
  points: MapPoint[],
  my: { lat: number; lng: number } | null,
): string {
  const data = JSON.stringify(points).replace(/</g, "\\u003c")
  const myJs = my ? JSON.stringify(my) : "null"
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#f1f5f9}</style>
<script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&ncpClientId=${clientId}"></script>
</head><body><div id="map"></div>
<script>
(function(){
  function send(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)) } }
  if(!window.naver || !window.naver.maps){ send({type:'error',msg:'sdk'}); return }
  var naver = window.naver
  var pts = ${data}
  var my = ${myJs}
  var map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(${center.lat}, ${center.lng}),
    zoom: ${center.zoom ?? 14},
    zoomControl: true,
    zoomControlOptions: { position: naver.maps.Position.TOP_LEFT },
  })
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c] }) }
  var bounds = new naver.maps.LatLngBounds()
  pts.forEach(function(p){
    if (!isFinite(p.lat) || !isFinite(p.lng)) return
    var pos = new naver.maps.LatLng(p.lat, p.lng)
    bounds.extend(pos)
    var color = p.color || '#2563eb'
    var labelHtml = p.label
      ? '<div style="margin-top:2px;background:#fff;color:' + color + ';padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;border:1px solid ' + color + ';white-space:nowrap;">' + escapeHtml(p.label) + '</div>'
      : ''
    var icon = escapeHtml(p.icon || '📍')
    var marker = new naver.maps.Marker({
      position: pos, map: map, title: p.title || p.id,
      icon: {
        content:
          '<div style="display:flex;flex-direction:column;align-items:center;line-height:1;">' +
            '<div style="width:32px;height:32px;border-radius:999px;background:' + color + ';border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;">' + icon + '</div>' +
            labelHtml +
          '</div>',
        anchor: new naver.maps.Point(16, 32),
      }
    })
    naver.maps.Event.addListener(marker, 'click', function(){
      send({ type:'marker', id: p.id })
    })
  })
  if (my) {
    var myPos = new naver.maps.LatLng(my.lat, my.lng)
    bounds.extend(myPos)
    new naver.maps.Marker({
      position: myPos, map: map,
      icon: {
        content: '<div style="width:14px;height:14px;border-radius:999px;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 2px rgba(59,130,246,0.4);"></div>',
        anchor: new naver.maps.Point(7, 7),
      }
    })
  }
  if (pts.length >= 2) { try { map.fitBounds(bounds, {top:60,right:60,bottom:60,left:60}) } catch(e) {} }
})();
</script></body></html>`
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    overflow: "hidden",
  },
  errText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    padding: spacing[4],
    textAlign: "center",
  },
})
