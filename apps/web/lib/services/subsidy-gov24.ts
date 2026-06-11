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

/** 도(광장) 정의 — plazaId · gov24 소관기관명 매칭어(orgLike) · 시군 목록 */
export interface Province {
  plazaId: string
  /** gov24 소관기관명 LIKE 매칭어 (그 도 소관기관명에 들어가는 고유 substring) */
  orgLike: string
  /** 도 시군 목록 (소관기관명/본문에서 시군 추출용) */
  sigungu: string[]
}

export const PROVINCES: Province[] = [
  { plazaId: 'gangwon', orgLike: '강원', sigungu: [
    '춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시',
    '홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군',
  ] },
  { plazaId: 'gyeonggi', orgLike: '경기도', sigungu: [
    '수원시','성남시','의정부시','안양시','부천시','광명시','평택시','동두천시','안산시','고양시',
    '과천시','구리시','남양주시','오산시','시흥시','군포시','의왕시','하남시','용인시','파주시',
    '이천시','안성시','김포시','화성시','광주시','양주시','포천시','여주시','연천군','가평군','양평군',
  ] },
  { plazaId: 'chungbuk', orgLike: '충청북도', sigungu: [
    '청주시','충주시','제천시','보은군','옥천군','영동군','증평군','진천군','괴산군','음성군','단양군',
  ] },
  { plazaId: 'chungnam', orgLike: '충청남도', sigungu: [
    '천안시','공주시','보령시','아산시','서산시','논산시','계룡시','당진시',
    '금산군','부여군','서천군','청양군','홍성군','예산군','태안군',
  ] },
  { plazaId: 'jeonbuk', orgLike: '전북', sigungu: [
    '전주시','군산시','익산시','정읍시','남원시','김제시',
    '완주군','진안군','무주군','장수군','임실군','순창군','고창군','부안군',
  ] },
  { plazaId: 'jeonnam', orgLike: '전라남도', sigungu: [
    '목포시','여수시','순천시','나주시','광양시','담양군','곡성군','구례군','고흥군','보성군','화순군',
    '장흥군','강진군','해남군','영암군','무안군','함평군','영광군','장성군','완도군','진도군','신안군',
  ] },
  { plazaId: 'gyeongbuk', orgLike: '경상북도', sigungu: [
    '포항시','경주시','김천시','안동시','구미시','영주시','영천시','상주시','문경시','경산시',
    '의성군','청송군','영양군','영덕군','청도군','고령군','성주군','칠곡군','예천군','봉화군','울진군','울릉군',
  ] },
  { plazaId: 'gyeongnam', orgLike: '경상남도', sigungu: [
    '창원시','진주시','통영시','사천시','김해시','밀양시','거제시','양산시',
    '의령군','함안군','창녕군','고성군','남해군','하동군','산청군','함양군','거창군','합천군',
  ] },
  { plazaId: 'jeju', orgLike: '제주', sigungu: ['제주시','서귀포시'] },
]

export function provinceByPlaza(plazaId: string): Province | undefined {
  return PROVINCES.find((p) => p.plazaId === plazaId)
}

/**
 * 제목에서 시군을 판별. 제목에 시군명이 박혀 있으면 그 시군 전용으로 본다.
 *   - '강릉시 시민안전보험' → 강릉시 (정식명)
 *   - '동해 시민 장학금' / '강릉사랑상품권' → 동해시 / 강릉시 (시/군 떼고 매칭)
 *   - '가정위탁 양육보조금' → null (도 전체)
 * 소관기관명(관할청)이 아닌 '제목' 기준 — 도 전역 사업이 관할 시군으로 오태깅되는 것 방지.
 */
export function regionFromTitle(title: string, sigungu: string[]): string | null {
  const t = title ?? ''
  // 1) 정식 시군명 (강릉시/홍천군 …)
  for (const sg of sigungu) if (t.includes(sg)) return sg
  // 2) 시/군 뗀 어간 (강릉/홍천/동해 …) — 2글자 이상만
  for (const sg of sigungu) {
    const stem = sg.replace(/(특별자치시|시|군)$/, '')
    if (stem.length >= 2 && t.includes(stem)) return sg
  }
  return null
}

