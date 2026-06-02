/**
 * 광장(plaza) 설정 — 서브도메인 → plaza_id 매핑.
 *
 * 새 광장 추가 시 이 파일이 아니라 `plazas` 테이블에 INSERT 하는 게 정상.
 * 여기 KNOWN_PLAZAS 는 미들웨어에서 빠른 lookup 용 캐시. DB 와 일치해야 함.
 *
 * 빌드타임에 fetch 하기 어려워서 정적 배열 유지. 새 광장 활성화 시 이 배열 업데이트.
 */

export const KNOWN_PLAZAS = [
  // ─── 강원권 (현재 active) ──
  'chuncheon',
  'gangneung',
  // ─── 강원권 (오픈예정) ──
  'wonju',
  'sokcho',
  'donghae-samcheok',
  'taebaek',
  // ─── 서울권 ──
  'seoul-south',
  'seoul-north',
  'seoul-west',
  'seoul-mid',
  // ─── 경기권 ──
  'gyeonggi-north',
  'goyang',
  'guri',
  'gimpo',
  'bucheon-siheung',
  'seongnam',
  'suwon',
  'ansan-sihwa',
  'anyang',
  'osan',
  'yongin-suji',
  'incheon',
  'pyeongtaek-anseong',
  'hanam-icheon',
  // ─── 충청권 ──
  'gongju-sejong',
  'dangjin',
  'daejeon',
  'baekje',
  'seosan',
  'sejong',
  'jecheon',
  'cheonan',
  'cheongju',
  'chungseo',
  'chungju',
  // ─── 전라권 ──
  'gwangju-jn',
  'gunsan',
  'namwon',
  'mokpo',
  'suncheon-gwangyang',
  'yeosu',
  'iksan',
  'jeonju',
  'jeongeup',
  // ─── 경상권 ──
  'gyeongsan-yeongcheon',
  'gyeongseo',
  'gyeongju',
  'gumi',
  'gimcheon',
  'gimhae',
  'miryang',
  'busan',
  'andong',
  'yangsan',
  'yeongju',
  'ulsan',
  'jinju',
  'jinhae',
  'changwon',
  'pohang',
  'hallyeo',
  // ─── 제주권 ──
  'jeju',
  'seogwipo',
] as const

export type PlazaId = (typeof KNOWN_PLAZAS)[number]

export const HUB_HOSTNAMES = new Set([
  'gwangjang.app',
  'www.gwangjang.app',
  'gwangjang.kr',         // 5월 도메인 변경 대비
  'www.gwangjang.kr',
  'gwangjang.vercel.app', // Vercel 기본 도메인
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
export const ACTIVE_PLAZAS: readonly PlazaId[] = ['chuncheon', 'gangneung']

export function isActivePlaza(id: string | null | undefined): id is PlazaId {
  if (!id) return false
  return (ACTIVE_PLAZAS as readonly string[]).includes(id)
}
