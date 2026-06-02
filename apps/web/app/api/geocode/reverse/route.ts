import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"

// Edge runtime — Kakao/Nominatim 역지오코딩 프록시. fetch 만 사용해 edge 호환.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * 좌표 → 행정구역 역지오코딩
 * GET /api/geocode/reverse?lat={}&lng={}
 *
 * 1순위: Kakao Local API (KAKAO_REST_API_KEY 가 있고 정상 동작할 때)
 * 2순위(fallback): OpenStreetMap Nominatim (키 불필요)
 *
 * Kakao 미승인 상태이므로 기본적으로 Nominatim 으로 동작.
 * KAKAO_REST_API_KEY 가 설정되어 있으면 먼저 시도하고 실패 시 Nominatim 으로 폴백.
 */
export async function GET(request: NextRequest) {
  // 외부 API 비용 노출 방지 — IP 당 분당 30회
  const limited = await enforceRateLimit(request, 'geocode')
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const lat = searchParams.get("lat")
  const lng = searchParams.get("lng")

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat, lng 쿼리 파라미터가 필요합니다" },
      { status: 400 },
    )
  }

  // 1) Naver 우선 시도 (키 있을 때만)
  const naverId = process.env.NAVER_MAP_CLIENT_ID
  const naverSecret = process.env.NAVER_MAP_CLIENT_SECRET
  if (naverId && naverSecret) {
    try {
      // NCP Maps endpoint 이전 (구 naveropenapi → 신 maps.apigw)
      const url =
        `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc` +
        `?coords=${encodeURIComponent(lng)},${encodeURIComponent(lat)}&output=json&orders=admcode,legalcode,roadaddr`
      const res = await fetch(url, {
        headers: {
          "x-ncp-apigw-api-key-id": naverId,
          "x-ncp-apigw-api-key": naverSecret,
        },
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        const results = Array.isArray(data?.results) ? data.results : []
        // 행정동(admcode) 우선
        const admin =
          results.find((r: any) => r.name === "admcode") ||
          results.find((r: any) => r.name === "legalcode") ||
          results[0]
        if (admin) {
          const region = admin.region || {}
          const sido = region.area1?.name ?? ""
          const sigungu = region.area2?.name ?? ""
          const dong =
            region.area3?.name || region.area4?.name || ""
          return NextResponse.json({
            sido,
            sigungu,
            dong,
            fullName: [sido, sigungu, dong].filter(Boolean).join(" "),
            provider: "naver",
          })
        }
      } else {
        const body = await res.text().catch(() => "")
        console.warn("[geocode/reverse] Naver 실패, 다음 provider 로 폴백", res.status, body)
      }
    } catch (err) {
      console.warn("[geocode/reverse] Naver 예외, 다음 provider 로 폴백", err)
    }
  }

  // 2) Kakao 시도 (키 있을 때만)
  const kakaoKey = process.env.KAKAO_REST_API_KEY
  if (kakaoKey) {
    try {
      const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}`
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        const docs = Array.isArray(data?.documents) ? data.documents : []
        const h = docs.find((d: any) => d.region_type === "H") || docs[0]
        if (h) {
          return NextResponse.json({
            sido: h.region_1depth_name ?? "",
            sigungu: h.region_2depth_name ?? "",
            dong: h.region_3depth_name ?? "",
            fullName: [h.region_1depth_name, h.region_2depth_name, h.region_3depth_name]
              .filter(Boolean)
              .join(" "),
            provider: "kakao",
          })
        }
      } else {
        const body = await res.text().catch(() => "")
        console.warn("[geocode/reverse] Kakao 실패, Nominatim 으로 폴백", res.status, body)
      }
    } catch (err) {
      console.warn("[geocode/reverse] Kakao 예외, Nominatim 으로 폴백", err)
    }
  }

  // 2) Nominatim 폴백 (무료, 키 불필요)
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
      `&format=json&accept-language=ko&zoom=14&addressdetails=1`
    const res = await fetch(url, {
      headers: {
        // Nominatim 사용 약관상 식별 가능한 User-Agent 필수
        "User-Agent": "chuncheon-plaza/1.0 (contact: admin@chuncheon-plaza.kr)",
        "Accept-Language": "ko",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error("[geocode/reverse] Nominatim 오류", res.status, body)
      return NextResponse.json(
        { error: `역지오코딩 서버 오류 (${res.status})` },
        { status: 502 },
      )
    }

    const data = await res.json()
    const addr = data?.address || {}

    // Nominatim 한국 주소 필드 매핑
    //  state/province → 시도
    //  city / county  → 시군구 (예: 춘천시)
    //  borough / suburb / neighbourhood / quarter → 동/면
    const sido =
      addr.state || addr.province || addr.region || ""
    const sigungu =
      addr.city || addr.county || addr.town || addr.municipality || ""
    const dong =
      addr.borough ||
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.village ||
      addr.hamlet ||
      ""

    if (!sido && !sigungu && !dong) {
      return NextResponse.json(
        { error: "해당 좌표의 지역 정보를 찾을 수 없습니다", raw: addr },
        { status: 404 },
      )
    }

    return NextResponse.json({
      sido,
      sigungu,
      dong,
      fullName: [sido, sigungu, dong].filter(Boolean).join(" "),
      provider: "nominatim",
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "서버 오류" },
      { status: 500 },
    )
  }
}
