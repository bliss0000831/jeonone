"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { MapPin, Navigation, X, Clock, Users, Baby, Accessibility, AlertCircle, Loader2 } from "lucide-react"
import { CHUNCHEON_TOILETS, Toilet, distanceKm } from "@/lib/constants/chuncheon-toilets"
import { loadNaverMapsScript } from "@/lib/integrations/naver-maps"
import { EditableIcon } from "@/components/editable-icon"
import { useLabel } from "@/components/site-labels-client"

type PermissionState = "idle" | "prompting" | "granted" | "denied" | "unsupported"

// 화장실 SVG 마커 (파란 배경 + 흰 화장실 픽토그램)
const TOILET_MARKER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="0.35"/>
    </filter>
  </defs>
  <path d="M19 0 C8.5 0 0 8.3 0 18.6 C0 32 19 46 19 46 C19 46 38 32 38 18.6 C38 8.3 29.5 0 19 0 Z"
    fill="#2563eb" filter="url(#s)"/>
  <circle cx="19" cy="18" r="13" fill="#ffffff"/>
  <g transform="translate(9,8)" fill="#2563eb">
    <circle cx="4.5" cy="2.2" r="1.8"/>
    <path d="M2.2 5 h4.6 v7 h-1.4 v6 h-1.8 v-6 h-1.4 z"/>
    <circle cx="15.5" cy="2.2" r="1.8"/>
    <path d="M12.6 12 l2.9 -7 l2.9 7 h-1.7 v6 h-2.4 v-6 z"/>
  </g>
</svg>
`.trim()

// 내 위치 마커 (파란 점, 흰 테두리)
const ME_MARKER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="10" fill="#ffffff"/>
  <circle cx="11" cy="11" r="7" fill="#2563eb"/>
</svg>
`.trim()

