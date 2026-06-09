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