/**
 * 서비스에서 시군명을 추출. 시군 단위가 아니면 null (= 도 전체에 노출).
 *   - 소관기관명 '농림축산식품부' 등 중앙부처 → null (전국)
 *   - 소관기관명/본문에 시군명 포함 → 그 시군
 *
 * @param sigungu 해당 도의 시군 목록
 */
export function regionFromService(
  s: {
    소관기관명?: string
    서비스명?: string
    지원대상?: string
    지원내용?: string
    서비스목적요약?: string
  },
  sigungu: string[],
): string | null {
  const org = (s.소관기관명 ?? '').trim()
  // 중앙부처(전국) 사업은 본문에 특정 시군이 예시로 나와도 전국으로 유지
  // 소관기관 첫 토큰이 '○○부/청/처/위원회' 면 중앙부처 → null
  const orgHead = org.split(/[\s,]/)[0] ?? ''
  if (/(부|청|처|위원회)$/.test(orgHead) && !sigungu.some((sg) => org.includes(sg))) return null
  // 1) 소관기관명에 시군이 명시된 경우 (가장 정확)
  for (const sg of sigungu) if (org.includes(sg)) return sg
  // 2) 본문에서 시군 탐색
  const text = `${s.서비스명 ?? ''} ${s.지원대상 ?? ''} ${s.지원내용 ?? ''} ${s.서비스목적요약 ?? ''}`
  for (const sg of sigungu) if (text.includes(sg)) return sg
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

// 방어적 농업 필터 — cond 미적용(API 변경) 대비 서비스분야/키워드로 한 번 더 거른다.
const AGRI_KEYWORD = /(농업|농촌|농가|축산|귀농|영농|임업|산림|수산|어업|농림)/
function isAgri(s: Gov24Service): boolean {
  return (
    s.서비스분야 === AGRI_SERVICE_FIELD ||
    AGRI_KEYWORD.test(`${s.서비스명 ?? ''}${s.서비스목적요약 ?? ''}${s.서비스분야 ?? ''}`)
  )
}

function dedupeById(rows: Gov24Service[], filter?: (s: Gov24Service) => boolean): Gov24Service[] {
  const byId = new Map<string, Gov24Service>()
  for (const s of rows) {
    const id = s?.서비스ID
    if (!id) continue
    if (filter && !filter(s)) continue
    if (!byId.has(id)) byId.set(id, s)
  }
  return [...byId.values()]
}

/** 한 도(orgLike)의 농업 지원사업 수집 */
export async function collectAgricultureForProvince(
  serviceKey: string,
  orgLike: string,
  limit = 40,
): Promise<Gov24Service[]> {
  const rows = await fetchServicePage(serviceKey, 1, limit, [
    condParam('서비스분야', 'EQ', AGRI_SERVICE_FIELD),
    condParam('소관기관명', 'LIKE', orgLike),
  ])
  return dedupeById(rows, isAgri)
}

/** 중앙부처(농림축산식품부) 전국 농업 사업 — 모든 도에 region=null 로 노출 */
export async function collectNationalAgriculture(
  serviceKey: string,
  limit = 30,
): Promise<Gov24Service[]> {
  const rows = await fetchServicePage(serviceKey, 1, limit, [
    condParam('서비스분야', 'EQ', AGRI_SERVICE_FIELD),
    condParam('소관기관명', 'EQ', '농림축산식품부'),
  ])
  return dedupeById(rows, isAgri)
}

/**
 * 한 도(orgLike)의 비농업 생활·복지·안전 안내 수집 — 공지용.
 * 농업(농림축산어업)은 정부지원금 게시판이 다루므로 제외(중복 방지).
 */
export async function collectLocalNoticesForProvince(
  serviceKey: string,
  orgLike: string,
  limit = 60,
): Promise<Gov24Service[]> {
  const rows = await fetchServicePage(serviceKey, 1, limit, [
    condParam('소관기관명', 'LIKE', orgLike),
  ])
  return dedupeById(rows, (s) => s.서비스분야 !== AGRI_SERVICE_FIELD)
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
