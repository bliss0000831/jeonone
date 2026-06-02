"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Fuel,
  Loader2,
  AlertCircle,
  MapPin,
  Trophy,
  Navigation,
} from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { loadNaverMapsScript } from "@/lib/integrations/naver-maps"
import { OIL_PRODUCT_LABELS } from "@/lib/integrations/opinet-constants"
import { cn } from "@/lib/utils"

type Product = "gasoline" | "diesel" | "premium" | "lpg"

interface Station {
  uniId: string
  osNm: string
  poll: string
  brand: string
  price: number
  distance?: number
  lat: number
  lng: number
  newAddr?: string
}

const PRODUCTS: Product[] = ["gasoline", "diesel", "premium", "lpg"]

// ── 브랜드별 마커 색상 (SKE/GSC/HDO/SOL/RTE/etc.) ─────────────────
const BRAND_STYLE: Record<string, { bg: string; label: string }> = {
  SKE: { bg: "#e60012", label: "SK" }, // SK에너지 - red
  GSC: { bg: "#00805e", label: "GS" }, // GS칼텍스 - dark green
  HDO: { bg: "#00a4d8", label: "현대" }, // 현대오일뱅크 - cyan
  SOL: { bg: "#ffb300", label: "S-OIL" }, // S-OIL - yellow
  RTE: { bg: "#1e3a8a", label: "알뜰" }, // 자영알뜰 - navy
  RTX: { bg: "#1e3a8a", label: "고속알뜰" },
  NHO: { bg: "#1e3a8a", label: "NH알뜰" },
  E1G: { bg: "#7b1fa2", label: "E1" },
  SKG: { bg: "#e60012", label: "SK가스" },
  ETC: { bg: "#374151", label: "기타" },
}

function brandStyle(poll: string) {
  return BRAND_STYLE[poll] || BRAND_STYLE.ETC
}

function priceMarkerHtml(poll: string, price: number, isMin: boolean) {
  const { bg, label } = brandStyle(poll)
  const won = price.toLocaleString()
  const ring = isMin
    ? "outline:2px solid #dc2626;outline-offset:1px;"
    : ""
  return `
<div style="transform:translate(-50%,-100%);display:flex;align-items:stretch;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.25);${ring}">
  <div style="background:${bg};color:white;padding:3px 6px;font-size:10px;font-weight:800;display:flex;align-items:center;white-space:nowrap;">${label}</div>
  <div style="background:#ffffff;color:#111827;padding:3px 7px;font-size:11px;font-weight:700;white-space:nowrap;border:1px solid rgba(0,0,0,0.06);border-left:0;">${won}원</div>
</div>`
}

const ME_MARKER_HTML = `
<div style="transform:translate(-50%,-50%);">
  <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="10" fill="#ffffff"/>
    <circle cx="11" cy="11" r="7" fill="#2563eb"/>
  </svg>
</div>`

