import { NextResponse, type NextRequest } from "next/server"
import { getSigunguList } from "@/lib/integrations/opinet"

export const dynamic = "force-dynamic"

/**
 * GET /api/gas-stations/sigungu?area1=03
 * 시도 코드로 해당 시도의 시군구 목록 반환.
 * OPINET_API_KEY 미설정 시 빈 배열 반환 (UI 가 비활성 상태로 fallback).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const area1 = searchParams.get("area1")
  if (!area1) {
    return NextResponse.json({ error: "area1 이 필요합니다" }, { status: 400 })
  }
  if (!process.env.OPINET_API_KEY) {
    return NextResponse.json({ items: [], notice: "OPINET_API_KEY 미설정" })
  }
  try {
    const items = await getSigunguList(area1)
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error("[gas-stations/sigungu]", e)
    return NextResponse.json(
      { error: "시군구 조회 실패", items: [] },
      { status: 500 },
    )
  }
}