export function NearbyToilets() {
  // 슈퍼관리자가 편집 가능한 위젯 헤더 라벨
  const widgetTitle = useLabel("home.widget.toilets.title", "내 주변 화장실")
  const widgetSubtitle = useLabel("home.widget.toilets.subtitle", "반경 1km 이내 공공화장실")
  const [permission, setPermission] = useState<PermissionState>("idle")
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [locError, setLocError] = useState<string | null>(null)
  const [nearby, setNearby] = useState<(Toilet & { distance: number })[]>([])
  const [selected, setSelected] = useState<Toilet | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  // 위치 요청
  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setPermission("unsupported")
      return
    }
    setPermission("prompting")
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setPermission("granted")
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermission("denied")
        else {
          setPermission("denied")
          setLocError(err.message || "위치를 가져올 수 없습니다")
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  // 반경 1km 화장실 계산
  useEffect(() => {
    if (!myLoc) return
    const list = CHUNCHEON_TOILETS.map((t) => ({
      ...t,
      distance: distanceKm(myLoc.lat, myLoc.lng, t.lat, t.lng),
    }))
      .filter((t) => t.distance <= 1.0)
      .sort((a, b) => a.distance - b.distance)
    setNearby(list)
  }, [myLoc])

  // 지도 초기화 (네이버 지도)
  useEffect(() => {
    if (permission !== "granted" || !myLoc || !mapContainerRef.current) return
    let cancelled = false

    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
    if (!clientId) {
      setMapError("LOAD_FAIL")
      return
    }

    loadNaverMapsScript(clientId)
      .then(() => {
        if (cancelled || !mapContainerRef.current) return
        const naver = (window as any).naver
        if (!naver?.maps) {
          setMapError("LOAD_FAIL")
          return
        }

        // hot reload 대응: 기존 맵 destroy
        if (mapRef.current) {
          try { mapRef.current.destroy() } catch {}
          mapRef.current = null
        }

        const center = new naver.maps.LatLng(myLoc.lat, myLoc.lng)
        const map = new naver.maps.Map(mapContainerRef.current, {
          center,
          zoom: 15,
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.TOP_LEFT },
        })

        // 내 위치 마커
        new naver.maps.Marker({
          position: center,
          map,
          clickable: false,
          icon: {
            content: `<div style="transform:translate(-50%,-50%);">${ME_MARKER_SVG}</div>`,
            anchor: new naver.maps.Point(0, 0),
          },
          zIndex: 200,
        })

        // 1km 반경
        new naver.maps.Circle({
          map,
          center,
          radius: 1000,
          strokeColor: "#2563eb",
          strokeOpacity: 0.5,
          strokeWeight: 1,
          strokeStyle: "shortdash",
          fillColor: "#3b82f6",
          fillOpacity: 0.06,
        })

        mapRef.current = map
        setMapReady(true)
      })
      .catch((e) => {
        if (cancelled) return
        console.error("naver maps load failed", e)
        setMapError("LOAD_FAIL")
      })

    return () => {
      cancelled = true
      if (mapRef.current) {
        try { mapRef.current.destroy() } catch {}
        mapRef.current = null
      }
      markersRef.current = []
      setMapReady(false)
    }
  }, [permission, myLoc])

  // 화장실 마커 갱신
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const naver = (window as any).naver
    if (!naver?.maps) return

    // 기존 마커 제거
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    nearby.forEach((t) => {
      const pos = new naver.maps.LatLng(t.lat, t.lng)
      const marker = new naver.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: t.name,
        icon: {
          content: `<div style="transform:translate(-50%,-100%);">${TOILET_MARKER_SVG}</div>`,
          anchor: new naver.maps.Point(0, 0),
        },
      })
      naver.maps.Event.addListener(marker, "click", () => {
        setSelected(t)
        mapRef.current.panTo(pos)
      })
      markersRef.current.push(marker)
    })
  }, [nearby, mapReady])

  // 섹션 헤더
  const header = (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
        <EditableIcon
          iconKey="home.widget.toilets.icon"
          fallback={MapPin}
          tileClassName="w-8 sm:w-10 h-8 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 shadow-sm flex-shrink-0"
          iconClassName="w-4 sm:w-5 h-4 sm:h-5 text-white"
          imageClassName="w-12 sm:w-14 h-12 sm:h-14 flex-shrink-0"
        />
        <div className="min-w-0">
          <h2 className="text-sm sm:text-lg font-bold text-foreground whitespace-nowrap">
            {widgetTitle}
          </h2>
          <p className="text-xs text-muted-foreground whitespace-nowrap">
            {widgetSubtitle}
          </p>
        </div>
      </div>
      {permission === "granted" && (
        <span className="text-xs sm:text-sm font-medium text-primary whitespace-nowrap">
          {nearby.length}곳
        </span>
      )}
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4">
      {header}

      {/* 상태별 렌더 */}
      {permission === "idle" && (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/20 dark:to-sky-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/30">
          <MapPin className="w-12 h-12 text-blue-400 dark:text-blue-600 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            내 위치로 근처 화장실을 찾아드려요
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            위치 정보는 이 기기에서만 사용돼요
          </p>
          <button
            onClick={requestLocation}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            내 위치 가져오기
          </button>
        </div>
      )}

      {permission === "prompting" && (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-card rounded-2xl border border-border">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">위치를 확인하고 있어요…</p>
        </div>
      )}

      {permission === "denied" && (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/20 dark:to-red-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
          <AlertCircle className="w-12 h-12 text-rose-400 dark:text-rose-600 mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">
            위치 정보를 허용해야 근처 화장실을 찾을 수 있습니다
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {locError || "브라우저 설정에서 위치 권한을 허용한 뒤 다시 시도해주세요"}
          </p>
          <button
            onClick={requestLocation}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {permission === "unsupported" && (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-card rounded-2xl border border-border">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            이 브라우저는 위치 기능을 지원하지 않아요
          </p>
        </div>
      )}

      {permission === "granted" && (
        <div className="space-y-3">
          {/* 지도 영역 */}
          <div className="relative isolate rounded-2xl overflow-hidden border border-border shadow-sm bg-muted/40">
            {mapError ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
                <p className="text-sm text-muted-foreground">
                  지도 로드에 실패했어요. 네트워크를 확인해주세요.
                </p>
              </div>
            ) : (
              <div
                ref={mapContainerRef}
                className="w-full"
                style={{ height: "420px" }}
              />
            )}
          </div>

          {/* 리스트 (지도 아래 거리순) */}
          {nearby.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-card rounded-2xl border border-border">
              <MapPin className="w-10 h-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                반경 1km 이내에 등록된 공공화장실이 없어요
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {nearby.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="flex items-center gap-3 p-3 bg-card hover:bg-accent/40 rounded-xl border border-border transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(t.distance * 1000).toFixed(0)}m · {t.open24h ? "24시간" : t.openingHours || "운영시간 확인"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Sheet */}
      <BottomSheet toilet={selected} myLoc={myLoc} onClose={() => setSelected(null)} />
    </div>
  )
}

// ====== Bottom Sheet ======

function BottomSheet({
  toilet,
  myLoc,
  onClose,
}: {
  toilet: Toilet | null
  myLoc: { lat: number; lng: number } | null
  onClose: () => void
}) {
  // 열릴 때 스크롤 잠금
  useEffect(() => {
    if (!toilet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [toilet, onClose])

  const open = !!toilet

  // 길찾기: 카카오맵 앱/웹 연결 (우선 카카오, 실패 시 네이버 지도)
  const handleDirections = () => {
    if (!toilet) return
    const kakaoUrl = `https://map.kakao.com/link/to/${encodeURIComponent(toilet.name)},${toilet.lat},${toilet.lng}${
      myLoc ? `/from/내위치,${myLoc.lat},${myLoc.lng}` : ""
    }`
    window.open(kakaoUrl, "_blank", "noopener,noreferrer")
  }

  const handleDirectionsNaver = () => {
    if (!toilet) return
    const naverUrl = `https://map.naver.com/v5/directions/-/-/${toilet.lng},${toilet.lat},${encodeURIComponent(
      toilet.name,
    )}/-/walk?c=${toilet.lng},${toilet.lat},15,0,0,0,dh`
    window.open(naverUrl, "_blank", "noopener,noreferrer")
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-16 md:bottom-0 z-50 bg-card rounded-t-3xl shadow-2xl border-t border-border transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "80vh" }}
        role="dialog"
        aria-modal="true"
      >
        {/* Grabber */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1.5 rounded-full bg-border" />
        </div>

        {toilet && (
          <div className="px-5 pb-8 overflow-y-auto" style={{ maxHeight: "calc(80vh - 24px)" }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-foreground">{toilet.name}</h3>
                  {toilet.address && (
                    <p className="text-xs text-muted-foreground mt-0.5">{toilet.address}</p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-accent flex items-center justify-center flex-shrink-0"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 정보 그리드 */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <InfoTile
                icon={<Clock className="w-4 h-4" />}
                label="개방 시간"
                value={toilet.open24h ? "24시간" : toilet.openingHours || "확인 필요"}
                highlight={toilet.open24h}
              />
              <InfoTile
                icon={<Users className="w-4 h-4" />}
                label="남녀 구분"
                value={toilet.unisex ? "남녀공용" : "남녀분리"}
              />
              <InfoTile
                icon={<Baby className="w-4 h-4" />}
                label="기저귀 교환대"
                value={toilet.hasDiaperTable ? "있음" : "없음"}
                highlight={toilet.hasDiaperTable}
              />
              <InfoTile
                icon={<Accessibility className="w-4 h-4" />}
                label="장애인 화장실"
                value={toilet.hasDisabled ? "있음" : "없음"}
                highlight={toilet.hasDisabled}
              />
            </div>

            {/* 길찾기 버튼 */}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                onClick={handleDirections}
                className="flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Navigation className="w-4 h-4" />
                카카오맵 길찾기
              </button>
              <button
                onClick={handleDirectionsNaver}
                className="flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors"
              >
                <Navigation className="w-4 h-4" />
                네이버 지도
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function InfoTile({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`p-3 rounded-xl border ${
        highlight
          ? "bg-blue-500/10 border-blue-500/30"
          : "bg-muted/40 border-border"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`text-sm font-semibold ${highlight ? "text-blue-600 dark:text-blue-400" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  )
}