export default function GasStationsPage() {
  const [product, setProduct] = useState<Product>("gasoline")

  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [permission, setPermission] = useState<
    "idle" | "prompting" | "granted" | "denied" | "unsupported"
  >("idle")
  const [locError, setLocError] = useState<string | null>(null)
  const [radius, setRadius] = useState(3000)

  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mocked, setMocked] = useState(false)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const meMarkerRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── 위치 요청 ─────────────────────────────────────────────
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
        setPermission("denied")
        setLocError(err.message)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  // ── 데이터 로드 ───────────────────────────────────────────
  const loadStations = useCallback(async () => {
    if (!myLoc) {
      setStations([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const url = `/api/gas-stations?mode=nearby&lat=${myLoc.lat}&lng=${myLoc.lng}&radius=${radius}&product=${product}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || "조회 실패")
        setStations([])
      } else {
        setStations(data.stations || [])
        setMocked(!!data.mocked)
      }
    } catch (e: any) {
      setError(e?.message || "조회 실패")
    } finally {
      setLoading(false)
    }
  }, [myLoc, product, radius])

  useEffect(() => {
    if (permission !== "granted") return
    loadStations()
  }, [myLoc, product, radius, permission, loadStations])

  // ── 가격 정렬 + 순위 ───────────────────────────────────────
  const ranked = useMemo(() => {
    return [...stations]
      .filter((s) => s.price > 0)
      .sort((a, b) => a.price - b.price)
      .map((s, i) => ({ ...s, rank: i + 1 }))
  }, [stations])

  const cheapestPrice = ranked[0]?.price

  // ── 지도 초기화 ────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return
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
        if (mapRef.current) {
          try { mapRef.current.destroy() } catch {}
          mapRef.current = null
        }
        const fallback = new naver.maps.LatLng(37.8813, 127.7298)
        const center = myLoc ? new naver.maps.LatLng(myLoc.lat, myLoc.lng) : fallback
        const map = new naver.maps.Map(mapContainerRef.current, {
          center,
          zoom: 13,
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.TOP_LEFT },
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
  }, [])

  // ── 내 위치 마커 ──────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !myLoc) return
    const naver = (window as any).naver
    if (!naver?.maps) return
    if (meMarkerRef.current) {
      try { meMarkerRef.current.setMap(null) } catch {}
      meMarkerRef.current = null
    }
    meMarkerRef.current = new naver.maps.Marker({
      position: new naver.maps.LatLng(myLoc.lat, myLoc.lng),
      map: mapRef.current,
      clickable: false,
      icon: { content: ME_MARKER_HTML, anchor: new naver.maps.Point(0, 0) },
      zIndex: 200,
    })
    mapRef.current.panTo(new naver.maps.LatLng(myLoc.lat, myLoc.lng))
  }, [mapReady, myLoc])

  // ── 주유소 마커 갱신 ──────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const naver = (window as any).naver
    if (!naver?.maps) return

    markersRef.current.forEach((m) => {
      try { m.setMap(null) } catch {}
    })
    markersRef.current = []

    ranked.forEach((s) => {
      const pos = new naver.maps.LatLng(s.lat, s.lng)
      const marker = new naver.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: s.osNm,
        icon: {
          content: priceMarkerHtml(s.poll, s.price, s.price === cheapestPrice),
          anchor: new naver.maps.Point(0, 0),
        },
        zIndex: s.rank <= 3 ? 100 - s.rank : 50,
      })
      naver.maps.Event.addListener(marker, "click", () => {
        setSelectedId(s.uniId)
        mapRef.current.panTo(pos)
      })
      markersRef.current.push(marker)
    })
  }, [ranked, mapReady, cheapestPrice])

  return (
    <div className="min-h-screen bg-muted/30 pb-20 md:pb-0">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold">내 주변 주유소</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        {/* 안내 카드 */}
        <div className="rounded-2xl border bg-gradient-to-br from-rose-500/10 to-amber-500/10 border-rose-500/15 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-rose-500 to-amber-500">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-foreground">주유소 가격 비교</h2>
              <p className="text-xs text-muted-foreground">
                한국석유공사 오피넷 데이터 · 5분마다 갱신
              </p>
            </div>
          </div>
          {mocked && (
            <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5">
              ※ 데모 데이터 — OPINET_API_KEY 미설정
            </p>
          )}
        </div>

        {/* 옵션: 유종 + 반경 */}
        <div className="rounded-2xl bg-card border border-border p-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">
              유종
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {PRODUCTS.map((p) => (
                <button
                  key={p}
                  onClick={() => setProduct(p)}
                  className={cn(
                    "px-3 h-8 rounded-full text-xs font-semibold border transition-colors",
                    product === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:border-primary/40",
                  )}
                >
                  {OIL_PRODUCT_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">
              반경
            </p>
            <div className="flex gap-1.5">
              {[1000, 3000, 5000].map((r) => (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  className={cn(
                    "px-3 h-8 rounded-full text-xs font-semibold border transition-colors",
                    radius === r
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:border-primary/40",
                  )}
                >
                  {r / 1000}km
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 위치 권한 안내 */}
        {permission !== "granted" && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-900/40">
            <MapPin className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {permission === "denied"
                  ? "위치 권한이 거부되어 있어요"
                  : "내 위치로 검색해요"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {permission === "denied"
                  ? locError || "브라우저 설정에서 허용해주세요"
                  : "위치 권한을 허용하면 결과가 표시됩니다"}
              </p>
            </div>
            <button
              onClick={requestLocation}
              className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex-shrink-0"
            >
              {permission === "denied" ? "다시 시도" : "위치 허용"}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3">
          {/* 지도 */}
          <div className="relative rounded-2xl overflow-hidden border border-border shadow-sm bg-muted/40 min-h-[320px]">
            {mapError ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
                <p className="text-sm text-muted-foreground">지도 로드에 실패했어요.</p>
              </div>
            ) : (
              <div ref={mapContainerRef} className="w-full" style={{ height: "440px" }} />
            )}
          </div>

          {/* 사이드 — 저렴한 순위 */}
          <aside className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold">저렴한 순위</h3>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {ranked.length}곳
              </span>
            </div>
            <div className="max-h-[440px] overflow-y-auto divide-y divide-border/60">
              {loading && (
                <div className="py-10 flex flex-col items-center text-muted-foreground text-sm">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  조회 중…
                </div>
              )}
              {!loading && error && (
                <div className="py-10 px-4 text-center text-sm text-rose-600">{error}</div>
              )}
              {!loading && !error && ranked.length === 0 && (
                <div className="py-10 px-4 text-center text-sm text-muted-foreground">
                  반경 내 주유소가 없어요
                </div>
              )}
              {!loading && !error && ranked.map((s) => {
                const isMin = s.price === cheapestPrice
                const { bg, label } = brandStyle(s.poll)
                return (
                  <button
                    key={s.uniId}
                    onClick={() => {
                      setSelectedId(s.uniId)
                      if (mapRef.current) {
                        const naver = (window as any).naver
                        mapRef.current.panTo(new naver.maps.LatLng(s.lat, s.lng))
                        if (mapRef.current.getZoom() < 14) mapRef.current.setZoom(14)
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors",
                      selectedId === s.uniId && "bg-primary/5",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0",
                        s.rank === 1 ? "bg-amber-400 text-amber-950"
                          : s.rank === 2 ? "bg-zinc-300 text-zinc-800"
                          : s.rank === 3 ? "bg-amber-700/80 text-white"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {s.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                          style={{ background: bg }}
                        >
                          {label}
                        </span>
                        <p className="text-sm font-semibold truncate">{s.osNm}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {typeof s.distance === "number" && (
                          <>{s.distance < 1000 ? `${Math.round(s.distance)}m` : `${(s.distance / 1000).toFixed(1)}km`}</>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          isMin ? "text-rose-600" : "text-foreground",
                        )}
                      >
                        {s.price.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">원/L</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>
        </div>

        {/* 길찾기 — 카카오맵 / 네이버 지도 */}
        {selectedId && (() => {
          const s = ranked.find((r) => r.uniId === selectedId)
          if (!s) return null
          const kakaoUrl = `https://map.kakao.com/link/to/${encodeURIComponent(s.osNm)},${s.lat},${s.lng}${
            myLoc ? `/from/내위치,${myLoc.lat},${myLoc.lng}` : ""
          }`
          const naverUrl = `https://map.naver.com/v5/directions/${
            myLoc ? `${myLoc.lng},${myLoc.lat},내위치` : "-"
          }/-/${s.lng},${s.lat},${encodeURIComponent(s.osNm)}/-/car`
          return (
            <div className="rounded-2xl bg-card border border-border shadow-sm p-3">
              <p className="text-xs text-muted-foreground mb-2 px-1">
                <span className="font-semibold text-foreground">{s.osNm}</span> 까지 길찾기
              </p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={kakaoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-yellow-400 text-zinc-900 font-semibold text-sm hover:opacity-90"
                >
                  <Navigation className="w-4 h-4" />
                  카카오맵
                </a>
                <a
                  href={naverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:opacity-90"
                >
                  <Navigation className="w-4 h-4" />
                  네이버 지도
                </a>
              </div>
            </div>
          )
        })()}

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          가격 정보 출처: 한국석유공사 유가정보서비스 (오피넷)
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
