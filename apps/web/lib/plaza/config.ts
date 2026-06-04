/**
 * 광장(plaza) 설정 — 서브도메인 → plaza_id 매핑.
 *
 * 새 광장 추가 시 이 파일이 아니라 `plazas` 테이블에 INSERT 하는 게 정상.
 * 여기 KNOWN_PLAZAS 는 미들웨어에서 빠른 lookup 용 캐시. DB 와 일치해야 함.
 *
 * 빌드타임에 fetch 하기 어려워서 정적 배열 유지. 새 광장 활성화 시 이 배열 업데이트.
 */

// 전원일기 — 도(道) 단위 광장.
// 시군(강릉/춘천 등)은 plazas.coverage 배열 = in-app sub-region 필터로 처리.
export const KNOWN_PLAZAS = [
  'gangwon',   // 강원 (현재 active)
  'gyeonggi',  // 경기
  'chungbuk',  // 충북
  'chungnam',  // 충남
  'jeonbuk',   // 전북
  'jeonnam',   // 전남
  'gyeongbuk', // 경북
  'gyeongnam', // 경남
  'jeju',      // 제주
] as const

export type PlazaId = (typeof KNOWN_PLAZAS)[number]

export const HUB_HOSTNAMES = new Set([
  'jeonwondiary.vercel.app', // Vercel 기본 도메인
  'jeonwondiary.app',        // 커스텀 도메인 (예정)
  'www.jeonwondiary.app',
  // 레거시 호환
  'gwangjang.app',
  'www.gwangjang.app',
  'gwangjang.vercel.app',
  'localhost',
  '127.0.0.1',
])

/**
 * Host 헤더 → plaza_id 추출.
 *  - "chuncheon.gwangjang.app"        → "chuncheon"
 *  - "chuncheon.localhost:3000"       → "chuncheon"  (개발용)
 *  - "gwangjang.app" / "localhost"     → null         (허브)
 *  - 알 수 없는 서브도메인              → null         (허브로 fallback)
 */
export function plazaFromHost(host: string | null | undefined): PlazaId | null {
  if (!host) return null

  // 포트 제거: "chuncheon.localhost:3000" → "chuncheon.localhost"
  const cleanHost = host.split(':')[0].toLowerCase()

  // 허브 도메인이면 null
  if (HUB_HOSTNAMES.has(cleanHost)) return null

  // localhost 직접 진입
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') return null

  // 첫번째 라벨 추출
  const firstLabel = cleanHost.split('.')[0]

  // 알려진 광장이면 반환
  if ((KNOWN_PLAZAS as readonly string[]).includes(firstLabel)) {
    return firstLabel as PlazaId
  }

  return null
}

/**
 * 광장이 활성화된 상태인지 (KNOWN_PLAZAS 의 첫 N 개) 빠른 체크용.
 * 정확한 활성 여부는 DB 의 plazas.is_active 가 source of truth.
 */
export const ACTIVE_PLAZAS: readonly PlazaId[] = [...KNOWN_PLAZAS]

export function isActivePlaza(id: string | null | undefined): id is PlazaId {
  if (!id) return false
  return (ACTIVE_PLAZAS as readonly string[]).includes(id)
}
