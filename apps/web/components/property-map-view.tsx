"use client"

/**
 * 매물 지도 뷰 — 네이버 지도 위에 모든 매물을 핀으로 표시.
 *
 * 사용처: 홈 화면 "지도로 보기" 탭, /properties 페이지.
 *
 * 기능:
 *  - 광장(춘천/강릉/...) 중심 좌표로 자동 센터링
 *  - 거래 형태(매매/전세/월세) 별 색상 구분 핀
 *  - 사이드 패널 매물 리스트 (양방향 호버 강조)
 *  - 마커 클릭 시 InfoWindow 미리보기 + 상세 링크
 *  - lat/lng 없는 매물은 자동 제외
 */
import { useEffect, useRef, useState, useMemo } from "react"
import Link from "next/link"
import { loadNaverMapsScript } from "@/lib/integrations/naver-maps"
import { Property } from "@/types/app"
import { Loader2, MapPin, AlertCircle, Eye, Heart } from "lucide-react"
import { cn } from "@/lib/utils"

const PLAZA_CENTER: Record<string, { lat: number; lng: number; zoom: number }> = {
  chuncheon: { lat: 37.881, lng: 127.730, zoom: 12 },
  gangneung: { lat: 37.751, lng: 128.876, zoom: 12 },
}

const FALLBACK_CENTER = { lat: 37.5665, lng: 126.9780, zoom: 11 } // 서울

// 거래 형태별 색상
const TRANSACTION_COLORS = {
  '매매':   { bg: '#dc2626', fg: '#ffffff', dot: '#dc2626' }, // 빨강
  '전세':   { bg: '#2563eb', fg: '#ffffff', dot: '#2563eb' }, // 파랑
  '월세':   { bg: '#16a34a', fg: '#ffffff', dot: '#16a34a' }, // 초록
  '단기':   { bg: '#7c3aed', fg: '#ffffff', dot: '#7c3aed' }, // 보라
  '전월세': { bg: '#0891b2', fg: '#ffffff', dot: '#0891b2' }, // 청록
} as const

const DEFAULT_COLOR = { bg: '#64748b', fg: '#ffffff', dot: '#64748b' } // 회색

// .map() 안에서 매 렌더마다 새 style 객체 생성 방지 — 같은 color 키면 동일 참조 재사용
const bgCache = new Map<string, React.CSSProperties>()
function bgStyle(color: string): React.CSSProperties {
  let s = bgCache.get(color)
  if (!s) { s = { background: color }; bgCache.set(color, s) }
  return s
}

interface Props {
  properties: Property[]
  plazaId: string | null
  /** 높이 (기본 600px) */
  height?: number | string
  className?: string
  /** 사이드 패널 표시 여부 (기본 true) */
  showSidebar?: boolean
}

