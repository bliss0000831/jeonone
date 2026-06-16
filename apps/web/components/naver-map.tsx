"use client"

import { useEffect, useRef, useState } from "react"
import { Map as MapIcon, Satellite, ExternalLink } from "lucide-react"
import { loadNaverMapsScript, fallbackDongCentroid } from "@/lib/integrations/naver-maps"
import { distanceKm } from "@/lib/constants/chuncheon-dong-coords"

interface NaverMapProps {
  address: string
  /** 선택: 외부에서 이미 좌표를 아는 경우 geocoding 생략 */
  lat?: number
  lng?: number
  /** 지도 높이(px) */
  height?: number
}

declare global {
  interface Window {
    naver: any
  }
}


export function NaverMap({ address, lat: propLat, lng: propLng, height = 320 }: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [isSatellite, setIsSatellite] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    propLat != null && propLng != null ? { lat: propLat, lng: propLng } : null,
  )
  const [isApproximate, setIsApproximate] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      if (!clientId) {
        setError("지도를 불러올 수 없어요")
        return
      }

      // 1) 스크립트 먼저 로드 (SDK 내장 geocoder 사용하기 위해)
      try {
        await loadNaverMapsScript(clientId)
      } catch (e) {
        console.error("[NaverMap] script load failed", e)
        if (!cancelled) setError("지도를 불러오지 못했어요")
        return
      }
      if (cancelled || !window.naver?.maps) return

      // 2) 좌표 확보 — 부모가 준 값의 '건전성' 검사 → SDK geocoder → 서버 API → 동/면 centroid
      // (2-a) 부모 props 좌표 유효성 검증:
      //       주소에서 뽑은 동/면 centroid 와 10km 넘게 벌어져 있으면 과거에 잘못 저장된 값으로 간주.
      let latLng = coords
      const dongHint = fallbackDongCentroid(address)
      if (latLng && dongHint) {
        const d = distanceKm(latLng.lat, latLng.lng, dongHint.lat, dongHint.lng)
        if (d > 10) {
          console.warn(
            "[NaverMap] 저장된 좌표가 주소 동네와 너무 벌어져 있어 무시하고 재지오코딩합니다",
            { stored: latLng, dong: dongHint.dong, km: d.toFixed(1) },
          )
          latLng = null
        }
      }

      if (!latLng) {
        // 서버 REST API (다단계 재시도 포함)
        // SDK 내장 geocoder 는 NCP 의 geocode-js 엔드포인트가 401/CORS 를 자주 내서 제거.
        try {
          const res = await fetch(
            `/api/geocode/naver?address=${encodeURIComponent(address)}`,
          )
          if (res.ok) {
            const data = await res.json()
            if (typeof data.lat === "number" && typeof data.lng === "number") {
              latLng = { lat: data.lat, lng: data.lng }
              if (!cancelled) {
                setCoords(latLng)
                setIsApproximate(false)
              }
            }
          }
        } catch {}
      }
      if (!latLng && dongHint) {
        // 마지막: 동/면 centroid (정확 핀은 아니지만 올바른 동네)
        latLng = { lat: dongHint.lat, lng: dongHint.lng }
        if (!cancelled) {
          setCoords(latLng)
          setIsApproximate(true)
        }
      }
      if (!latLng) {
        if (!cancelled) setError("이 주소의 좌표를 찾지 못했습니다")
        return
      }

      if (cancelled || !mapRef.current || !window.naver?.maps) return

      // 3) 지도 생성
      const { naver } = window
      const center = new naver.maps.LatLng(latLng.lat, latLng.lng)

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setCenter(center)
      } else {
        const map = new naver.maps.Map(mapRef.current, {
          center,
          zoom: 16,
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.TOP_LEFT },
          scrollWheelZoom: false,
          mapTypeId: isSatellite
            ? naver.maps.MapTypeId.HYBRID
            : naver.maps.MapTypeId.NORMAL,
        })
        mapInstanceRef.current = map
      }

      // 마커
      if (markerRef.current) markerRef.current.setMap(null)
      markerRef.current = new naver.maps.Marker({
        position: center,
        map: mapInstanceRef.current,
        icon: {
          content: `
            <div style="
              transform: translate(-50%, -100%);
              display:flex;flex-direction:column;align-items:center;
            ">
              <div style="
                background:#e05c00;color:#fff;font-size:11px;font-weight:600;
                padding:4px 8px;border-radius:8px;white-space:nowrap;
                box-shadow:0 2px 6px rgba(0,0,0,0.25);margin-bottom:4px;
              ">${address.replace(/"/g, "&quot;")}</div>
              <div style="
                width:0;height:0;border-left:6px solid transparent;
                border-right:6px solid transparent;border-top:8px solid #e05c00;
              "></div>
            </div>
          `,
          anchor: new naver.maps.Point(0, 0),
        },
      })

      if (!cancelled) setIsLoaded(true)
    }

    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, clientId, retryKey])

  // 위성/일반 전환
  useEffect(() => {
    if (!mapInstanceRef.current || !window.naver?.maps) return
    mapInstanceRef.current.setMapTypeId(
      isSatellite
        ? window.naver.maps.MapTypeId.HYBRID
        : window.naver.maps.MapTypeId.NORMAL,
    )
  }, [isSatellite])

  const openNaverMap = () => {
    if (!coords) return
    // 네이버 지도 앱 / 웹 링크 — 모바일은 앱 딥링크, 데스크톱은 웹
    const url = `https://map.naver.com/v5/?c=${coords.lng},${coords.lat},16,0,0,0,dh`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border isolate"
      style={{ height }}
    >
      <div ref={mapRef} className="w-full h-full" />

      {/* 위성/일반 전환 */}
      <button
        type="button"
        onClick={() => setIsSatellite((v) => !v)}
        className="absolute top-3 right-3 z-[100] flex items-center gap-1.5 px-3 py-1.5 bg-card text-foreground text-xs font-medium rounded-lg shadow-md border border-border hover:bg-secondary transition-colors"
      >
        {isSatellite ? (
          <>
            <MapIcon className="w-3.5 h-3.5" />
            일반지도
          </>
        ) : (
          <>
            <Satellite className="w-3.5 h-3.5" />
            위성지도
          </>
        )}
      </button>

      {/* 큰 지도로 보기 */}
      <button
        type="button"
        onClick={openNaverMap}
        className="absolute bottom-3 right-3 z-[100] flex items-center gap-1 px-3 py-1.5 bg-card text-foreground text-xs font-medium rounded-lg shadow-md border border-border hover:bg-secondary transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        네이버지도에서 보기
      </button>

      {isApproximate && isLoaded && (
        <div className="absolute top-3 left-3 z-[100] px-3 py-1.5 bg-amber-500/90 text-white text-xs font-medium rounded-lg shadow-md">
          대략적 위치 (동·면 중심)
        </div>
      )}

      {!isLoaded && !error && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center z-[99]">
          <div className="text-sm text-muted-foreground animate-pulse">지도 불러오는 중...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-3 z-[99] p-4">
          <div className="text-sm text-muted-foreground text-center">{error}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setError(null); setIsLoaded(false); setRetryKey((k) => k + 1) }}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
            >
              다시 시도
            </button>
            {address && (
              <a
                href={`https://map.naver.com/p/search/${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg border border-border text-sm font-bold text-foreground"
              >
                네이버지도에서 보기
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
