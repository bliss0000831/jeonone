/**
 * 보조금24 (gov24) 농업 지원사업 자동 수집 라이브러리
 *
 * 공공데이터포털 odcloud `gov24/v3/serviceList` 를 호출해
 * 농업(서비스분야 = '농림축산어업') 관련 + 강원 지역 / 농림축산식품부(전국) 사업을
 * 골라온다.
 *
 * 검증된 사실 (실제 API 호출로 확인, 2026-06):
 *   - 엔드포인트: https://api.odcloud.kr/api/gov24/v3/serviceList
 *   - 인증: serviceKey=<DATA_GO_KR_KEY> (Decoding 키, 길이 64)
 *   - cond 필터: `cond[필드명::연산자]=값` (브래킷/콜론은 raw, 값만 URL 인코딩)
 *       · 여러 cond 를 함께 주면 AND 로 결합됨.
 *       · ⚠️ 응답의 totalCount 는 필터를 무시한 전체 건수(10962)를 돌려주는
 *         odcloud 의 알려진 특성. 실제 data[] 는 cond 로 정상 필터됨.
 *   - '서비스분야' 값 분포(샘플 300건): 농림축산어업(71)·보육교육(43)·고용창업(36) …
 *     → 농업 카테고리는 정확히 '농림축산어업' 단일 값.
 *   - 강원 지역 사업: 소관기관명 LIKE '강원' (예: '강원특별자치도 춘천시')
 *   - 전국(중앙) 농업 사업: 소관기관명 = '농림축산식품부'
 */

const GOV24_BASE = 'https://api.odcloud.kr/api/gov24/v3/serviceList'

/** 농업 서비스분야 값 (실제 API 분포로 확인된 단일 카테고리) */
export const AGRI_SERVICE_FIELD = '농림축산어업'

/** 강원도 시군 (소관기관명 매칭용). 긴 이름 먼저 매칭되도록 길이 정렬은 호출부에서. */
const GANGWON_SIGUNGU = [
  '춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시',
  '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군',
  '양구군', '인제군', '고성군', '양양군',
]

/**
 * 서비스에서 강원 시군명을 추출. 시군 단위가 아니면 null 반환
 * → region NULL = "전국/도 전체" 글로 모든 시군에 노출.
 *
 * gov24 강원 농업 사업은 소관기관명이 보통 '강원특별자치도'(도청) 라서 시군이
 * 없고, 실제 대상 시군은 본문(서비스명·지원대상·지원내용)에 "춘천시 관내…" 식으로
 * 들어있다. 따라서 소관기관명 → 본문 순으로 시군을 찾는다.
 *
 *   소관기관명 '농림축산식품부'              → null (전국, 모든 시군 노출)
 *   소관기관명 '강원특별자치도', 본문 "춘천시 관내…" → '춘천시'
 *   소관기관명 '강원특별자치도' (시군 언급 없음) → null (도청 직속 = 전역)
 */
export function regionFromService(s: {
  소관기관명?: string
  서비스명?: string
  지원대상?: string
  지원내용?: string
  서비스목적요약?: string
}): string | null {
  const org = (s.소관기관명 ?? '').trim()
  // 중앙부처(전국) 사업은 본문에 특정 시군이 예시로 나와도 전국으로 유지
  if (org.includes('농림축산식품부')) return null
  // 1) 소관기관명에 시군이 명시된 경우 (가장 정확)
  for (const sg of GANGWON_SIGUNGU) if (org.includes(sg)) return sg
  // 2) 본문에서 시군 탐색 (강원 지역 사업 — 대상 시군이 본문에 들어있음)
  const text = `${s.서비스명 ?? ''} ${s.지원대상 ?? ''} ${s.지원내용 ?? ''} ${s.서비스목적요약 ?? ''}`
  for (const sg of GANGWON_SIGUNGU) if (text.includes(sg)) return sg
  return null
}

/** gov24 serviceList data[] 항목 (사용하는 필드만 선언) */
export interface Gov24Service {
  서비스ID: string
  서비스명: string
  서비스목적요약?: string
  서비스분야?: string
  선정기준?: string
  소관기관명?: string
  소관기관유형?: string
  소관기관코드?: string
  신청기한?: string
  신청방법?: string
  상세조회URL?: string
  등록일시?: string
  지원내용?: string
  지원대상?: string
}

interface Gov24Response {
  data?: Gov24Service[]
  page?: number
  perPage?: number
  totalCount?: number
}

/**
 * cond 쿼리스트링 조각을 만든다. 브래킷/콜론은 raw 로 두고 값만 인코딩
 * (실제 API 가 이 형태에서만 필터를 적용함).
 */
function condParam(field: string, op: string, value: string): string {
  return `cond[${field}::${op}]=${encodeURIComponent(value)}`
}

/**
 * serviceList 한 페이지를 가져온다.
 *
 * @param serviceKey  DATA_GO_KR_KEY
 * @param perPage     페이지당 건수
 * @param conds       cond 조각 배열 (AND 결합)
 */
