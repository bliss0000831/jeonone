import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"

// Edge runtime — Naver Static Maps 프록시
export const runtime = "edge"
export const dynamic = "force-dynamic"

/**
 * 좌표 → 정적 지도 PNG (Naver Static Maps)
 * GET /api/static-map?lat=37.5&lng=127.0&w=600&h=440&level=15
 *
 * 클라이언트 (모바일) 가 NaverMapView 초기화 완료 전에 정적 이미지를 즉시 보여주기 위함.
 *   - PNG 한 장이라 expo-image 가 memory-disk 캐시
 *   - 두 번째 view 부터는 즉시 표시 (네트워크 0)
 *   - CDN s-maxage 30일 — 글로벌 첫 viewer 만 비용 부담
 *
 * Secret 은 서버에서만 사용 (NAVER_MAP_CLIENT_SECRET env).
 */
export async function GET(request: NextRequest) {
  // 외부 API 비용 노출 방지 — IP 당 분당 60회 (지도 + geocode 양쪽 합산해도 무방한 수준)
  const limited = await enforceRateLimit(request, "geocode")
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get("lat") || "")
  const lng = parseFloat(searchParams.get("lng") || "")
  const w = Math.max(120, Math.min(parseInt(searchParams.get("w") || "600", 10) || 600, 1000))
  const h = Math.max(80, Math.min(parseInt(searchParams.get("h") || "440", 10) || 440, 1000))
  const level = Math.max(1, Math.min(parseInt(searchParams.get("level") || "15", 10) || 15, 20))

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng 가 필요합니다" }, { status: 400 })
  }

  const clientId = process.env.NAVER_MAP_CLIENT_ID
  const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "지도 키 미설정" }, { status: 503 })
  }

  // Naver Static Maps v2 — raster PNG
  // center 는 lng,lat 순서, markers 는 type:d|size:mid|pos:lng lat
  const params = new URLSearchParams()
  params.set("w", String(w))
  params.set("h", String(h))
  params.set("center", `${lng},${lat}`)
  params.set("level", String(level))
  params.set("scale", "2") // retina
  // 단일 마커 — 위치 표시
  params.set("markers", `type:d|size:mid|pos:${lng} ${lat}`)
  params.set("format", "png")

  const url = `https://maps.apigw.ntruss.com/map-static/v2/raster?${params.toString()}`

  try {
    const res = await fetch(url, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret,
      },
      // 외부 API 응답 자체는 캐시하지 않음 (Naver 가 캐싱 헤더 제어)
      cache: "no-store",
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.warn("[static-map] Naver 실패", res.status, body.slice(0, 200))
      // 디버그 모드 — ?debug=1 시 Naver 응답 상세 노출 (관리자 진단용)
      if (searchParams.get("debug") === "1") {
        return NextResponse.json(
          {
            error: "지도 생성 실패",
            naverStatus: res.status,
            naverBody: body.slice(0, 500),
            url: url.replace(clientSecret, "***").replace(clientId, "***"),
          },
          { status: 502 },
        )
      }
      return NextResponse.json({ error: "지도 생성 실패" }, { status: 502 })
    }

    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        // CDN 30일 캐싱 + stale 6시간 — 좌표 기반 이미지는 immutable
        "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=21600, immutable",
      },
    })
  } catch (err) {
    console.warn("[static-map] 예외", err)
    return NextResponse.json({ error: "지도 생성 실패" }, { status: 502 })
  }
}
