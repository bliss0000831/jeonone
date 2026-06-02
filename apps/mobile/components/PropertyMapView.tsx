/**
 * PropertyMapView — 광장 web property-map-view.tsx 1:1 미러.
 *
 * - Web (Expo web): window.naver 직접 사용
 * - Native (Android/iOS APK): WebView 안에 Naver Maps HTML 임베드
 *   - 마커 클릭 시 postMessage 로 RN 측에 알림 → 상세 페이지 이동
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { WebView } from "react-native-webview"
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  hasNativeNaverMap,
  type NaverMapViewRef,
} from "@/lib/naver-map-loader"
import { Ionicons } from "@expo/vector-icons"
import { lightColors, fontSize, spacing, radius } from "@gwangjang/tokens"

const PLAZA_CENTER: Record<string, { lat: number; lng: number; zoom: number }> = {
  chuncheon: { lat: 37.881, lng: 127.730, zoom: 12 },
  gangneung: { lat: 37.751, lng: 128.876, zoom: 12 },
}
const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978, zoom: 11 }

// 거래 유형별 색 + 백엔드 marker-pin 라우트에 보낼 color key
const TRANSACTION_COLORS: Record<string, { bg: string; fg: string; key: string }> = {
  매매:   { bg: "#ef4444", fg: "#ffffff", key: "red" },
  전세:   { bg: "#1d4ed8", fg: "#ffffff", key: "blue" },
  월세:   { bg: "#15803d", fg: "#ffffff", key: "green" },
  단기:   { bg: "#6d28d9", fg: "#ffffff", key: "purple" },
  전월세: { bg: "#0e7490", fg: "#ffffff", key: "teal" },
}
const DEFAULT_COLOR = { bg: "#64748b", fg: "#ffffff", key: "gray" }

const GWANGJANG_API_BASE =
  process.env.EXPO_PUBLIC_GWANGJANG_API_BASE ?? "https://www.gwangjang.app"

interface MapProperty {
  id: string
  title: string
  price: number
  transaction_type: string
  property_type: string
  area: number | null
  address: string | null
  lat?: number | null
  lng?: number | null
  images?: string[] | null
  monthly_rent?: number | null
}

interface Props {
  properties: MapProperty[]
  plazaId?: string | null
  height?: number
  /** 외부에서 선택된 매물 id — 변경 시 해당 마커의 InfoWindow 열림 */
  selectedId?: string | null
}

const SCRIPT_ID = "naver-maps-sdk"
let scriptPromise: Promise<void> | null = null