async function fetchServicePage(
  serviceKey: string,
  page: number,
  perPage: number,
  conds: string[],
): Promise<Gov24Service[]> {
  const params = [
    `page=${page}`,
    `perPage=${perPage}`,
    'returnType=JSON',
    ...conds,
    `serviceKey=${encodeURIComponent(serviceKey)}`,
  ]
  const url = `${GOV24_BASE}?${params.join('&')}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`gov24 HTTP ${res.status}`)
  }
  const json = (await res.json()) as Gov24Response
  return Array.isArray(json.data) ? json.data : []
}

export interface CollectOptions {
  /** 강원 지역 사업당 최대 수집 건수 (기본 50) */
  gangwonLimit?: number
  /** 전국(농림축산식품부) 사업당 최대 수집 건수 (기본 30) */
  nationalLimit?: number
}

/**
 * 농업 지원사업 수집 (강원 + 전국).
 *
 * 두 종류의 cond 쿼리를 던진 뒤 서비스ID 기준으로 dedup 해서 반환한다.
 *   1) 농림축산어업 + 소관기관명 LIKE '강원'   (강원도 시군 사업)
 *   2) 농림축산어업 + 소관기관명 = '농림축산식품부' (중앙부처 전국 사업)
 */
export async function collectAgricultureSubsidies(
  serviceKey: string,
  opts: CollectOptions = {},
): Promise<Gov24Service[]> {
  const gangwonLimit = opts.gangwonLimit ?? 50
  const nationalLimit = opts.nationalLimit ?? 30

  const [gangwon, national] = await Promise.all([
    fetchServicePage(serviceKey, 1, gangwonLimit, [
      condParam('서비스분야', 'EQ', AGRI_SERVICE_FIELD),
      condParam('소관기관명', 'LIKE', '강원'),
    ]),
    fetchServicePage(serviceKey, 1, nationalLimit, [
      condParam('서비스분야', 'EQ', AGRI_SERVICE_FIELD),
      condParam('소관기관명', 'EQ', '농림축산식품부'),
    ]),
  ])

  // 방어적 농업 필터 — cond 가 적용되지 않을 경우(API 변경 등)를 대비해
  // 서비스분야 / 키워드로 한 번 더 거른다.
  const AGRI_KEYWORD = /(농업|농촌|농가|축산|귀농|영농|임업|산림|수산|어업|농림)/
  const isAgri = (s: Gov24Service) =>
    s.서비스분야 === AGRI_SERVICE_FIELD ||
    AGRI_KEYWORD.test(`${s.서비스명 ?? ''}${s.서비스목적요약 ?? ''}${s.서비스분야 ?? ''}`)

  const byId = new Map<string, Gov24Service>()
  for (const s of [...gangwon, ...national]) {
    const id = s?.서비스ID
    if (!id) continue
    if (!isAgri(s)) continue
    if (!byId.has(id)) byId.set(id, s)
  }
  return [...byId.values()]
}

/**
 * 강원 지자체 생활·복지·안전 등 "비농업" 서비스 수집 — 일반 공지/안내용.
 * 농업(농림축산어업)은 정부지원금 게시판이 따로 다루므로 여기선 제외(중복 방지).
 *   - 소관기관명 LIKE '강원' (강원도/시군 사업)
 *   - 서비스분야 = '농림축산어업' 인 건 제외
 */
export async function collectGangwonLocalNotices(
  serviceKey: string,
  limit = 80,
): Promise<Gov24Service[]> {
  const rows = await fetchServicePage(serviceKey, 1, limit, [
    condParam('소관기관명', 'LIKE', '강원'),
  ])
  const byId = new Map<string, Gov24Service>()
  for (const s of rows) {
    const id = s?.서비스ID
    if (!id) continue
    if (s.서비스분야 === AGRI_SERVICE_FIELD) continue // 농업 제외 (정부지원금과 중복 방지)
    if (!byId.has(id)) byId.set(id, s)
  }
  return [...byId.values()]
}

/** gov24 서비스 항목 → 공지 본문(content) — 지자체 안내용 */
export function buildNoticeContent(s: Gov24Service): string {
  const lines: string[] = []
  const push = (label: string, val?: string) => {
    const v = (val ?? '').trim()
    if (v) lines.push(`【${label}】\n${v}`)
  }
  push('안내 요약', s.서비스목적요약)
  push('대상', s.지원대상)
  push('내용', s.지원내용)
  push('신청 기한', s.신청기한)
  push('신청 방법', s.신청방법)
  push('담당 기관', s.소관기관명)
  if (s.상세조회URL) lines.push(`\n원문 보기: ${s.상세조회URL}`)
  lines.push('\n— 정부24에서 자동 수집된 지자체 생활·복지 안내입니다.')
  return lines.join('\n\n')
}

/** gov24 서비스 항목 → 게시글 본문(content) 텍스트 생성 */
export function buildContent(s: Gov24Service): string {
  const lines: string[] = []
  const push = (label: string, val?: string) => {
    const v = (val ?? '').trim()
    if (v) lines.push(`【${label}】\n${v}`)
  }
  push('서비스 목적', s.서비스목적요약)
  push('지원 대상', s.지원대상)
  push('지원 내용', s.지원내용)
  push('선정 기준', s.선정기준)
  push('신청 기한', s.신청기한)
  push('신청 방법', s.신청방법)
  push('소관 기관', s.소관기관명)
  if (s.상세조회URL) lines.push(`\n원문 보기: ${s.상세조회URL}`)
  lines.push('\n— 보조금24(정부24)에서 자동 수집된 정보입니다.')
  return lines.join('\n\n')
}
