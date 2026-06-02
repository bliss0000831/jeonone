/**
 * 네이버 지도 Web Dynamic Map SDK 로더.
 * - 여러 컴포넌트에서 호출해도 <script> 는 한 번만 삽입.
 * - 이미 로드돼 있으면 즉시 resolve.
 */

const SCRIPT_ID = "naver-maps-sdk"
let scriptPromise: Promise<void> | null = null

export function loadNaverMapsScript(clientId: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve()
  }
  if ((window as any).naver?.maps) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () =>
        reject(new Error("네이버 지도 스크립트 로드 실패")),
      )
      return
    }

    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.async = true
    // ncpKeyId (신규) + ncpClientId (구 호환) 둘 다 지정
    // submodules=geocoder: naver.maps.Service.geocode / reverseGeocode 활성화
    script.src =
      `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}&ncpKeyId=${clientId}&submodules=geocoder`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("네이버 지도 스크립트 로드 실패"))
    document.head.appendChild(script)
  }).catch((err) => {
    // 실패 시 재시도 허용
    scriptPromise = null
    throw err
  })

  return scriptPromise
}

/**
 * 네이버 지도 SDK 에 내장된 geocoder 로 주소 → 좌표.
 * NCP REST API 보다 최신 행정명(강원특별자치도 등) 대응이 잘 됨.
 * 단계적 대체 질의로 재시도.
 */
export async function geocodeWithNaverSDK(
  clientId: string,
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (typeof window === "undefined") return null
  try {
    await loadNaverMapsScript(clientId)
  } catch {
    return null
  }
  const naver = (window as any).naver
  if (!naver?.maps?.Service?.geocode) return null

  const clean = address
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+\d+동\s*\d+호\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()

  const legacy = clean
    .replace(/^강원특별자치도/, "강원도")
    .replace(/^전북특별자치도/, "전라북도")
    .replace(/^제주특별자치도/, "제주도")

  const noProvince = clean.replace(
    /^(강원특별자치도|강원도|전북특별자치도|전라북도|제주특별자치도|제주도|경기도|인천광역시|서울특별시|부산광역시|대구광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|충청북도|충청남도|경상북도|경상남도|전라남도)\s+/,
    "",
  )

  const queries = Array.from(new Set([clean, legacy, noProvince].filter(Boolean)))

  for (const q of queries) {
    const result = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      try {
        naver.maps.Service.geocode({ query: q }, (status: any, response: any) => {
          if (status !== naver.maps.Service.Status.OK) return resolve(null)
          const first = response?.v2?.addresses?.[0]
          if (first?.x && first?.y) {
            resolve({ lat: parseFloat(first.y), lng: parseFloat(first.x) })
          } else {
            resolve(null)
          }
        })
      } catch {
        resolve(null)
      }
    })
    if (result) return result
  }
  return null
}

/**
 * 외부 지오코더가 전부 실패했을 때 사용할 최후의 폴백.
 * 주소에서 "○○동/○○면/○○읍" 을 뽑아 춘천시 행정구역 중심 좌표를 리턴.
 * 정확한 핀은 아니지만 최소한 올바른 동네가 보이도록 함.
 */
export function fallbackDongCentroid(
  address: string,
): { lat: number; lng: number; approximate: true; dong: string } | null {
  if (!address) return null
  // 동적 import 로 circular dep 회피
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CHUNCHEON_DONG_COORDS } = require("@/lib/constants/chuncheon-dong-coords") as {
    CHUNCHEON_DONG_COORDS: { name: string; lat: number; lng: number }[]
  }
  for (const d of CHUNCHEON_DONG_COORDS) {
    if (address.includes(d.name)) {
      return { lat: d.lat, lng: d.lng, approximate: true, dong: d.name }
    }
  }
  return null
}
