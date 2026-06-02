import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"

// Edge runtime — Naver/Nominatim 외부 API 프록시. fetch 만 사용해 edge 호환.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * 주소 → 좌표 (Naver Geocoding)
 * GET /api/geocode/naver?address={}
 *
 * Secret 은 서버에서만 사용 (NAVER_MAP_CLIENT_SECRET env).
 * 결과 실패 시 Nominatim 으로 폴백.
 *
 * 여러 주소 표기가 실패할 수 있어 **단계적 대체 질의** 를 시도:
 *  1) 원본 (괄호/상세주소 제거)
 *  2) "강원특별자치도" → "강원도"   (Naver geocoder 의 신 행정명 미지원 케이스)
 *  3) "전북특별자치도" → "전라북도" 등 같은 변환
 *  4) 시도명 자체 제거
 */
export async function GET(request: NextRequest) {
  // 외부 API 비용 노출 방지 — IP 당 분당 30회
  const limited = await enforceRateLimit(request, 'geocode')
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const rawAddress = searchParams.get("address")?.trim()
  if (!rawAddress) {
    return NextResponse.json({ error: "address 파라미터가 필요합니다" }, { status: 400 })
  }

  // "(건물명)" 을 따로 뽑아둔다. 지번만으로는 부정확한 매칭이 많아
  // "건물명 + 동/시" 쿼리가 오히려 정확한 경우가 많음 (예: "한신아파트 춘천시 후평동").
  const buildingMatch = rawAddress.match(/\(([^)]+)\)\s*$/)
  const buildingName = buildingMatch?.[1]?.trim() || ""

  // 네이버/Nominatim 모두 "(건물명)" 같은 괄호 접미사가 붙으면 엉뚱한 좌표를 반환하는 경우가 있음.
  const cleanBase = rawAddress
    .replace(/\s*\([^)]*\)\s*$/g, "") // 끝에 붙은 "(건물명)" 제거
    .replace(/\s+\d+동\s*\d+호\s*$/g, "") // "123동 456호" 등 상세주소 제거
    .replace(/\s+/g, " ")
    .trim()

  // 특별자치도 → 구 명칭 매핑 (Naver geocoder 가 아직 새 명칭을 인식 못하는 경우 대비)
  const legacyProvince = cleanBase
    .replace(/^강원특별자치도/, "강원도")
    .replace(/^전북특별자치도/, "전라북도")
    .replace(/^제주특별자치도/, "제주도")

  // 시도명 제거 버전 (폴백: "춘천시 동내면 거두리 663")
  const noProvince = cleanBase.replace(
    /^(강원특별자치도|강원도|전북특별자치도|전라북도|제주특별자치도|제주도|경기도|인천광역시|서울특별시|부산광역시|대구광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|충청북도|충청남도|경상북도|경상남도|전라남도)\s+/,
    "",
  )

  // 지번에서 시+동(면/읍) 파트만 추출 → 건물명 쿼리에 합침
  //   "춘천시 후평동 864" → "춘천시 후평동"
  //   "춘천시 동내면 거두리 663" → "춘천시 동내면 거두리"
  const siDong = noProvince
    .replace(/\s+\d[\d\-]*(번지)?\s*$/, "")
    .trim()

  // 건물명 기반 쿼리 (urban 한신아파트 같은 경우 지번보다 정확도 ↑)
  const buildingQueries = buildingName
    ? [
        siDong ? `${buildingName} ${siDong}` : "",
        `${buildingName} 춘천시`,
      ].filter(Boolean)
    : []

  // 우선순위: 건물명+지역 → 원본 지번 → 구명칭 → 시도명제거
  const queries = Array.from(
    new Set([...buildingQueries, cleanBase, legacyProvince, noProvince].filter(Boolean)),
  )

  const clientId = process.env.NAVER_MAP_CLIENT_ID
  const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET

  if (clientId && clientSecret) {
    for (const q of queries) {
      try {
        // NCP Maps 가 endpoint 를 이전함. 구 naveropenapi.apigw.ntruss.com 은 401 "구독 필요" 반환.
        const url =
          `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(q)}`
        const res = await fetch(url, {
          headers: {
            "x-ncp-apigw-api-key-id": clientId,
            "x-ncp-apigw-api-key": clientSecret,
          },
          cache: "no-store",
        })

        if (res.ok) {
          const data = await res.json()
          const first = Array.isArray(data?.addresses) && data.addresses[0]
          if (first?.x && first?.y) {
            return NextResponse.json(
              {
                lat: parseFloat(first.y),
                lng: parseFloat(first.x),
                roadAddress: first.roadAddress ?? "",
                jibunAddress: first.jibunAddress ?? "",
                provider: "naver",
                queryUsed: q,
              },
              {
                // 주소→좌표는 사실상 immutable — Vercel CDN 30일 캐싱
                // (실패 시 stale 6시간 유지하면서 백그라운드 갱신)
                headers: {
                  "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=21600",
                },
              },
            )
          }
        } else {
          const body = await res.text().catch(() => "")
          // 응답 본문에 API 키나 서버 정보가 섞여있을 수 있어 200자만 노출
          console.warn(
            "[geocode/naver] Naver 실패",
            res.status,
            body.slice(0, 200),
            "query=",
            q.slice(0, 100),
          )
        }
      } catch (err) {
        console.warn("[geocode/naver] Naver 예외", err, "query=", q)
      }
    }
  }

  // 폴백: Nominatim (OSM 은 특별자치도 명칭 잘 인식)
  for (const q of queries) {
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=kr`
      const res = await fetch(url, {
        headers: {
          "User-Agent": "chuncheon-plaza/1.0 (contact: admin@chuncheon-plaza.kr)",
          "Accept-Language": "ko",
        },
        cache: "no-store",
      })
      if (!res.ok) continue
      const data = await res.json()
      if (Array.isArray(data) && data[0]) {
        return NextResponse.json(
          {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            provider: "nominatim",
            queryUsed: q,
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=21600",
            },
          },
        )
      }
    } catch (err) {
      console.warn("[geocode/nominatim] 예외", err, "query=", q)
    }
  }

  return NextResponse.json({ error: "좌표를 찾지 못했습니다" }, { status: 404 })
}
