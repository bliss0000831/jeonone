/**
 * GET /api/toilets
 *   ?lat=&lng=&radius=km(default 1)
 *
 * 춘천 공공화장실 데이터를 거리 기준으로 정렬해 반환.
 * mobile 앱이 cross-origin 으로 호출 — 정적 데이터지만 변경 가능성 위해 API 로 노출.
 *
 * 출처: apps/web/lib/constants/chuncheon-toilets.ts (281곳, 2026-04-19 기준)
 */
import { NextResponse, type NextRequest } from "next/server"
import { CHUNCHEON_TOILETS, distanceKm } from "@/lib/constants/chuncheon-toilets"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = Number(searchParams.get("lat"))
  const lng = Number(searchParams.get("lng"))
  const radius = Math.min(
    Math.max(Number(searchParams.get("radius")) || 1, 0.1),
    10,
  )

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    // 좌표 없으면 전체 데이터 반환 (앱이 자체적으로 거리 계산)
    return NextResponse.json({ toilets: CHUNCHEON_TOILETS, total: CHUNCHEON_TOILETS.length })
  }

  const list = CHUNCHEON_TOILETS.map((t) => ({
    ...t,
    distance: distanceKm(lat, lng, t.lat, t.lng),
  }))
    .filter((t) => t.distance <= radius)
    .sort((a, b) => a.distance - b.distance)

  return NextResponse.json({ toilets: list, total: list.length })
}
