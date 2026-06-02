import { NextResponse, type NextRequest } from "next/server"
import {
  findNearbyStations,
  findStationsByZone,
  findCheapestInSido,
  MOCK_NEARBY_STATIONS,
  type OilProduct,
} from "@/lib/integrations/opinet"

// 유가 데이터는 하루 수회만 업데이트 — 5분 캐싱으로 외부 API 호출 대폭 절감
export const dynamic = "force-dynamic"

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
} as const

/**
 * GET /api/gas-stations
 *   ?mode=nearby&lat=37.87&lng=127.73&radius=3000&product=gasoline
 *   ?mode=region&area1=03&area2=03020&product=gasoline
 *   ?mode=cheapest&area1=03&product=gasoline
 *
 * mode 미지정 시 nearby 기본.
 *
 * OPINET_API_KEY 미설정 시 mock 데이터 응답 (UI 동작 확인용).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("mode") || "nearby"
  const product = (searchParams.get("product") || "gasoline") as OilProduct

  const hasKey = !!process.env.OPINET_API_KEY

  try {
    if (mode === "nearby") {
      const lat = Number(searchParams.get("lat"))
      const lng = Number(searchParams.get("lng"))
      const radius = Math.min(Number(searchParams.get("radius")) || 3000, 5000)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json(
          { error: "lat, lng 가 필요합니다" },
          { status: 400 },
        )
      }
      if (!hasKey) {
        return NextResponse.json({
          stations: MOCK_NEARBY_STATIONS,
          mode,
          mocked: true,
          notice: "OPINET_API_KEY 미설정 — 데모 데이터를 표시합니다",
        })
      }
      const stations = await findNearbyStations(lat, lng, radius, product)
      return NextResponse.json({ stations, mode }, { headers: CACHE_HEADERS })
    }

    if (mode === "region") {
      const area1 = searchParams.get("area1") || ""
      const area2 = searchParams.get("area2")
      if (!area1) {
        return NextResponse.json({ error: "area1 이 필요합니다" }, { status: 400 })
      }
      if (!hasKey) {
        return NextResponse.json({
          stations: MOCK_NEARBY_STATIONS,
          mode,
          mocked: true,
          notice: "OPINET_API_KEY 미설정 — 데모 데이터를 표시합니다",
        })
      }
      const stations = await findStationsByZone(area1, area2, product)
      return NextResponse.json({ stations, mode }, { headers: CACHE_HEADERS })
    }

    if (mode === "cheapest") {
      const area1 = searchParams.get("area1") || ""
      if (!area1) {
        return NextResponse.json({ error: "area1 이 필요합니다" }, { status: 400 })
      }
      if (!hasKey) {
        return NextResponse.json({
          stations: MOCK_NEARBY_STATIONS,
          mode,
          mocked: true,
        })
      }
      const stations = await findCheapestInSido(area1, product)
      return NextResponse.json({ stations, mode }, { headers: CACHE_HEADERS })
    }

    return NextResponse.json({ error: "지원하지 않는 mode" }, { status: 400 })
  } catch (e: any) {
    console.error("[gas-stations]", e)
    return NextResponse.json(
      { error: "주유소 조회에 실패했습니다" },
      { status: 500 },
    )
  }
}
