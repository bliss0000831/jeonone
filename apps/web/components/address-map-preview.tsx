"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, CheckCircle2, AlertTriangle, MapPin } from "lucide-react"
import dynamic from "next/dynamic"

const NaverMap = dynamic(
  () => import("@/components/naver-map").then((m) => m.NaverMap),
  { ssr: false },
)

interface AddressMapPreviewProps {
  address: string
  /** 좌표가 성공적으로 확보될 때마다 호출 (부모가 form state 에 lat/lng 저장) */
  onCoordsResolved?: (coords: { lat: number; lng: number } | null) => void
  height?: number
}

/**
 * 매물 등록/수정 폼 용 주소 미리보기.
 *  - 주소가 비었으면 안내 문구만
 *  - 주소 들어오면 /api/geocode/naver 호출 → 성공 시 지도 + ✅ 표시
 *  - 실패 시 ⚠️ 경고 (지도에 표시가 안 될 수 있음)
 */
export function AddressMapPreview({
  address,
  onCoordsResolved,
  height = 220,
}: AddressMapPreviewProps) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "fail">("idle")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  // 최신 address 에 대한 응답만 반영하도록
  const reqIdRef = useRef(0)
  const lastAddressRef = useRef<string>("")

  useEffect(() => {
    const addr = address.trim()
    if (!addr) {
      setState("idle")
      setCoords(null)
      onCoordsResolved?.(null)
      return
    }
    if (addr === lastAddressRef.current) return
    lastAddressRef.current = addr

    const reqId = ++reqIdRef.current
    setState("loading")

    // 약간의 debounce (사용자가 타이핑 중에 주소를 덮어쓰는 상황은 거의 없지만 안전망)
    const timer = setTimeout(async () => {
      const done = (c: { lat: number; lng: number } | null) => {
        if (reqId !== reqIdRef.current) return
        if (c) {
          setState("ok")
          setCoords(c)
          onCoordsResolved?.(c)
        } else {
          setState("fail")
          setCoords(null)
          onCoordsResolved?.(null)
        }
      }

      // 서버 REST API (다단계 재시도 포함 — 특별자치도/도로명/지번 모두 시도)
      // SDK 내장 geocoder 는 NCP 키 권한 이슈로 401 이 잦아 제거.
      // 서버는 service role 키로 붙기 때문에 CORS/권한 문제 없음.
      try {
        const res = await fetch(
          `/api/geocode/naver?address=${encodeURIComponent(addr)}`,
        )
        if (reqId !== reqIdRef.current) return
        if (!res.ok) return done(null)
        const data = await res.json()
        if (typeof data.lat === "number" && typeof data.lng === "number") {
          return done({ lat: data.lat, lng: data.lng })
        }
        return done(null)
      } catch {
        return done(null)
      }
    }, 200)

    return () => clearTimeout(timer)
    // onCoordsResolved 는 의도적으로 deps 제외 (매 렌더마다 새 함수여도 트리거 안 하도록)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  if (state === "idle") {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-muted/40 border border-dashed border-border rounded-lg"
      >
        <MapPin className="w-4 h-4" />
        주소를 선택하면 지도 미리보기가 표시됩니다
      </div>
    )
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-muted/40 border border-border rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin" />
        주소 확인 중...
      </div>
    )
  }

  if (state === "fail") {
    return (
      <div className="flex items-start gap-2 px-3 py-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-300/60 rounded-lg">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-medium">이 주소로는 지도가 표시되지 않을 수 있어요</div>
          <div className="text-xs opacity-80">
            신축·번지 누락 등일 수 있습니다. 등록은 가능하지만 상세 페이지 지도에 핀이 표시되지 않을 수 있습니다.
          </div>
        </div>
      </div>
    )
  }

  // ok
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="w-4 h-4" />
        <span>지도에 정확히 표시됩니다</span>
      </div>
      {coords && (
        <NaverMap
          address={address}
          lat={coords.lat}
          lng={coords.lng}
          height={height}
        />
      )}
    </div>
  )
}
