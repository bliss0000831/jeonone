/**
 * Juso.go.kr 도로명주소 검색 프록시.
 *
 * 클라이언트(웹/앱)는 confmKey 노출 없이 이 엔드포인트만 호출.
 * 결과: 도로명 / 지번 / 시도·시군구·동 / 우편번호 / 건물명 등.
 *
 * Juso API spec:
 *   https://www.juso.go.kr/addrlink/openApi/searchApi.do
 *   confmKey, currentPage, countPerPage, keyword, resultType=json
 */

import { NextResponse, type NextRequest } from "next/server"
import { enforceRateLimit } from "@/lib/services/ratelimit"

const JUSO_BASE = "https://business.juso.go.kr/addrlink/addrLinkApi.do"

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request as any, 'search')
  if (limited) return limited

  const url = new URL(request.url)
  const keyword = url.searchParams.get("keyword")?.trim() ?? ""
  const page = url.searchParams.get("page") ?? "1"
  const perPage = url.searchParams.get("perPage") ?? "10"

  if (!keyword || keyword.length < 2) {
    return NextResponse.json({ items: [], total: 0 })
  }

  const key = process.env.JUSO_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: "JUSO_API_KEY 환경변수가 없습니다" },
      { status: 500 },
    )
  }

  const jusoUrl = `${JUSO_BASE}?confmKey=${encodeURIComponent(
    key,
  )}&currentPage=${encodeURIComponent(page)}&countPerPage=${encodeURIComponent(
    perPage,
  )}&keyword=${encodeURIComponent(keyword)}&resultType=json`

  try {
    const res = await fetch(jusoUrl, {
      // 같은 키워드 재검색 캐싱 (10분)
      next: { revalidate: 600 },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Juso API ${res.status}` },
        { status: 502 },
      )
    }
    const data = await res.json()
    const results = data?.results ?? {}
    const common = results.common ?? {}
    const errorCode = common.errorCode
    if (errorCode && errorCode !== "0") {
      return NextResponse.json(
        { error: common.errorMessage || "검색 실패", code: errorCode },
        { status: 400 },
      )
    }
    const juso = Array.isArray(results.juso) ? results.juso : []
    const items = juso.map((j: any) => ({
      // 도로명전체주소 ex: "강원도 춘천시 중앙로 1"
      roadAddr: j.roadAddr as string,
      // 도로명주소(영문) — 필요시
      // 지번주소 — 동/리 + 번지 ex: "강원도 춘천시 후평동 532"
      jibunAddr: j.jibunAddr as string,
      // 우편번호
      zipNo: j.zipNo as string,
      // 시도, 시군구, 읍면동
      siNm: j.siNm as string,
      sggNm: j.sggNm as string,
      emdNm: j.emdNm as string,
      // 법정동/리
      liNm: j.liNm as string,
      // 도로명
      rn: j.rn as string,
      // 건물명
      bdNm: j.bdNm as string,
      // 건물번호
      buldMnnm: j.buldMnnm as string,
      buldSlno: j.buldSlno as string,
      // 우리 앱에서 표시할 통합 주소 — 지번 우선 (동 포함). 없으면 도로명.
      display: (j.jibunAddr as string) || (j.roadAddr as string),
    }))
    return NextResponse.json({
      items,
      total: Number(common.totalCount) || 0,
      page: Number(common.currentPage) || 1,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "프록시 오류" },
      { status: 502 },
    )
  }
}