export function PropertyMapView({
  properties,
  plazaId,
  height = 600,
  className,
  showSidebar = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const infoWindowRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 좌표 있는 매물만
  const mapped = useMemo(
    () => properties.filter((p) => p.lat != null && p.lng != null),
    [properties],
  )
  const skipped = properties.length - mapped.length

  // 거래 형태별 카운트 (범례용)
  const txCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    mapped.forEach((p) => {
      const t = (p.transactionType as string) || '기타'
      counts[t] = (counts[t] ?? 0) + 1
    })
    return counts
  }, [mapped])

  // 지도 초기화
  useEffect(() => {
    let cancelled = false
    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
    if (!clientId) {
      setError("네이버 지도 키가 설정되지 않았습니다.")
      return
    }

    ;(window as any).navermap_authFailure = function () {
      console.error("[map] 네이버 지도 인증 실패 — 도메인 화이트리스트 미등록 의심")
      setError(
        "네이버 지도 인증 실패\n네이버 클라우드 플랫폼 콘솔에서 현재 도메인을 등록해 주세요.\n(현재: " +
          window.location.host +
          ")",
      )
    }

    loadNaverMapsScript(clientId)
      .then(() => {
        if (cancelled || !containerRef.current) return
        const naver = (window as any).naver
        if (!naver?.maps) {
          setError("지도 SDK 로드 실패")
          return
        }

        const center = (plazaId ? PLAZA_CENTER[plazaId] : undefined) ?? FALLBACK_CENTER

        if (mapRef.current) {
          try { mapRef.current.destroy() } catch {}
          mapRef.current = null
        }

        let frameAttempts = 0
        const init = () => {
          if (cancelled || !containerRef.current) return
          const el = containerRef.current
          if ((el.clientWidth === 0 || el.clientHeight === 0) && frameAttempts < 60) {
            frameAttempts++
            requestAnimationFrame(init)
            return
          }

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

          // InfoWindow 안의 닫기 버튼이 호출하는 글로벌 함수
          ;(window as any).__closeMapInfoWindow = () => {
            try {
              if (infoWindowRef.current) infoWindowRef.current.close()
              setSelectedId(null)
            } catch {}
          }

          const onResize = () => {
            try {
              if (mapRef.current) naver.maps.Event.trigger(mapRef.current, "resize")
            } catch {}
          }
          window.addEventListener("resize", onResize)
          ;(map as any).__onResize = onResize

          // 컨테이너 크기 변할 때마다 (예: 부모 레이아웃 변경) 자동으로 relayout
          let observer: ResizeObserver | null = null
          if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => {
              try { naver.maps.Event.trigger(map, "resize") } catch {}
            })
            observer.observe(el)
            ;(map as any).__observer = observer
          }

          // 첫 렌더 후 100ms 동안 한 번 더 강제 trigger (안전망)
          ;[0, 50, 200, 500].forEach((delay) => {
            setTimeout(() => {
              try {
                if (mapRef.current && !cancelled) {
                  naver.maps.Event.trigger(mapRef.current, "resize")
                }
              } catch {}
            }, delay)
          })

          setReady(true)
        }
        requestAnimationFrame(init)
      })
      .catch((e) => {
        if (cancelled) return
        console.error("naver maps load failed", e)
        setError("지도 로드 실패")
      })

    return () => {
      cancelled = true
      markersRef.current.forEach((m) => { try { m.setMap(null) } catch {} })
      markersRef.current.clear()
      if (mapRef.current && (mapRef.current as any).__onResize) {
        window.removeEventListener("resize", (mapRef.current as any).__onResize)
      }
      if (mapRef.current && (mapRef.current as any).__observer) {
        try { (mapRef.current as any).__observer.disconnect() } catch {}
      }
      try { delete (window as any).__closeMapInfoWindow } catch {}
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

    // 기존 마커 제거
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

      const marker = new naver.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: p.title,
        icon: {
          content: renderMarkerHtml(p, false),
          anchor: new naver.maps.Point(0, 0),
        },
        zIndex: 100,
      })

      naver.maps.Event.addListener(marker, "click", () => {
        setSelectedId(p.id)
        const html = makeInfoHtml(p)
        if (!infoWindowRef.current) return
        infoWindowRef.current.setContent(html)
        infoWindowRef.current.open(mapRef.current, marker)
      })

      naver.maps.Event.addListener(marker, "mouseover", () => {
        setHoveredId(p.id)
      })
      naver.maps.Event.addListener(marker, "mouseout", () => {
        setHoveredId((h) => (h === p.id ? null : h))
      })

      markersRef.current.set(p.id, marker)
    })

    if (mapped.length >= 3) {
      try { mapRef.current.fitBounds(bounds, { padding: 80 }) } catch {}
    }
  }, [ready, mapped])

  // 호버/선택 시 마커 강조
  useEffect(() => {
    const naver = (window as any).naver
    if (!naver?.maps) return
    markersRef.current.forEach((marker, id) => {
      const p = mapped.find((mp) => mp.id === id)
      if (!p) return
      const isActive = id === hoveredId || id === selectedId
      try {
        marker.setIcon({
          content: renderMarkerHtml(p, isActive),
          anchor: new naver.maps.Point(0, 0),
        })
        marker.setZIndex(isActive ? 999 : 100)
      } catch {}
    })
  }, [hoveredId, selectedId, mapped])

  // 사이드 패널 아이템 클릭 → 지도 이동 + InfoWindow
  function focusProperty(p: Property) {
    const naver = (window as any).naver
    const marker = markersRef.current.get(p.id)
    if (!naver?.maps || !marker || !mapRef.current) return
    setSelectedId(p.id)
    mapRef.current.setCenter(new naver.maps.LatLng(Number(p.lat), Number(p.lng)))
    if (mapRef.current.getZoom() < 14) mapRef.current.setZoom(15)
    if (infoWindowRef.current) {
      infoWindowRef.current.setContent(makeInfoHtml(p))
      infoWindowRef.current.open(mapRef.current, marker)
    }
  }

  const heightStyle = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={cn(
        // 모바일: 세로 배치 + 자식들이 자연스럽게 쌓임 (height 강제 X)
        // 데스크톱: 가로 배치 + 명시 height (지도+사이드 양쪽 정렬)
        "flex flex-col md:flex-row gap-3 w-full md:[height:var(--map-h)]",
        className,
      )}
      style={{ ['--map-h' as any]: heightStyle }}
    >
      {/* 지도 영역 — 모바일에선 고정 400px, PC 에선 부모 height 채움 */}
      <div className="relative isolate flex-1 rounded-xl overflow-hidden border border-border bg-muted/20 h-[400px] md:h-auto md:min-h-[400px]">
        <div ref={containerRef} className="w-full h-full" style={{ minHeight: 400 }} />

        {/* 로딩 */}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/40 backdrop-blur-sm z-10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              지도 로딩 중...
            </div>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/60 p-4 text-center z-20">
            <AlertCircle className="w-6 h-6 text-amber-500" />
            <p className="text-sm font-medium whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* 좌표 없는 매물 안내 */}
        {ready && skipped > 0 && (
          <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-md bg-amber-100/95 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 text-[11px] font-medium border border-amber-300/60 shadow-sm">
            좌표 없음 {skipped}건 제외
          </div>
        )}

        {/* 빈 상태 */}
        {ready && mapped.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-sm pointer-events-none z-10">
            <MapPin className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">표시할 매물이 없습니다</p>
          </div>
        )}

        {/* 거래 형태별 범례 */}
        {ready && Object.keys(txCounts).length > 0 && (
          <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5 px-2.5 py-1.5 rounded-md bg-white/95 dark:bg-slate-900/90 text-xs shadow-sm border border-border max-w-[calc(100%-1.5rem)]">
            {Object.entries(txCounts).map(([tx, count], idx) => {
              const color = (TRANSACTION_COLORS as any)[tx]?.dot ?? DEFAULT_COLOR.dot
              return (
                <span key={tx} className="flex items-center gap-1">
                  {idx > 0 && <span className="text-muted-foreground">·</span>}
                  <span className="inline-block w-2 h-2 rounded-full" style={bgStyle(color)} />
                  <span className="text-muted-foreground">{tx}</span>
                  <span className="text-foreground font-medium">{count}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* 사이드 패널 — 매물 리스트 (모바일: 지도 아래 자체 스크롤, PC: 우측 고정) */}
      {showSidebar && (
        <aside className="md:w-[300px] flex-shrink-0 rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-[200px] max-h-[400px] md:max-h-none">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold">매물 {mapped.length}건</h3>
            {skipped > 0 && (
              <span className="text-[10px] text-muted-foreground">
                +{skipped}건 좌표 없음
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {mapped.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                매물이 없습니다
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {mapped.map((p) => {
                  const color =
                    (TRANSACTION_COLORS as any)[p.transactionType as string]?.dot ?? DEFAULT_COLOR.dot
                  const isActive = p.id === hoveredId || p.id === selectedId
                  return (
                    <li
                      key={p.id}
                      onMouseEnter={() => setHoveredId(p.id)}
                      onMouseLeave={() => setHoveredId((h) => (h === p.id ? null : h))}
                      onClick={() => focusProperty(p)}
                      className={cn(
                        'p-3 cursor-pointer transition-colors',
                        isActive ? 'bg-primary/5' : 'hover:bg-muted/40',
                      )}
                    >
                      <div className="flex gap-2.5">
                        {p.images?.[0] && (
                          <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                            <img
                              src={p.images[0]}
                              alt={p.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={bgStyle(color)}
                            />
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {p.transactionType}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-foreground truncate">
                            {formatPriceLabel(p)}
                          </p>
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                            {p.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            {p.address && (
                              <span className="truncate">{shortAddress(p.address)}</span>
                            )}
                            {(p.views ?? 0) > 0 && (
                              <span className="flex items-center gap-0.5 flex-shrink-0">
                                <Eye className="w-2.5 h-2.5" />
                                {p.views}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

// ===== 헬퍼 =====

function txColor(p: Property) {
  const tx = p.transactionType as keyof typeof TRANSACTION_COLORS
  return TRANSACTION_COLORS[tx] ?? DEFAULT_COLOR
}

function renderMarkerHtml(p: Property, active: boolean): string {
  const c = txColor(p)
  const label = formatPriceLabel(p)
  const txLabel = p.transactionType ?? ''

  const scale = active ? 1.1 : 1
  const ring = active ? `0 0 0 4px ${c.bg}40,` : ''

  return `
    <div style="
      transform: translate(-50%, -100%) scale(${scale});
      transform-origin: bottom center;
      transition: transform 0.15s ease-out;
      pointer-events: auto;
    ">
      <div style="
        padding: 5px 11px;
        border-radius: 16px;
        background: ${c.bg};
        color: ${c.fg};
        font-size: 12px;
        font-weight: 700;
        border: 2px solid white;
        box-shadow: ${ring} 0 3px 8px rgba(0,0,0,0.25);
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      ">
        <span style="font-size: 9px; opacity: 0.85; font-weight: 600;">${escapeHtml(txLabel)}</span>
        <span>${escapeHtml(label)}</span>
      </div>
      <!-- pin tail -->
      <div style="
        width: 0; height: 0;
        margin: -2px auto 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 8px solid ${c.bg};
        filter: drop-shadow(0 1px 1px rgba(0,0,0,0.15));
      "></div>
    </div>
  `
}

function formatPriceLabel(p: Property): string {
  // Property 타입의 price/deposit/monthlyRent 사용
  const tx = p.transactionType
  const price = p.price ?? 0
  const monthly = p.monthlyRent ?? 0

  if (tx === '매매') {
    return formatKoreanPrice(price, true)
  }
  if (tx === '전세') {
    return formatKoreanPrice(price, true)
  }
  if (tx === '월세' || tx === '단기임대' || tx === '단기') {
    const dep = formatKoreanPrice(price, false)
    return monthly > 0 ? `${dep}/${monthly}` : dep
  }
  return formatKoreanPrice(price, true)
}

/** 만원 단위로 들어오는 숫자를 "9억" / "5,000" 식으로 표기 */
function formatKoreanPrice(priceInMan: number, includeSuffix = true): string {
  if (!priceInMan || priceInMan <= 0) return '협의'
  if (priceInMan >= 10000) {
    const eok = Math.floor(priceInMan / 10000)
    const man = priceInMan % 10000
    if (man === 0) return includeSuffix ? `${eok}억` : `${eok}억`
    return `${eok}.${Math.floor(man / 1000)}억`
  }
  return `${priceInMan.toLocaleString()}`
}

function shortAddress(addr: string): string {
  // "강원특별자치도 춘천시 후평동" → "춘천시 후평동"
  return addr
    .replace(/^강원특별자치도\s*/, '')
    .replace(/^강원도\s*/, '')
    .replace(/^서울특별시\s*/, '')
    .replace(/^경기도\s*/, '')
    .trim()
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function makeInfoHtml(p: Property): string {
  const image = p.images?.[0] ?? ""
  const title = escapeHtml(p.title ?? "")
  const location = escapeHtml(shortAddress(p.address ?? ""))
  const price = escapeHtml(formatPriceLabel(p))
  const tx = escapeHtml(p.transactionType ?? "")
  const link = `/property/${p.id}`
  const c = txColor(p)

  return `
    <div style="position: relative; width: 250px;">
      <!-- 닫기 버튼 -->
      <button
        type="button"
        onclick="window.__closeMapInfoWindow && window.__closeMapInfoWindow()"
        aria-label="닫기"
        style="
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
          width: 26px;
          height: 26px;
          border: 0;
          padding: 0;
          border-radius: 50%;
          background: rgba(0,0,0,0.55);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
          font-weight: 700;
          backdrop-filter: blur(4px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          transition: background 0.15s;
        "
        onmouseover="this.style.background='rgba(0,0,0,0.8)'"
        onmouseout="this.style.background='rgba(0,0,0,0.55)'"
      >×</button>

      <a href="${link}" style="
        display: block;
        border-radius: 12px;
        overflow: hidden;
        background: white;
        box-shadow: 0 6px 20px rgba(0,0,0,0.18);
        text-decoration: none;
        color: inherit;
        border: 1px solid rgba(0,0,0,0.08);
      ">
        ${image ? `<div style="width:100%; height:130px; background: url('${encodeURI(image).replace(/'/g, "%27")}') center/cover #f1f5f9;"></div>` : ""}
        <div style="padding: 10px 12px;">
          <div style="display: inline-block; padding: 1px 6px; border-radius: 4px; background: ${c.bg}; color: white; font-size: 10px; font-weight: 700; margin-bottom: 6px;">
            ${tx}
          </div>
          <div style="font-size: 16px; font-weight: 800; color: ${c.bg}; margin-bottom: 4px;">${price}</div>
          <div style="font-weight: 600; font-size: 13px; line-height: 1.3; color: #0f172a;
            overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
            -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${title}</div>
          ${location ? `<div style="margin-top: 4px; font-size: 11px; color: #64748b;">📍 ${location}</div>` : ""}
          <div style="margin-top: 8px; font-size: 11px; color: ${c.bg}; font-weight: 600;">상세 보기 →</div>
        </div>
      </a>
    </div>
  `
}