function loadNaverMapsScript(clientId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if ((window as any).naver?.maps) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("네이버 지도 스크립트 로드 실패")))
      return
    }
    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.async = true
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&ncpClientId=${clientId}`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("네이버 지도 스크립트 로드 실패"))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function PropertyMapView({ properties, plazaId, height = 500, selectedId }: Props) {
  if (Platform.OS === "web") {
    return <PropertyMapViewWeb properties={properties} plazaId={plazaId} height={height} selectedId={selectedId} />
  }
  return <PropertyMapViewNative properties={properties} plazaId={plazaId} height={height} selectedId={selectedId} />
}

// ─────────────────────────────────────────────────────────────────────────
// Native (Android/iOS) — @mj-studio/react-native-naver-map (네이티브 SDK)
// ─────────────────────────────────────────────────────────────────────────
function PropertyMapViewNative({ properties, plazaId, height, selectedId }: Props) {
  const router = useRouter()
  const mapRef = useRef<NaverMapViewRef>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const mapped = useMemo(
    () => properties.filter((p) => p.lat != null && p.lng != null),
    [properties],
  )

  const center = (plazaId && PLAZA_CENTER[plazaId]) || FALLBACK_CENTER

  useEffect(() => {
    const id = requestAnimationFrame(() => setMapReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const p = mapped.find((x) => x.id === selectedId)
    if (!p || p.lat == null || p.lng == null) return
    setActiveId(selectedId)
    try {
      mapRef.current?.animateCameraTo({
        latitude: Number(p.lat) + 0.003,
        longitude: Number(p.lng),
        zoom: 15,
      })
    } catch {
      /* SDK 메서드 시그니처 다른 경우 무시 */
    }
  }, [selectedId, mapped])

  const active = activeId ? mapped.find((p) => p.id === activeId) : null

  const tally = useMemo(() => {
    const t: Record<string, number> = {}
    mapped.forEach((p) => {
      t[p.transaction_type] = (t[p.transaction_type] || 0) + 1
    })
    return t
  }, [mapped])
  const legendEntries = Object.entries(tally).filter(([, n]) => n > 0)

  if (!hasNativeNaverMap || !NaverMapView) {
    return (
      <View style={[styles.container, { height, alignItems: "center", justifyContent: "center" }]}>
        <Text style={styles.errorTitle}>지도 모듈을 불러올 수 없어요</Text>
        <Text style={styles.errorText}>앱을 최신 빌드로 업데이트해주세요.</Text>
      </View>
    )
  }

  if (!mapReady) {
    return (
      <View style={[styles.container, { height, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { height }]}>
      <NaverMapView
        ref={mapRef as any}
        style={{ flex: 1 }}
        initialCamera={{
          latitude: center.lat,
          longitude: center.lng,
          zoom: center.zoom,
        }}
        isShowZoomControls={false}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
        onTapMap={() => setActiveId(null)}
      >
        {mapped.map((p) => {
          const color =
            TRANSACTION_COLORS[p.transaction_type] || DEFAULT_COLOR
          const captionText = `${p.transaction_type} ${formatPrice(p)}`
          // 🅲 마커 — 진입 즉시 렌더링 (네트워크 fetch 0).
          //   기본: 네이티브 NaverMap 기본 핀 + caption (tintColor 색상 분리).
          //   백엔드 PNG (/api/marker-pin) 는 cold-start + 폰트 fetch 로 느려서 임시 제거.
          //   되돌리려면 USE_BACKEND_PNG_MARKER=true 로 토글 (아래 분기 다시 활성).
          const USE_BACKEND_PNG_MARKER = true
          if (USE_BACKEND_PNG_MARKER) {
            const pinUrl = `${GWANGJANG_API_BASE}/api/marker-pin?label=${encodeURIComponent(captionText)}&color=${color.key}&scale=3&v=2`
            const charW = (c: string) => (/[가-힣]/.test(c) ? 11 : 7)
            const textW = Array.from(captionText).reduce((a, c) => a + charW(c), 0)
            const pillW = Math.max(56, Math.ceil(textW + 14 * 2))
            const totalW = pillW + 8
            const totalH = 30 + 10 + 6
            return (
              <NaverMapMarkerOverlay
                key={p.id}
                latitude={Number(p.lat)}
                longitude={Number(p.lng)}
                image={{ httpUri: pinUrl }}
                width={totalW}
                height={totalH}
                anchor={{ x: 0.5, y: 1 }}
                onTap={() => {
                  setActiveId(p.id)
                  try {
                    mapRef.current?.animateCameraTo({
                      latitude: Number(p.lat) + 0.003,
                      longitude: Number(p.lng),
                      zoom: 15,
                    })
                  } catch {}
                }}
              />
            )
          }
          return (
            <NaverMapMarkerOverlay
              key={p.id}
              latitude={Number(p.lat)}
              longitude={Number(p.lng)}
              tintColor={color.bg}
              caption={{
                text: captionText,
                color: "#ffffff",
                haloColor: color.bg,
                textSize: 13,
              }}
              onTap={() => {
                setActiveId(p.id)
                try {
                  mapRef.current?.animateCameraTo({
                    latitude: Number(p.lat) + 0.003,
                    longitude: Number(p.lng),
                    zoom: 15,
                  })
                } catch {}
              }}
            />
          )
        })}
      </NaverMapView>

      {/* 범례 — 좌하단 거래 유형별 카운트 (웹 1:1) */}
      {legendEntries.length > 0 && (
        <View style={styles.nativeLegend}>
          {legendEntries.map(([type, count], i) => {
            const c = TRANSACTION_COLORS[type] || DEFAULT_COLOR
            return (
              <View key={type} style={styles.nativeLegendItem}>
                {i > 0 && <Text style={styles.nativeLegendDot}> · </Text>}
                <View style={[styles.nativeLegendDotColor, { backgroundColor: c.bg }]} />
                <Text style={styles.nativeLegendText}>
                  {type} {count}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {/* 마커 탭 시 떠오르는 카드 — 웹의 InfoWindow 와 동일한 UX */}
      {active && (
        <Pressable
          style={styles.nativeInfoCard}
          onPress={() => router.push(`/property/${active.id}` as any)}
        >
          <Pressable
            style={styles.nativeInfoClose}
            onPress={() => setActiveId(null)}
            hitSlop={8}
          >
            <Ionicons name="close" size={14} color="#ffffff" />
          </Pressable>
          {active.images?.[0] ? (
            <Image
              source={{ uri: active.images[0] }}
              style={styles.nativeInfoImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.nativeInfoImg, styles.nativeInfoImgEmpty]}>
              <Text style={{ fontSize: 12, color: lightColors.ink500 }}>
                이미지 없음
              </Text>
            </View>
          )}
          <View style={styles.nativeInfoBody}>
            <View
              style={[
                styles.nativeInfoBadge,
                {
                  backgroundColor:
                    (TRANSACTION_COLORS[active.transaction_type] || DEFAULT_COLOR).bg,
                },
              ]}
            >
              <Text style={styles.nativeInfoBadgeText}>
                {active.transaction_type}
              </Text>
            </View>
            <Text
              style={[
                styles.nativeInfoPrice,
                {
                  color:
                    (TRANSACTION_COLORS[active.transaction_type] || DEFAULT_COLOR).bg,
                },
              ]}
            >
              {formatPrice(active)}
            </Text>
            <Text style={styles.nativeInfoTitle} numberOfLines={2}>
              {active.title}
            </Text>
            {active.address ? (
              <View style={styles.nativeInfoAddr}>
                <Ionicons
                  name="location-outline"
                  size={11}
                  color={lightColors.ink500}
                />
                <Text
                  style={styles.nativeInfoAddrText}
                  numberOfLines={2}
                >
                  {active.address}
                </Text>
              </View>
            ) : null}
            <View style={styles.nativeInfoCta}>
              <Text style={styles.nativeInfoCtaText}>상세 보기</Text>
              <Ionicons name="arrow-forward" size={12} color={lightColors.primary} />
            </View>
          </View>
        </Pressable>
      )}
    </View>
  )
}

function buildMapHtml(
  clientId: string,
  center: { lat: number; lng: number; zoom: number },
  props: Array<{
    id: string
    title: string
    transaction_type: string
    price: number
    address: string | null
    lat: number
    lng: number
    image: string | null
    _label: string
    _color: { bg: string; fg: string }
  }>,
  tally: Record<string, number>,
): string {
  const data = JSON.stringify(props).replace(/</g, "\\u003c")
  // 거래 유형별 색상 (web 1:1)
  const TYPE_COLORS: Record<string, string> = {
    매매: "#dc2626",
    전세: "#2563eb",
    월세: "#16a34a",
    단기: "#7c3aed",
    전월세: "#0891b2",
  }
  const legendItems = Object.entries(tally)
    .map(
      ([type, count]) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#1f2937;font-weight:600;">
          <span style="width:8px;height:8px;border-radius:999px;background:${TYPE_COLORS[type] || "#64748b"};"></span>
          ${type} ${count}
        </span>`,
    )
    .join('<span style="color:#9ca3af;margin:0 4px;">·</span>')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#f1f5f9}
  .legend{position:absolute;left:12px;bottom:12px;z-index:10;background:rgba(255,255,255,0.95);border-radius:999px;padding:6px 12px;box-shadow:0 2px 6px rgba(0,0,0,0.15);display:flex;align-items:center;}
  .iw-card{background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.18);overflow:hidden;width:240px;}
  .iw-img{width:100%;height:140px;object-fit:cover;display:block;background:#e5e7eb;}
  .iw-badge{display:inline-block;padding:3px 8px;border-radius:6px;color:#fff;font-size:10px;font-weight:700;margin-bottom:6px;}
  .iw-body{padding:10px 12px 12px;}
  .iw-price{font-size:16px;font-weight:800;margin:0 0 6px;}
  .iw-title{font-size:12px;color:#374151;line-height:1.35;margin:0 0 6px;}
  .iw-addr{font-size:11px;color:#6b7280;display:flex;align-items:center;gap:3px;margin:0 0 8px;}
  .iw-link{color:#2563eb;font-size:12px;font-weight:600;text-decoration:none;display:inline-block;padding-top:6px;border-top:1px solid #f3f4f6;}
</style>
<script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&ncpClientId=${clientId}"></script>
</head><body>
<div id="map"></div>
${legendItems ? `<div class="legend">${legendItems}</div>` : ""}
<script>
(function(){
  function send(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)) } }
  window.navermap_authFailure = function(){ send({type:'error', msg:'auth'}) }
  if(!window.naver || !window.naver.maps){ send({type:'error', msg:'sdk'}); return }
  var naver = window.naver
  var props = ${data}
  var map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(${center.lat}, ${center.lng}),
    zoom: ${center.zoom},
    zoomControl: true,
    zoomControlOptions: { position: naver.maps.Position.TOP_LEFT },
  })
  var bounds = new naver.maps.LatLngBounds()
  var infoWin = new naver.maps.InfoWindow({ borderWidth:0, backgroundColor:'transparent', disableAnchor:true, pixelOffset: new naver.maps.Point(0,-12) })
  var markerMap = {}
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c] }) }
  props.forEach(function(p){
    var pos = new naver.maps.LatLng(p.lat, p.lng)
    bounds.extend(pos)
    var marker = new naver.maps.Marker({
      position: pos, map: map, title: p.title,
      icon: {
        // web 1:1 — 흰 테두리 단색 pill + 아래 화살표 (이중 화살표: 흰 외곽 + 색 내부)
        content:
          '<div style="position:relative;display:inline-block;line-height:1;">' +
            '<div style="background:'+p._color.bg+';color:#fff;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid #fff;">' + escapeHtml(p.transaction_type) + ' ' + escapeHtml(p._label) + '</div>' +
            '<div style="position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #fff;"></div>' +
            '<div style="position:absolute;left:50%;bottom:-3px;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid '+p._color.bg+';"></div>' +
          '</div>',
        anchor: new naver.maps.Point(40, 34),
      }
    })
    function openInfo(){
      var html =
        '<div class="iw-card">' +
          (p.image ? '<img class="iw-img" src="'+escapeHtml(p.image)+'" />' : '<div class="iw-img" style="display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px;">이미지 없음</div>') +
          '<div class="iw-body">' +
            '<span class="iw-badge" style="background:'+p._color.bg+';">'+escapeHtml(p.transaction_type)+'</span>' +
            '<div class="iw-price" style="color:'+p._color.bg+';">'+escapeHtml(p._label)+'</div>' +
            '<div class="iw-title">'+escapeHtml(p.title)+'</div>' +
            (p.address ? '<div class="iw-addr">📍 '+escapeHtml(p.address)+'</div>' : '') +
            '<a class="iw-link" href="javascript:void(0)" onclick="window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:\\'marker\\',id:\\''+p.id+'\\'}))">상세 보기 →</a>' +
          '</div>' +
        '</div>'
      infoWin.setContent(html)
      infoWin.open(map, marker)
      // InfoWindow 가 DOM 에 그려진 후 panTo 실행 — 첫 클릭에서 map.getSize() 가
      // 0 이거나 projection 이 idle 안 된 상태로 계산이 어긋나던 문제 해결.
      // requestAnimationFrame 2회로 다음 레이아웃 사이클 보장.
      function doPan(){
        try {
          var proj = map.getProjection()
          var size = map.getSize()
          var mapH = (size && size.height && size.height > 100) ? size.height : 420
          var INFO_H = 335, TOP_SAFE = 36, PIXEL_OFFSET = 12, BOTTOM_SAFE = 16
          var minMarkerY = TOP_SAFE + PIXEL_OFFSET + INFO_H
          var maxMarkerY = mapH - BOTTOM_SAFE
          var targetMarkerY = Math.max(Math.min(minMarkerY, maxMarkerY), mapH * 0.75)
          var offset = targetMarkerY - mapH / 2
          var mp = proj.fromCoordToOffset(marker.getPosition())
          var newCenterPx = new naver.maps.Point(mp.x, mp.y - offset)
          var newCenter = proj.fromOffsetToCoord(newCenterPx)
          map.panTo(newCenter, { duration: 350, easing: 'easeOutCubic' })
        } catch (e) {}
      }
      requestAnimationFrame(function(){
        requestAnimationFrame(doPan)
      })
    }
    naver.maps.Event.addListener(marker, 'click', openInfo)
    markerMap[p.id] = { marker: marker, open: openInfo }
  })
  // 외부 (RN) 에서 호출 — 카드 클릭 시 해당 마커 InfoWindow 열기
  window.__selectMarker = function(id){
    var entry = markerMap[id]
    if (entry && entry.open) { entry.open() }
  }
  if(props.length >= 3){ try{ map.fitBounds(bounds, {top:80,right:80,bottom:80,left:80}) }catch(e){} }
})();
</script></body></html>`
}

// expo web 전용 구현 (react-native-web 으로 컴파일 시 div 렌더링)
function PropertyMapViewWeb({ properties, plazaId, height, selectedId }: Props) {
  const containerRef = useRef<View>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const infoWindowRef = useRef<any>(null)
  const markerClickHandlersRef = useRef<Map<string, () => void>>(new Map())
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mapped = useMemo(
    () => properties.filter((p) => p.lat != null && p.lng != null),
    [properties],
  )
  const skipped = properties.length - mapped.length

  useEffect(() => {
    let cancelled = false
    const w = window as any
    const clientId =
      process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID ||
      process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ||
      ""
    if (!clientId) {
      setError("네이버 지도 키가 설정되지 않았습니다.")
      return
    }

    w.navermap_authFailure = function () {
      setError("네이버 지도 인증 실패 — 도메인 화이트리스트 미등록")
    }

    loadNaverMapsScript(clientId)
      .then(() => {
        if (cancelled) return
        const naver = w.naver
        if (!naver?.maps) {
          setError("지도 SDK 로드 실패")
          return
        }
        // RN View 의 DOM 노드 찾기
        const node: HTMLElement | null = (containerRef.current as any)?._nativeTag
          ? null
          : ((containerRef.current as unknown) as HTMLElement)
        const el = node || (document.getElementById("rn-map-container") as HTMLElement | null)
        if (!el) {
          setError("지도 컨테이너 미발견")
          return
        }
        const center = (plazaId ? PLAZA_CENTER[plazaId] : undefined) ?? FALLBACK_CENTER
        const map = new naver.maps.Map(el, {
          center: new naver.maps.LatLng(center.lat, center.lng),
          zoom: center.zoom,
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.TOP_LEFT },
        })
        mapRef.current = map
        infoWindowRef.current = new naver.maps.InfoWindow({
          borderWidth: 0,
          backgroundColor: "transparent",
          disableAnchor: true,
          pixelOffset: new naver.maps.Point(0, -10),
        })
        setReady(true)
      })
      .catch((e) => {
        if (cancelled) return
        console.error("naver maps load failed", e)
        setError("지도 로드 실패")
      })

    return () => {
      cancelled = true
      markersRef.current.forEach((m) => {
        try { m.setMap(null) } catch {}
      })
      markersRef.current.clear()
      if (infoWindowRef.current) {
        try { infoWindowRef.current.close() } catch {}
        infoWindowRef.current = null
      }
      if (mapRef.current) {
        try { mapRef.current.destroy() } catch {}
        mapRef.current = null
      }
      setReady(false)
    }
  }, [plazaId])

  // 마커 갱신
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const naver = (window as any).naver
    if (!naver?.maps) return

    markersRef.current.forEach((m) => { try { m.setMap(null) } catch {} })
    markersRef.current.clear()

    if (mapped.length === 0) return

    const bounds = new naver.maps.LatLngBounds()
    mapped.forEach((p) => {
      const lat = Number(p.lat)
      const lng = Number(p.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      const pos = new naver.maps.LatLng(lat, lng)
      bounds.extend(pos)

      const colors = TRANSACTION_COLORS[p.transaction_type] || DEFAULT_COLOR
      const marker = new naver.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: p.title,
        icon: {
          // web 1:1 — 흰 테두리 단색 pill + 아래 화살표 (location pin)
          content:
            `<div style="position:relative;display:inline-block;line-height:1;">` +
              `<div style="background:${colors.bg};color:#fff;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid #fff;">${p.transaction_type} ${formatPrice(p)}</div>` +
              `<div style="position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #fff;"></div>` +
              `<div style="position:absolute;left:50%;bottom:-3px;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${colors.bg};"></div>` +
            `</div>`,
          anchor: new naver.maps.Point(40, 34),
        },
      })

      const openInfo = () => {
        if (!infoWindowRef.current) return
        const img = (p as any).images?.[0] || null
        const escape = (s: any) =>
          String(s ?? "").replace(/[&<>"']/g, (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c),
          )
        infoWindowRef.current.setContent(
          `<div style="background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.18);overflow:hidden;width:240px;">` +
            (img
              ? `<img src="${escape(img)}" style="width:100%;height:140px;object-fit:cover;display:block;background:#e5e7eb;" />`
              : `<div style="width:100%;height:140px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px;background:#e5e7eb;">이미지 없음</div>`) +
            `<div style="padding:10px 12px 12px;">` +
              `<span style="display:inline-block;padding:3px 8px;border-radius:6px;color:#fff;font-size:10px;font-weight:700;margin-bottom:6px;background:${colors.bg};">${escape(p.transaction_type)}</span>` +
              `<div style="font-size:16px;font-weight:800;margin:0 0 6px;color:${colors.bg};">${escape(formatPrice(p))}</div>` +
              `<div style="font-size:12px;color:#374151;line-height:1.35;margin:0 0 6px;">${escape(p.title)}</div>` +
              (p.address
                ? `<div style="font-size:11px;color:#6b7280;display:flex;align-items:center;gap:3px;margin:0 0 8px;">📍 ${escape(p.address)}</div>`
                : "") +
              `<a href="/property/${escape(p.id)}" style="color:#2563eb;font-size:12px;font-weight:600;text-decoration:none;display:inline-block;padding-top:6px;border-top:1px solid #f3f4f6;">상세 보기 →</a>` +
            `</div>` +
          `</div>`,
        )
        infoWindowRef.current.open(mapRef.current, marker)
      }

      naver.maps.Event.addListener(marker, "click", openInfo)
      markersRef.current.set(p.id, marker)
      markerClickHandlersRef.current.set(p.id, openInfo)
    })

    if (mapped.length >= 3) {
      try { mapRef.current.fitBounds(bounds, { padding: 80 }) } catch {}
    }
  }, [ready, mapped])

  // 외부 selectedId 변경 → 해당 마커의 InfoWindow 열기 + 지도 센터 이동
  // InfoWindow 가 마커 위쪽에 뜨므로 마커를 화면 아래쪽 1/3 지점에 두기 위해
  // 새 센터 = 마커보다 위쪽 (= 위도 +) 으로 ~120px 만큼 보정
  useEffect(() => {
    if (!ready || !selectedId) return
    const marker = markersRef.current.get(selectedId)
    const handler = markerClickHandlersRef.current.get(selectedId)
    if (!marker || !handler) return
    handler()
    try {
      const naver = (window as any).naver
      const map = mapRef.current
      const proj = map?.getProjection?.()
      if (proj && naver?.maps?.Point) {
        const markerPixel = proj.fromCoordToOffset(marker.getPosition())
        const mapSize = map?.getSize?.() // { width, height }
        const mapHeight = mapSize?.height ?? 420
        const viewportCenterY = mapHeight / 2
        // InfoWindow 실측 — 이미지 140 + body ~170 + box-shadow ~25 = ≈ 335
        const INFO_HEIGHT = 335
        const PIXEL_OFFSET_Y = 12
        const TOP_SAFE = 36 // 그림자 고려 + 여유
        const BOTTOM_SAFE = 16
        // InfoWindow top >= TOP_SAFE 보장
        const minMarkerY = TOP_SAFE + PIXEL_OFFSET_Y + INFO_HEIGHT
        const maxMarkerY = mapHeight - BOTTOM_SAFE
        // 컨테이너가 너무 작으면 maxMarkerY 로 클램프
        const targetMarkerY = Math.max(
          Math.min(minMarkerY, maxMarkerY),
          mapHeight * 0.75,
        )
        const offset = targetMarkerY - viewportCenterY
        const newCenterPixel = new naver.maps.Point(
          markerPixel.x,
          markerPixel.y - offset,
        )
        const newCenterLatLng = proj.fromOffsetToCoord(newCenterPixel)
        map.panTo(newCenterLatLng, { duration: 350, easing: "easeOutCubic" })
      } else {
        map?.panTo(marker.getPosition())
      }
    } catch {}
  }, [selectedId, ready])

  if (error) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>지도 표시 실패</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    )
  }

  // 거래유형별 카운트 — 좌측 하단 범례
  const tally = useMemo(() => {
    const t: Record<string, number> = {}
    mapped.forEach((p) => {
      t[p.transaction_type] = (t[p.transaction_type] || 0) + 1
    })
    return t
  }, [mapped])
  const tallyEntries = Object.entries(tally)

  return (
    <View style={[styles.container, { height }]}>
      {/* @ts-ignore — RN web 에서 native id prop 으로 div id 설정 */}
      <View ref={containerRef as any} nativeID="rn-map-container" style={{ flex: 1, width: "100%", height: "100%" }} />
      {!ready && (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>지도 로드 중...</Text>
        </View>
      )}
      {/* 좌측 하단 범례 — 매매 2 · 월세 3 */}
      {tallyEntries.length > 0 && ready && (
        <View style={styles.legendBox}>
          {tallyEntries.map(([type, count], i) => {
            const c = TRANSACTION_COLORS[type] || DEFAULT_COLOR
            return (
              <View
                key={type}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                {i > 0 && <Text style={styles.legendDot}>·</Text>}
                <View style={[styles.legendDotMark, { backgroundColor: c.bg }]} />
                <Text style={styles.legendText}>
                  {type} {count}
                </Text>
              </View>
            )
          })}
        </View>
      )}
      {skipped > 0 && (
        <View style={styles.skippedBox}>
          <Text style={styles.skippedText}>좌표 없는 매물 {skipped}개 제외</Text>
        </View>
      )}
    </View>
  )
}

function formatPrice(p: MapProperty): string {
  if (p.transaction_type === "월세") {
    // price = 보증금, monthly_rent = 월세 (웹과 동일)
    const deposit = p.price ?? 0
    const rent = p.monthly_rent ?? 0
    return `${deposit.toLocaleString()}/${rent.toLocaleString()}만원`
  }
  const v = p.price ?? 0
  if (v >= 10000) {
    const eok = Math.floor(v / 10000)
    const man = v % 10000
    return man === 0 ? `${eok}억` : `${eok}억 ${man.toLocaleString()}`
  }
  return `${v.toLocaleString()}만원`
}

// XML/HTML 특수문자 이스케이프
function esc(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      } as any
    )[c] || c,
  )
}

// base64 인코딩 (RN btoa 호환)
function toBase64(str: string): string {
  if (typeof btoa === "function") {
    try {
      return btoa(unescape(encodeURIComponent(str)))
    } catch {}
  }
  // RN polyfill 없을 경우 — 안전 fallback (대부분 환경에선 btoa 존재)
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const bytes: number[] = []
  const utf8 = unescape(encodeURIComponent(str))
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i))
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i],
      b2 = bytes[i + 1] || 0,
      b3 = bytes[i + 2] || 0
    out +=
      chars[b1 >> 2] +
      chars[((b1 & 3) << 4) | (b2 >> 4)] +
      (i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : "=") +
      (i + 2 < bytes.length ? chars[b3 & 63] : "=")
  }
  return out
}

/**
 * 알약형 핀 SVG 생성기 — 가격/거래유형 라벨 + 흰 외곽선 + 아래 화살표.
 * 결과: { uri, width, height } — NaverMapMarkerOverlay 의 image/width/height 에 그대로.
 */
function makePillPin(
  label: string,
  bg: string,
  fg: string,
): { uri: string; width: number; height: number } {
  // 한글 = 약 11px, 영문/숫자 = 약 7px (font 13 기준 휴리스틱)
  const charWidth = (ch: string) => (/[가-힣]/.test(ch) ? 11 : 7)
  const textW = Array.from(label).reduce((acc, c) => acc + charWidth(c), 0)
  const padX = 12
  const w = Math.max(64, Math.ceil(textW + padX * 2))
  const pillH = 30
  const arrowH = 8
  const h = pillH + arrowH
  const stroke = 2
  const r = pillH / 2
  const arrowMid = w / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect x="${stroke / 2}" y="${stroke / 2}" width="${w - stroke}" height="${pillH - stroke}" rx="${r - stroke / 2}" ry="${r - stroke / 2}" fill="${bg}" stroke="#ffffff" stroke-width="${stroke}"/>
<polygon points="${arrowMid - 6},${pillH - 1} ${arrowMid + 6},${pillH - 1} ${arrowMid},${h - 1}" fill="${bg}" stroke="#ffffff" stroke-width="${stroke}" stroke-linejoin="round"/>
<polygon points="${arrowMid - 5},${pillH} ${arrowMid + 5},${pillH} ${arrowMid},${h - 3}" fill="${bg}"/>
<text x="${w / 2}" y="${pillH / 2 + 5}" font-family="-apple-system, Roboto, Arial, sans-serif" font-size="13" font-weight="700" fill="${fg}" text-anchor="middle">${esc(label)}</text>
</svg>`
  return {
    uri: `data:image/svg+xml;base64,${toBase64(svg)}`,
    width: w,
    height: h,
  }
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  // 좌하단 범례 — 거래 유형별 카운트 (웹 1:1)
  nativeLegend: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  nativeLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  nativeLegendDot: {
    fontSize: 12,
    color: lightColors.ink500,
    marginHorizontal: 2,
  },
  nativeLegendDotColor: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  nativeLegendText: {
    fontSize: 12,
    fontWeight: "600",
    color: lightColors.ink900,
  },
  // 네이티브 NaverMap 위 InfoWindow 카드 — 가로 중앙 배치
  nativeInfoCard: {
    position: "absolute",
    top: 16,
    left: "50%",
    marginLeft: -120, // width 240 / 2
    width: 240,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  nativeInfoClose: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  nativeInfoImg: {
    width: "100%",
    height: 110,
    backgroundColor: lightColors.muted,
  },
  nativeInfoImgEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  nativeInfoBody: {
    padding: 10,
    gap: 2,
  },
  nativeInfoBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  nativeInfoBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  nativeInfoPrice: {
    fontSize: 16,
    fontWeight: "800",
  },
  nativeInfoTitle: {
    fontSize: 12,
    color: lightColors.ink900,
    fontWeight: "600",
    marginTop: 2,
  },
  nativeInfoAddr: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 3,
    marginTop: 4,
  },
  nativeInfoAddrText: {
    flex: 1,
    fontSize: 11,
    color: lightColors.ink500,
  },
  nativeInfoCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightColors.border,
  },
  nativeInfoCtaText: {
    fontSize: 11,
    fontWeight: "700",
    color: lightColors.primary,
  },
  errorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[4],
  },
  errorTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: lightColors.ink900,
    marginBottom: 8,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
    textAlign: "center",
  },
  loadingBox: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: lightColors.ink500,
  },
  skippedBox: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  skippedText: {
    fontSize: 11,
    color: "#ffffff",
    fontWeight: "500",
  },
  // 좌측 하단 범례 (매매 N · 월세 N)
  legendBox: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  legendDotMark: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1f2937",
  },
  legendDot: {
    fontSize: 11,
    color: "#9ca3af",
    marginHorizontal: 2,
  },
})
