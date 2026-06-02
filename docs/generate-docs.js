/**
 * 사업 설명회 자료 .docx 생성
 *  - 광장-서비스-소개.docx
 *  - 광장-수익구조.docx
 *
 * 실행: node generate-docs.js
 */

const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageOrientation, PageBreak, TabStopType, TabStopPosition,
} = require('docx')

// ─── 공통 스타일 / 유틸 ──────────────────────────────────────────────

const FONT = "맑은 고딕"
const ACCENT = "1d4ed8"        // 파랑
const HIGHLIGHT = "ef4444"     // 빨강
const MUTED = "64748b"         // 회색
const LIGHT = "f1f5f9"         // 옅은 회색

const border = (color = "CCCCCC") => ({ style: BorderStyle.SINGLE, size: 1, color })
const borders = (color = "CCCCCC") => ({
  top: border(color), bottom: border(color), left: border(color), right: border(color)
})

const STYLES = {
  default: { document: { run: { font: FONT, size: 22 } } },
  paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 40, bold: true, font: FONT, color: ACCENT },
      paragraph: { spacing: { before: 480, after: 280 }, outlineLevel: 0 } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 32, bold: true, font: FONT, color: ACCENT },
      paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 1 } },
    { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 26, bold: true, font: FONT },
      paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 2 } },
    { id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 23, bold: true, font: FONT },
      paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 3 } },
  ],
}

const NUMBERING = {
  config: [
    { reference: "bullets", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
    ]},
    { reference: "numbers", levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
    ]},
  ]
}

const PAGE = {
  size: { width: 12240, height: 15840 },
  margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
}
const CONTENT_WIDTH = 9360  // 12240 - 2*1440

function h1(text)     { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }) }
function h2(text)     { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }) }
function h3(text)     { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] }) }
function h4(text)     { return new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun(text)] }) }
function p(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text.map(t => typeof t === 'string' ? new TextRun(t) : new TextRun(t))
    : [new TextRun(text)]
  return new Paragraph({ children: runs, spacing: { after: 120 }, ...opts })
}
function bullet(text, level = 0) {
  const runs = Array.isArray(text)
    ? text.map(t => typeof t === 'string' ? new TextRun(t) : new TextRun(t))
    : [new TextRun(text)]
  return new Paragraph({ numbering: { reference: "bullets", level }, children: runs })
}
function num(text) {
  return new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun(text)] })
}
function spacer()     { return new Paragraph({ children: [new TextRun("")] }) }
function divider() {
  return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 6 } }, spacing: { before: 200, after: 200 } })
}
function quote(text) {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, color: MUTED })],
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 12 } },
    spacing: { before: 120, after: 120 },
  })
}
function callout(text, color = ACCENT) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color })],
    shading: { fill: LIGHT, type: ShadingType.CLEAR },
    spacing: { before: 120, after: 120 },
    indent: { left: 180 },
  })
}

// 테이블 헬퍼 — rows = [[...cells]], firstRowHeader = true
function table(rows, columnWidths, firstRowHeader = true) {
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0)
  const trs = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => {
      const isHeader = firstRowHeader && ri === 0
      const cellText = typeof cell === 'string' ? cell : cell.text
      const cellOpts = typeof cell === 'string' ? {} : cell
      return new TableCell({
        borders: borders(),
        width: { size: columnWidths[ci], type: WidthType.DXA },
        shading: isHeader
          ? { fill: ACCENT, type: ShadingType.CLEAR }
          : cellOpts.shading || undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({
            text: cellText,
            bold: isHeader || cellOpts.bold,
            color: isHeader ? "FFFFFF" : cellOpts.color,
            size: 20,
          })],
          alignment: cellOpts.align || AlignmentType.LEFT,
        })],
      })
    }),
  }))
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths,
    rows: trs,
  })
}

// ============================================================================
// 문서 1 — 광장 서비스 소개
// ============================================================================

const introChildren = [
  new Paragraph({
    children: [new TextRun({ text: "광장 — 사업 설명회 자료", bold: true, size: 56, color: ACCENT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "서비스 소개 (Detailed Overview)", size: 32, color: MUTED })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }),
  quote('"같은 동네 이웃끼리 부동산·서비스·중고거래·정보·생활 인프라를 한 곳에서 안전하게 주고받는 지역 통합 플랫폼"'),
  spacer(),

  // ── 1. 핵심 컨셉 ──────────────────────
  h1("1. 핵심 컨셉 — \"광장\"이란"),
  h3('"광장 = 지역 단위 작은 도시 플랫폼"'),
  p("다른 플랫폼이 \"전국 1개 서비스\"라면, 광장은 춘천광장·강릉광장처럼 도시·지역 단위로 독립된 미니 플랫폼이 모인 연방형 구조입니다."),
  spacer(),
  table([
    ["항목", "일반 플랫폼 (당근·직방 등)", "광장"],
    ["회원 단위", "전국 통합, 지역 필터만 적용", "광장 단위 회원 — 같은 동네 사람만"],
    ["회원 정체성", "닉네임·프로필 1개 (전국 공통)", "광장마다 다른 닉네임·프로필 가능"],
    ["운영 주체", "본사 단일 운영", "광장 관리자 — 지역 운영진 자율 관리"],
    ["서비스 폭", "1 영역 (중고만, 부동산만)", "부동산 + 홈즈 + 거래 + 커뮤니티 + 생활 인프라 통합"],
    ["지역 정체성", "약함", "강함 — \"춘천 사람만의 광장\""],
  ], [1800, 3780, 3780]),
  spacer(),
  h3("광장 격리 (Plaza Isolation)"),
  p("기술적으로 모든 데이터는 plaza_id 컬럼으로 격리됩니다 (DB · API · UI 3중 차단):"),
  bullet("강릉광장 admin 은 춘천광장 회원 절대 못 봄"),
  bullet("강릉광장에서 등록한 글 → 춘천광장엔 안 보임"),
  bullet("단, 의도적 글로벌 영역: 공동구매·로컬푸드는 \"전체 광장 노출\" 가능 (거래량 확보)"),
  spacer(),
  h3("광장 허브 (Hub)"),
  p("/hub 페이지: 전국의 모든 광장 목록. 사용자는 광장을 골라 입장. 광장 들어가면 그 광장 전용 UI 진입 — 마치 다른 앱 같은 느낌."),

  divider(),

  // ── 2. 전체 구조 ──────────────────────
  h1("2. 전체 서비스 구조 한눈에"),
  table([
    ["분류", "서비스", "비고"],
    ["부동산", "매물 · 구해주세요", "광장 핵심 비즈니스"],
    ["홈즈 (생활 서비스)", "인테리어 · 이사 · 청소 · 수리", "전문가 매칭"],
    ["지역 거래", "중고거래 · 나눔 · 공동구매 · 로컬푸드 · 신장개업 · 구인구직", "공구·로컬푸드는 전체 광장 가능"],
    ["커뮤니티", "게시판 5종 (자유·맛집·생활·일상·QnA) · 모임 (Clubs)", "동네 정체성"],
    ["전문가 매칭", "초대장 시스템 · 구해주세요", "양방향 매칭"],
    ["생활 정보", "뉴스 · 날씨 · 행사 · 주유소 · 화장실", "지역 인프라"],
    ["커뮤니케이션", "채팅 (1:1·그룹·광장간) · 알림 (인앱·푸시·메일)", "Realtime"],
    ["회원", "광장별 프로필 · 포인트 · 구독 · AI 크레딧 · 후기 · 하이라이트", "마이페이지"],
    ["광장 운영", "Admin (회원·신고·통계·콘텐츠·정산·감사로그·헬스체크)", "광장 자율 운영"],
  ], [1800, 5400, 2160]),

  divider(),

  // ── 3. 부동산 ──────────────────────
  h1("3. 부동산 영역"),
  h2("3-1. 매물 (Property)"),
  p([{text: "한 줄 — ", bold: true}, "광장 내 매매·전세·월세·단기 매물 종합 마켓플레이스"]),
  spacer(),
  h3("사용자 흐름"),
  h4("[등록자]"),
  bullet("사진 등록 → 주소 입력 → 지도 핀 자동 (geocode)"),
  bullet("매물 유형 · 거래 유형 · 가격 · 면적 · 옵션 입력"),
  bullet("360° 파노라마 사진 추가 (선택)"),
  bullet("동영상 추가 (선택, AI 영상도 가능)"),
  bullet("등록 완료 → 즉시 광장 매물 리스트 노출"),
  spacer(),
  h4("[구매자]"),
  bullet("매물 리스트 (리스트 / 카드 / 지도 3가지 뷰)"),
  bullet("필터 (매물 유형 × 거래 × 가격 × 면적 × 지역 × 옵션)"),
  bullet("정렬 (최신 / 가격↑↓ / 면적 / 평당가 / 조회 / 찜)"),
  bullet("매물 상세 (사진 갤러리 + 정보 + 지도 + 360° + 판매자)"),
  bullet("전화 / 채팅 / 찜 / 공유 / 신고"),

  spacer(),
  h3("매물 유형·거래 유형"),
  table([
    ["분류", "옵션"],
    ["매물 유형", "아파트 / 빌라 / 오피스텔 / 단독주택 / 상가 / 토지 / 사무실"],
    ["거래 유형", "매매 / 전세 / 월세 / 단기 / 전월세"],
    ["판매자 유형", "공인중개사 / 일반 직거래"],
    ["옵션", "풀옵션 · 주차가능 · 반려동물 · 엘리베이터 · 남향 · 리모델링 · 테라스 등"],
  ], [2160, 7200]),

  spacer(),
  h3("지도 모드 디테일"),
  bullet("Naver Maps Native SDK 사용"),
  bullet("광장 중심 좌표로 워밍업 (앱 시작 시 타일 캐시 prewarm)"),
  bullet("클러스터링 + 가격 라벨 마커"),
  bullet("마커 탭 → InfoWindow 카드 (사진+가격+상세보기)"),
  bullet("위성/일반 토글"),
  bullet("정적 PNG 즉시 표시 → NaverMap 자동 전환 (그리드 차단)"),

  spacer(),
  h2("3-2. 구해주세요 (Property Requests)"),
  p([{text: "한 줄 — ", bold: true}, "매물이 아니라 \"이런 매물 구합니다\" 라는 역방향 요청 시스템"]),
  h4("사용자 흐름"),
  bullet([{text: "구매 희망자: ", bold: true}, "\"동내면 25평 매매 5억 이내 구합니다\" → 글 등록 (이미지 없는 텍스트 위주) → 광장 노출"]),
  bullet([{text: "중개사·매물 보유자: ", bold: true}, "요청 글 조회 → 매칭 매물 댓글 등록 (사진+가격+주소) → 작성자에게 알림 → 채팅 연결"]),
  spacer(),
  h4("상태 관리"),
  table([
    ["상태", "라벨", "색"],
    ["모집중", "open", "초록"],
    ["매칭됨", "matched", "파랑"],
    ["마감", "closed", "회색"],
  ], [2160, 3600, 3600]),
  callout("의도: 일방향(매물 등록 → 구매자 검색) 시장에서 양방향 매칭 가능. 매물이 흔한 지역엔 매매자가 활발, 매물 귀한 지역엔 구매자가 활발. 광장은 양쪽 다 지원."),

  divider(),

  // ── 4. 홈즈 ──────────────────────
  h1("4. 홈즈 — 생활 서비스"),
  p("광장 내 전문가 서비스 4종 (홈즈 = 홈 서비스). 각 서비스가 독립된 마켓플레이스."),
  spacer(),
  table([
    ["서비스", "주요 기능 / 입력 필드"],
    ["인테리어", "포트폴리오 (전후 사진), 전문 분야 (아파트·빌라·상가·부분), 서비스 영역, 평당 단가, 영업 시간"],
    ["이사", "이사 유형 (포장·반포장·일반), 차량 톤 수, 평형별 견적, 비수기/성수기 가격, 작업 가능 거리"],
    ["청소", "청소 유형 (입주·이사·정기·특수), 평수별 견적, 청소 도구 보유, 친환경 인증"],
    ["수리", "수리 카테고리 (전기·설비·도배·바닥·창호·기타), 출장비/시간당 단가, 응급 수리 가능 여부"],
  ], [1800, 7560]),
  spacer(),

  h3("홈즈 공통 기능"),
  h4("후기 시스템"),
  bullet("시공 완료 후 의뢰자가 후기 작성 (사진 첨부 가능)"),
  bullet("별점 1~5 + 텍스트 + 시공 결과 사진"),
  bullet("업체는 사장님 답글 가능"),
  bullet("거짓 후기 신고 가능"),
  spacer(),
  h4("매칭 방식 3가지"),
  num("검색 → 직접 연락 — 사용자가 업체 골라 채팅"),
  num("구해주세요 → 견적 응답 — 사용자가 요청 → 업체들이 견적"),
  num("초대장 → 전문가 매칭 — 사용자가 채팅에서 \"+전문가 초대\" → 인근 N명에게 동시 발송"),

  divider(),

  // ── 5. 지역 거래 ──────────────────────
  h1("5. 지역 거래 영역"),

  h2("5-1. 중고거래 (Secondhand)"),
  h4("카테고리"),
  p("디지털 · 가전 · 가구 · 생활/주방 · 의류 · 뷰티 · 도서 · 취미 · 스포츠 · 반려 · 기타"),
  h4("핵심 기능"),
  bullet("사진 최대 10장"),
  bullet("동(洞) 단위 위치 표시 (\"거두1동\" 식)"),
  bullet("끌어올리기 (Bump) — 24시간마다 1회 무료 + 추가는 결제"),
  bullet("찜 / 숨김 / 신고"),
  bullet("거래 완료 표시 (판매자가 수동)"),
  spacer(),
  h4("거래 상태"),
  table([
    ["상태", "설명"],
    ["판매중 (active)", "현재 거래 가능"],
    ["예약중 (reserved)", "거래 약속 잡힌 상태"],
    ["거래완료 (sold)", "거래 완료"],
    ["숨김 (hidden)", "신고 누적 3회 자동"],
    ["삭제 (deleted)", "관리자/본인 삭제"],
  ], [2880, 6480]),

  spacer(),
  h2("5-2. 나눔 (Sharing)"),
  p([{text: "한 줄 — ", bold: true}, "무료 나눔 전용. 가격 입력 없음."]),
  callout("운영 정책: 영구 무료 (수익화 절대 안 함). 거래 분쟁 시 광장 관리자 중재. 광장 정신 = 공동체 보호."),

  spacer(),
  h2("5-3. 공동구매 (Group Buying)"),
  p([{text: "한 줄 — ", bold: true}, "이웃과 함께 사서 단가↓ (지역 농가·중소기업 ↔ 소비자)"]),
  h4("핵심 기능"),
  bullet("모집 인원 · 마감일 · 정가/공구가 표시"),
  bullet("실시간 참여자 수 (현재 N / 목표 M)"),
  bullet([{text: "광장 노출 옵션: ", bold: true}, "자기 광장만 vs 전체 광장 (cross-plaza)"]),
  bullet("판매자 채팅으로 1:1 문의"),
  bullet("그룹 채팅방 자동 생성 (참여자 전체 + 판매자)"),
  bullet("모집 미달 시 자동 환불"),

  spacer(),
  h2("5-4. 로컬푸드 (Local Food)"),
  p([{text: "차이점 (vs 공동구매) — ", bold: true}, "상시 판매 (재고만 있으면 즉시 결제)"]),
  h4("카테고리"),
  p("농산물 (과일·채소·곡물) · 축산 (한우·돼지·닭·계란) · 수산 · 가공식품 (장·꿀·반찬·김치) · 음료 (전통주·차) · 기타"),
  h4("핵심 기능"),
  bullet("재고 수량 표시 + 자동 카운트"),
  bullet("산지 표시 (○○면 ○○농장)"),
  bullet("농가 인증 뱃지"),
  bullet([{text: "전체 광장 노출 (cross-plaza) — ", bold: true}, "강원도 한우를 서울에서 주문 가능"]),
  bullet("정기 구독 옵션 (매주 · 격주 · 월간)"),
  bullet("배송 옵션: 택배 · 새벽배송 (지역 한정)"),

  spacer(),
  h2("5-5. 신장개업 (New Store)"),
  p("새로 오픈한 동네 가게 30일간 \"신규\" 뱃지 자동, 이후 일반 사업장 카테고리로 자동 전환."),
  h4("카테고리"),
  p("음식점·카페·베이커리 / 미용·네일·마사지 / 의류·잡화 / 학원·교육 / 의료·약국 / 기타"),

  spacer(),
  h2("5-6. 구인구직 (Jobs)"),
  h4("카테고리"),
  p("음식점 (서빙·주방·배달) / 매장 (캐셔·매장 관리) / 사무 (경리·사무직) / 생산 (공장·물류) / 전문직 (간호조무사·미용사) / 기타 (단기·과외·심부름)"),
  h4("핵심 기능"),
  bullet("시급 / 월급 / 일급 / 건당 단가 선택"),
  bullet("근무 요일 (요일별 체크)"),
  bullet("근무 시간 (시작~종료)"),
  bullet("동 단위 위치 (출퇴근 거리 직관)"),
  bullet("\"오늘 구함\" 빠른 등록 (단기 알바)"),

  divider(),

  // ── 6. 생활 정보 ──────────────────────
  h1("6. 생활 정보 영역"),
  table([
    ["서비스", "내용"],
    ["뉴스", "광장 지역 뉴스 자동 수집·분류. coverage 칩 (춘천+홍천+화천+양구+인제). 자동 prefetch."],
    ["관광 달력", "광장 admin 이 직접 행사 등록 (일정·장소·설명·사진)"],
    ["날씨", "광장 중심 좌표 현재 온도 + 7일 forecast"],
    ["주유소", "현재 위치 기반 1km 내 주유소. 브랜드별 색·가격·거리. 카카오/네이버 길찾기 연동"],
    ["공중화장실", "현재 위치 1km 내 공중화장실. 운영 시간·시설. 길찾기 연동"],
  ], [2160, 7200]),

  divider(),

  // ── 7. 커뮤니티 ──────────────────────
  h1("7. 커뮤니티 영역"),
  h2("7-1. 게시판 (Board) — 5종"),
  table([
    ["카테고리", "성격"],
    ["자유", "잡담·일상"],
    ["맛집", "동네 음식점 정보"],
    ["생활", "청소·육아·생활 팁"],
    ["일상", "사진 위주 (인스타 느낌)"],
    ["QnA", "질문·답변"],
  ], [2880, 6480]),
  h4("핵심 기능"),
  bullet("작성: 제목 + 본문 (사진 첨부) + 카테고리"),
  bullet("댓글 / 대댓글 / 좋아요"),
  bullet("핫 게시글 (좋아요·조회 순)"),
  bullet("신고 → admin moderation 큐"),
  bullet("키워드 필터 자동 차단 (admin 설정)"),

  spacer(),
  h2("7-2. 모임 (Clubs)"),
  p("지역 동호회 시스템. 모임 개설 → 가입 신청·승인 → 멤버 채팅방 자동 입장."),
  h4("카테고리"),
  p("운동·등산·자전거 / 독서·글쓰기 / 음악·영화·사진 / 게임·보드게임 / 외국어·스터디 / 봉사 / 기타"),
  h4("핵심 기능"),
  bullet("모임원 그룹 채팅방"),
  bullet("정기 모임 캘린더"),
  bullet("출석 체크 (모임원 점수)"),
  bullet("모임 비용 정산 도구"),
  bullet("사진 갤러리 (모임 기록)"),

  divider(),

  // ── 8. 전문가 매칭 ──────────────────────
  h1("8. 전문가 매칭 — 초대 · 구해주세요"),
  h2("8-1. 전문가 초대 시스템"),
  p([{text: "한 줄 — ", bold: true}, "일반 사용자가 채팅에서 \"전문가 좀 추천해주세요\" 하면, 광장의 전문가들 (공인중개사·인테리어·이사·청소·수리 5종) 에게 동시 초대장이 발송되어 빠르게 견적 모임."]),
  spacer(),
  h4("흐름"),
  num("일반 사용자: 채팅방에서 \"+ 전문가 초대\" FAB 탭"),
  num("카테고리 선택 (인테리어·청소·수리·이사·중개사)"),
  num("인근 전문가 자동 매칭 → 동시에 N명에게 초대장 발송"),
  num("전문가 (인테리어 업체 등): 알림 받음 → /invitations 진입"),
  num("대기/처리 섹션에 초대 표시 → 수락 / 거절"),
  num("수락 시 채팅방 자동 입장 → 견적 제시"),
  callout("의도: 사용자는 일일이 업체 찾을 필요 X. 전문가 풀에 한 번에 요청 → 빠른 견적 비교."),

  divider(),

  // ── 9. 채팅·알림·결제 ──────────────────────
  h1("9. 채팅 · 알림 · 결제"),
  h2("9-1. 채팅 (Chat)"),
  h4("채팅방 유형"),
  table([
    ["유형", "용도"],
    ["1:1 채팅", "매물·중고·서비스 등 모든 거래의 기본"],
    ["그룹 채팅", "모임원 · 공구 참여자"],
    ["광장 간 채팅", "공구·로컬푸드 cross-plaza 거래 시 (강릉 ↔ 춘천)"],
    ["클럽 채팅", "모임 전용 멤버 채팅방"],
  ], [2160, 7200]),
  h4("기능"),
  bullet("실시간 메시지 (Supabase Realtime)"),
  bullet("사진 / 파일 / 위치 공유"),
  bullet("핀 카드 (거래 중인 매물·상품을 채팅방 상단 고정)"),
  bullet("타이핑 인디케이터 (\"상대가 입력 중\")"),
  bullet("읽음 표시"),
  bullet("사용자 차단"),
  bullet("채팅방 내 \"+전문가 초대\" FAB"),
  bullet("안 읽은 메시지 수 (탭 뱃지)"),

  spacer(),
  h2("9-2. 알림 (Notifications)"),
  h4("종류"),
  table([
    ["분류", "예시"],
    ["메시지", "채팅 메시지 도착"],
    ["반응", "좋아요·댓글·찜"],
    ["거래", "매물·중고 거래 진행"],
    ["모임", "가입 승인·정기 모임"],
    ["공구", "모집 마감·출고"],
    ["후기", "후기 받음"],
    ["전문가", "초대 수락/거절"],
    ["운영", "신고 처리 결과·공지사항"],
  ], [2160, 7200]),
  h4("채널"),
  bullet("인앱 알림 (notifications 화면)"),
  bullet("푸시 알림 (Expo Notifications)"),
  bullet("이메일 (선택)"),

  spacer(),
  h2("9-3. 결제 (Payments)"),
  h4("통합 결제 인프라"),
  bullet([{text: "PG: ", bold: true}, "PortOne (구 아임포트) 또는 Toss Payments"]),
  bullet([{text: "결제 수단: ", bold: true}, "카드 / 계좌이체 / 휴대폰 / 카카오페이 / 네이버페이"]),
  bullet([{text: "빌링키 저장 (자동 갱신 구독용)"}]),
  spacer(),
  h4("결제 시점"),
  table([
    ["결제 종류", "시점", "환불"],
    ["공구 참여", "즉시 결제", "모집 미달 시 자동 전액 환불"],
    ["로컬푸드 주문", "즉시 결제", "배송 전 취소 가능"],
    ["구독료 (월정액)", "자동 갱신 (빌링키)", "일할 환불"],
    ["올리기권 (Bump)", "일회성 충전", "사용 후 환불 불가"],
    ["AI 크레딧", "일회성 충전", "7일 내 미사용 환불 가능"],
  ], [2160, 3600, 3600]),
  spacer(),
  h4("구독 결제 흐름"),
  num("사용자 가입 → 6개월 무료 기간 (status=free_period)"),
  num("6개월 후 → 자동 결제 시도 (저장된 빌링키)"),
  num("실패 시 5일 grace period → 카드 등록 안내"),
  num("미해결 시 구독 정지 (서비스 일부 제한)"),

  divider(),

  // ── 10. 회원 ──────────────────────
  h1("10. 회원 / 마이페이지"),
  h2("10-1. 회원가입 / 로그인 (Auth)"),
  h4("가입 방식"),
  bullet("카카오 OAuth (1-tap)"),
  bullet("이메일 가입"),
  spacer(),
  h4("광장 가입 (Plaza Signup)"),
  p([
    "카카오/이메일 가입 후 → 광장 가입 화면 (",
    {text: "/auth/plaza-signup", bold: true},
    ") → 광장 전용 닉네임 + 시/군 선택. ",
    {text: "광장 격리 정책: ", bold: true, color: HIGHLIGHT},
    "카카오 인증 됐어도 각 광장마다 별도 가입 절차 → \"강릉광장에선 다른 사람\" 가능"
  ]),
  spacer(),
  h4("가입 유형"),
  bullet("일반"),
  bullet("공인중개사"),
  bullet("사업자"),
  bullet("인테리어 / 이사 / 청소 / 수리"),
  bullet("생산자 (로컬푸드)"),
  bullet("사업자는 사업자 등록증 인증 (선택)"),

  spacer(),
  h2("10-2. 마이페이지 메뉴"),
  table([
    ["메뉴", "기능"],
    ["프로필 (광장별)", "광장마다 다른 닉네임·아바타·자기소개"],
    ["프로필 편집", "이미지·배경·소개 수정"],
    ["본인 인증 (verify)", "휴대폰 SMS 인증"],
    ["가입 유형 업그레이드", "일반 → 전문가 (사업자 등록증 인증)"],
    ["포인트", "잔액 + 거래 내역 + 적립/사용"],
    ["내 구독 (subscription)", "활성 구독 + 다음 결제일"],
    ["AI 크레딧 (credits)", "동영상 AI 생성용 크레딧"],
    ["정산 (settlement)", "판매자 정산 내역"],
    ["내가 쓴 글 (posts)", "모든 도메인 통합"],
    ["판매 관리 (sales)", "거래 상태별"],
    ["구매 내역 (orders)", "결제 완료 주문"],
    ["내 매물 (properties)", "내가 등록한 매물 관리"],
    ["찜 목록 (favorites)", "찜한 매물·상품"],
    ["최근 본 글 (recent)", "최근 7일"],
    ["후기 (reviews)", "받은 후기 + 작성한 후기"],
    ["하이라이트 (highlights)", "24시간 게시물 (인스타 스토리 식)"],
    ["동영상 (videos)", "AI 생성 영상 모음"],
    ["팔로워 (followers)", "팔로우/팔로잉"],
    ["차단 목록 (blocked)", "차단 회원 관리"],
    ["설정 (settings)", "알림·다크모드·언어·광장 변경·로그아웃·탈퇴"],
  ], [2880, 6480]),

  spacer(),
  h2("10-3. 포인트 시스템"),
  h4("적립"),
  bullet("첫 가입 보너스"),
  bullet("매물·중고 등록"),
  bullet("후기 작성"),
  bullet("추천 가입 (친구 초대)"),
  bullet("활동 (댓글·좋아요)"),
  bullet("광장 이벤트 참여"),
  h4("사용"),
  bullet("올리기 (Bump)"),
  bullet("할인 쿠폰 교환"),
  bullet("AI 크레딧 변환"),
  bullet("광장 굿즈 교환 (Phase 2)"),
  h4("신뢰도 점수 (Reputation Score)"),
  bullet("활동·후기·신고 이력 기반 자동 계산"),
  bullet("일정 이하 시 활동 제한"),

  spacer(),
  h2("10-4. 사업자 가입 (계정 유형 업그레이드)"),
  num("일반 회원 → 마이페이지 → 가입 유형 업그레이드"),
  num("카테고리 선택 (공인중개사 · 인테리어 등)"),
  num("사업자 정보 입력 (등록번호 · 상호 · 주소)"),
  num("사업자 등록증 사진 업로드"),
  num("admin 승인 큐에 진입 → 광장 관리자 검토 (보통 1~2일)"),
  num("승인 → 사업자 전용 기능 활성화 (무제한 등록 · 사업자 뱃지 · 우선 노출)"),

  divider(),

  // ── 11. 광장 관리자 ──────────────────────
  h1("11. 광장 관리자 (Admin)"),
  h2("11-1. 권한 구조"),
  table([
    ["계층", "권한"],
    ["글로벌 슈퍼관리자", "광장 생성·승인, 광장 간 정산, 모든 광장 admin 접근"],
    ["광장 관리자 (super)", "광장 내 모든 권한"],
    ["광장 관리자 (admin)", "일반 운영 (회원·신고·콘텐츠·통계)"],
    ["광장 관리자 (moderator)", "신고·콘텐츠 한정"],
  ], [3000, 6360]),

  spacer(),
  h2("11-2. Admin 페이지 메뉴 (총 30+ 항목)"),
  h3("메인 대시보드"),
  bullet("광장 회원 수 / 신규 가입 (7일 sparkline)"),
  bullet("카테고리별 매물·중고·공구 통계"),
  bullet("신고 처리 큐 카운트"),
  bullet("KPI 카드"),
  spacer(),
  h3("회원 관리"),
  bullet("회원 리스트 (광장 STRICT overlay)"),
  bullet("검색 (닉네임·이름·전화)"),
  bullet([{text: "사용자 차단·정지 (Ban / Suspend) — ", bold: true}, "영구·30일·7일 등 + 사유 + 해제"]),
  bullet("가입 유형 변경 · 권한 변경"),
  bullet("쪽지·푸시 발송 (개별/전체)"),
  bullet("가입 유형 신청 처리 (account-requests)"),
  spacer(),
  h3("콘텐츠 관리"),
  bullet("게시판 (5종) · 1:1 문의 · 공지·FAQ · 홈 배너 · 페이지 히어로 · 팝업"),
  spacer(),
  h3("신고 / 모더레이션"),
  bullet("신고 큐 (pending / resolved / dismissed)"),
  bullet("누적 3회 자동 숨김"),
  bullet("키워드 필터 (자동 차단)"),
  bullet("작업: 글 숨김 / 복원 / 영구 삭제 / 무시"),
  spacer(),
  h3("매물 관리"),
  bullet("매물 전체 / 추천(highlight) / 신고된 매물 / 가짜 매물 검출"),
  spacer(),
  h3("정산 (Billing)"),
  bullet("광장 매출 현황"),
  bullet("사업자 구독료 수금 내역"),
  bullet("Cross-plaza 거래 수수료"),
  bullet("광장 ↔ 본사 정산 분배"),
  spacer(),
  h3("통계 (Statistics)"),
  bullet("방문자 / 매물 / 거래 / 인기 검색어 / 지역별 활동"),
  bullet("통합 overview 페이지"),
  spacer(),
  h3("설정"),
  bullet("기본 설정 (사이트명·로고·연락처)"),
  bullet("카테고리·지역 관리"),
  bullet("권한 매트릭스 (permissions)"),
  bullet("다중 관리자"),
  bullet("점검 모드 (maintenance)"),
  bullet("이벤트 / 배너 / 팝업"),
  spacer(),
  h3("운영 인프라 (최신 추가)"),
  bullet([{text: "감사 로그 (Audit Log) — ", bold: true}, "admin 모든 변경 행위 기록 (불변)"]),
  bullet([{text: "글로벌 검색 — ", bold: true}, "회원·매물·게시글 통합 (admin 헤더)"]),
  bullet([{text: "시스템 헬스 체크 — ", bold: true}, "DB·Storage·Naver API 상태"]),
  bullet([{text: "세션 모니터링 — ", bold: true}, "로그인 추적 + 강제 로그아웃 (super 전용)"]),
  bullet([{text: "광장 점프 (Plaza Switcher) — ", bold: true}, "super 가 다른 광장 admin 1-click 이동"]),
  bullet([{text: "권한 매트릭스 시각화 — ", bold: true}, "admin × 광장 × 권한 표"]),

  divider(),

  // ── 12. 기술 ──────────────────────
  h1("12. 기술 / 운영 기반"),
  table([
    ["영역", "기술"],
    ["모바일", "React Native + Expo SDK 54, Expo Router, iOS·Android, OTA 업데이트 (EAS Update)"],
    ["웹", "Next.js 14 (App Router), SSR + RSC, Vercel 자동 배포, 반응형 (모바일·태블릿·PC)"],
    ["백엔드", "Supabase (PostgreSQL 15), Row Level Security (RLS), Realtime, Edge Functions, Storage"],
    ["지도", "네이버 지도 Mobile Native SDK + Static Maps API (CDN 30일 캐시)"],
    ["결제", "PortOne / Toss Payments (카드·계좌·휴대폰·카카오페이·네이버페이·빌링키)"],
    ["알림", "Expo Push + 인앱 + 이메일"],
    ["인증", "Supabase Auth (이메일·카카오 OAuth), 휴대폰 SMS (KT)"],
    ["외부 API", "다음 우편번호 · 네이버 Geocode · 정부 공공데이터 (주유소·화장실)"],
  ], [1800, 7560]),

  spacer(),
  h3("광장 격리 (3중 차단)"),
  num("DB 차원 — RLS 정책으로 plaza_id 안 맞는 row 못 읽음"),
  num("API 차원 — 모든 admin API 가 현재 광장 컨텍스트 검증"),
  num("UI 차원 — 화면 쿼리에 .eq(\"plaza_id\", plaza) 명시"),
  num("+ STRICT overlay — plaza_profiles 행 없으면 사용자 자체가 안 보임 (다른 광장 닉네임 누출 방지)"),

  spacer(),
  h3("안전성"),
  bullet("신고 시스템 (3회 자동 숨김)"),
  bullet("키워드 자동 차단"),
  bullet("사용자 차단·정지 (광장 admin 권한)"),
  bullet("감사 로그 (모든 admin 행위 불변 기록)"),
  bullet("광장 간 정보 격리 (RLS + 응용 + UI 3중)"),

  divider(),

  // ── 결론 ──────────────────────
  h1("광장이 만드는 것"),
  table([
    ["중앙집중형 거대 플랫폼", "광장"],
    ["당근·직방·네이버 — 본사가 모든 정책 결정, 알고리즘이 추천", "각 동네 광장 관리자가 자율적으로 이웃의 데이터를 신뢰 기반으로 관리"],
    ["전국 1억명 중에 매칭", "광장당 1만 ~ 10만명 중에 매칭 — 진짜 우리 동네 사람만"],
    ["광고 매출 → 본사로", "수익 60~80% 광장 관리자로 — 광장이 자기 동네에 재투자"],
  ], [4680, 4680]),
  spacer(),
  quote("광장은 연방형 지역 플랫폼. 본사는 결제·기술·인프라만 책임지고, 각 광장이 자기 동네 색깔로 운영합니다."),
]

const introDoc = new Document({
  styles: STYLES,
  numbering: NUMBERING,
  sections: [{ properties: { page: PAGE }, children: introChildren }],
})

// ============================================================================
// 문서 2 — 수익 구조
// ============================================================================

const revenueChildren = [
  new Paragraph({
    children: [new TextRun({ text: "광장 — 사업 설명회 자료", bold: true, size: 56, color: ACCENT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "수익 구조 (Revenue Model)", size: 32, color: MUTED })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }),
  quote('"광장 단위로 회원이 모이면, 그 광장의 거래·노출·서비스가 수익이 되고, 광장 관리자가 자기 광장에서 수익을 가져간다."'),
  spacer(),

  // ── Phase 0 ──────────────────────
  h1("Phase 0 — 오픈 6개월 (회원 모집 무료)"),
  callout("목표: 광장당 활성 회원 임계점 확보 (예: 1,000명 이상)"),
  p("이 기간엔 회원 모집이 최우선. 모든 사용자 기능은 무료. 수익원은 최소화."),
  spacer(),
  table([
    ["수익원", "부담자", "단가 (예시)", "비고"],
    ["로컬푸드 거래 수수료", "판매자", "거래액의 5%", "농가 직거래 마진 보전"],
    ["공동구매 수수료", "판매자", "거래액의 5%", "단가↓ 효과로 상쇄"],
    ["배너 광고", "광고주", "광장 회원 수 기반 변동", "광장 허브 + 광장별"],
  ], [2880, 1440, 2880, 2160]),
  callout("의도: Phase 0 의 작은 수익은 사실상 운영비 보전용. 진짜 목표는 광장별 회원 수 임계점 도달."),

  divider(),

  // ── Phase 1 ──────────────────────
  h1("Phase 1 — 6개월 후 유료화 (회원 안정화)"),
  callout("목표: 광장당 사업자 회원으로 안정 매출 확보"),

  spacer(),
  h2("1) 사업자 월 회비 (광장별 차등)"),
  table([
    ["도메인", "월 회비 (정가)", "얼리버드 락인 (6개월 내 가입)", "대상"],
    ["공인중개사 (realtor)", "50,000원", "25,000원 (50% 평생)", "부동산 무제한 등록 + AI 가격추정"],
    ["서비스 업종 (인테리어)", "19,000~30,000원", "9,500~15,000원", "광장당 동종업종 노출 한도"],
    ["서비스 업종 (이사)", "동일", "동일", "AI 자동 견적 우선 노출"],
    ["서비스 업종 (청소)", "동일", "동일", ""],
    ["서비스 업종 (수리)", "동일", "동일", ""],
    ["신장개업 (newstore_basic)", "무료 (등록만)", "—", "노출 부스트는 별도 결제"],
  ], [2520, 1800, 2160, 2880]),
  callout("얼리버드 락인 — 6개월 안에 가입한 사용자는 평생 50% 할인 (subscriptions 테이블 is_early_bird 컬럼)"),
  spacer(),
  h4("왜 광장별 차등?"),
  p("큰 광장(춘천 같은 시 단위)은 회원·매물 풀이 크니 5만원 적정. 작은 광장(읍·면 단위)은 회원 적으니 2~3만원으로 차등 가능 → 광장 단위로 가격 결정권을 광장 관리자에게 위임."),

  spacer(),
  h2("2) 매물·서비스 \"올리기 (Bump)\" 추가 결제"),
  table([
    ["패키지", "예상 단가", "효과"],
    ["1회 즉시 끌어올리기", "1,000원", "리스트 상단 (24h)"],
    ["7일 패키지 (7회)", "5,000원", "리스트 상단 (7일간)"],
    ["30일 패키지 (30회)", "15,000원", "리스트 상단 (1개월간)"],
    ["상위 노출 (Highlight)", "30,000원/일", "도메인 페이지 최상단 고정"],
  ], [2880, 2160, 4320]),
  callout("의도: 사업자 회비 외에 일반 사용자도 작은 단위로 결제 → 가벼운 수익 다변화"),

  spacer(),
  h2("3) 배너 광고 (광장별 단가 차등)"),
  p("광장의 가입자 수 · 일일 방문자 수 (DAU) 에 따라 단가 자동 조정:"),
  table([
    ["광장 규모", "DAU 기준", "일 노출 단가 (예시)", "월 매출 (10건 동시 노출 가정)"],
    ["5,000명 미만", "DAU 500", "5,000원/일", "150만원"],
    ["5,000 ~ 20,000명", "DAU 2,000", "20,000원/일", "600만원"],
    ["20,000명 이상", "DAU 10,000", "50,000원/일", "1,500만원"],
  ], [1800, 1440, 2520, 3600]),
  callout("의도: 광장이 클수록 광고 효과 ↑ → 비례 단가. 광장 관리자에게 영업 인센티브."),

  spacer(),
  h2("4) Cross-plaza 거래 수수료 (공구·로컬푸드 핵심)"),
  spacer(),
  p([
    {text: "흐름: ", bold: true},
    "판매자(춘천광장) → 구매자(강릉광장) — 춘천광장이 수수료 가져감 (판매자 부담), 구매자(강릉광장) = 수수료 부담 X"
  ]),
  spacer(),
  h4("왜 이렇게?"),
  bullet("광장만 갇혀있으면 거래량 부족 → cross-plaza 허용으로 거래 활성화"),
  bullet("수수료는 판매자 광장이 회수 → 판매자가 노출 광장에 비용 지불 (광고 효과)"),
  bullet("구매자는 수수료 부담 0 → 구매 진입장벽 ↓"),
  spacer(),
  h4("수수료율"),
  table([
    ["단계", "수수료율", "근거"],
    ["Phase 0", "5%", "도입 단가"],
    ["Phase 1 (유료화 후)", "5%", "사용자 부담 일관성 유지"],
    ["Phase 2 (안전결제 도입)", "추가 2~3%", "에스크로·분쟁 처리 비용"],
  ], [3000, 2160, 4200]),

  divider(),

  // ── Phase 2 ──────────────────────
  h1("Phase 2 — 확장 (회원 충성도 ↑ 시점)"),
  h2("추가 수익원 후보"),
  table([
    ["후보", "설명", "잠재 매출", "위험도"],
    ["광장 허브 배너 광고", "전체 광장 통합 페이지의 배너 (전국 노출)", "대", "저"],
    ["중고거래 안전결제", "에스크로 + 수수료 (1~3%)", "중", "고 ← 업자 침투"],
    ["홈 탭 선노출 상품", "각 도메인 상단 고정 노출 (매물·홈즈·공구·로컬푸드·신장개업)", "중", "저"],
    ["부동산 거래 성사 수수료", "거래 성사 시 별도 (선택형)", "대", "중 (분쟁)"],
    ["광장 단위 광고 패키지", "\"○○동 학원 광고 1주\" 식 패키지", "중", "저"],
    ["유료 가입 — 프리미엄", "광고 제거·뱃지·할인", "소", "저"],
  ], [2520, 4320, 1080, 1440]),

  spacer(),
  h2("안전거래 도입 시 고려사항"),
  callout("업자 침투 위험 — 중고거래 안전결제 도입 시 전문 셀러·업자가 동네 거래에 침투할 수 있음 → 일반 회원 이탈 가능성", HIGHLIGHT),
  h4("대응책 후보"),
  bullet("1일 거래 건수 제한 (3~5건/일)"),
  bullet("신원 인증 강제 (사업자 등록증 = 별도 마켓 분리)"),
  bullet("\"광장 회원 전용\" vs \"일반 마켓\" 분리 운영"),

  spacer(),
  h2("도입 안 할 영역"),
  callout("나눔 — 비영리 의도. 광장 정신 보호. 수익화 시 광장 신뢰 ↓.", HIGHLIGHT),

  divider(),

  // ── AI 크레딧 ──────────────────────
  h1("AI 크레딧 (별도 수익원)"),
  p([
    "매물 사진 → AI 영상 자동 생성 기능. 사용자가 크레딧 충전 후 사용. ",
    {text: "현재 BETA 무료 지급", bold: true, color: HIGHLIGHT},
    ", 정식 결제는 Phase 1 이후 PortOne 연동."
  ]),
  spacer(),
  table([
    ["상품", "크레딧", "가격", "비고"],
    ["1 크레딧", "1", "5,900원", ""],
    ["5 크레딧", "5", "25,000원", "가장 인기"],
    ["10 크레딧", "10", "45,000원", "최대 할인"],
  ], [2160, 1800, 2160, 3240]),

  divider(),

  // ── 시뮬레이션 ──────────────────────
  h1("수익 시뮬레이션 — 춘천광장 가정"),
  h2("가정"),
  table([
    ["항목", "수치"],
    ["광장 회원", "10,000명"],
    ["부동산 사업자 회원", "30명"],
    ["홈즈 4종 사업자 (각 20명)", "80명"],
    ["광고주 (월)", "5건 × 30일 × 평균 20,000원"],
    ["공구·로컬푸드 월 거래액", "5,000만원"],
    ["Bump 결제 (월)", "100건 × 평균 10,000원"],
  ], [3600, 5760]),

  spacer(),
  h2("Phase 1 월 매출 추정"),
  table([
    ["항목", "계산", "매출"],
    ["부동산 회비", "30 × 50,000원", "1,500,000"],
    ["홈즈 회비 (4종)", "80 × 30,000원", "2,400,000"],
    ["배너 광고", "5건 × 30일 × 20,000원", "3,000,000"],
    ["Cross-plaza 수수료", "5,000만 × 5%", "2,500,000"],
    ["Bump 결제", "100 × 10,000원", "1,000,000"],
    [{text: "합계 (월)", bold: true}, "", {text: "10,400,000원", bold: true, color: ACCENT}],
  ], [2880, 3600, 2880]),

  spacer(),
  callout("한 광장당 월 1,000만원 이상. 10개 광장 확장 시 월 1억 (단순 비례 가정).", ACCENT),

  spacer(),
  h2("Phase 2 추가 (안전결제 도입 시)"),
  bullet([{text: "중고거래 안전결제 거래액 월 3,000만 × 2% = ", bold: true}, "60만원/월/광장"]),
  bullet("광장 허브 배너 = 본사 직접 매출 (광장 비례 안 함)"),

  divider(),

  // ── 광장 ↔ 본사 정산 ──────────────────────
  h1("광장 ↔ 본사 정산 (제안)"),
  p("각 광장에서 발생한 매출의 일부는 본사 운영비 + 인프라:"),
  spacer(),
  table([
    ["광장 매출", "본사 분배", "광장 관리자 분배", "근거"],
    ["회비 (부동산·홈즈)", "30%", "70%", "광장 운영진 영업 유도"],
    ["배너 광고", "20%", "80%", "광장 직접 영업"],
    ["Cross-plaza 수수료", "40%", "60% (판매자 광장)", "본사 인프라 + 광장"],
    ["Bump 결제", "30%", "70%", "광장 인프라 사용"],
    ["AI 크레딧", "70%", "30%", "본사 GPU 비용 큼"],
    ["Plaza 허브 광고", "100%", "0%", "본사 직접 매출"],
  ], [2520, 1440, 2160, 3240]),
  callout("의도: 광장 관리자가 직접 영업하고 수익을 가져가는 구조. 본사는 인프라·결제·기술만 책임.", ACCENT),

  divider(),

  // ── 핵심 메시지 ──────────────────────
  h1("핵심 메시지"),
  num([{text: "6개월 무료 → 회원 확보 후 점진 유료화 — ", bold: true}, "사용자 신뢰 우선"]),
  num([{text: "광장별 차등 단가 — ", bold: true}, "광장 크기·활성도에 맞는 가격 → 광장 관리자 자율"]),
  num([{text: "판매자가 부담 → 구매자 진입장벽 ↓ — ", bold: true}, "거래 활성화가 모든 것의 출발"]),
  num([{text: "나눔은 영구 무료 — ", bold: true}, "공동체 정신 보호 (브랜드 가치)"]),
  num([{text: "광장 관리자 = 영업 인센티브 — ", bold: true}, "본사 매출의 60~80% 광장 분배 → 광장 운영 동기 부여"]),
  num([{text: "얼리버드 락인 — ", bold: true}, "6개월 내 가입자 평생 50% 할인 → 초기 가입 인센티브"]),

  divider(),

  // ── 로드맵 ──────────────────────
  h1("로드맵 요약"),
  table([
    ["기간", "단계", "주요 활동"],
    ["오픈 ~ 6개월", "Phase 0", "회원 모집 무료, 운영비 보전 수익만, 광장당 1,000명 목표"],
    ["6개월 ~ 12개월", "Phase 1", "사업자 회비 유료화, Bump·배너·cross-plaza 수수료 도입"],
    ["12개월 ~", "Phase 2", "안전결제 / 광장 허브 광고 / 홈탭 선노출 / 거래 성사 수수료 도입 검토"],
    ["18개월 ~", "확장", "광장 신규 오픈 (전국 시·군), 광장 허브 정식 운영"],
  ], [2160, 1440, 5760]),
]

const revenueDoc = new Document({
  styles: STYLES,
  numbering: NUMBERING,
  sections: [{ properties: { page: PAGE }, children: revenueChildren }],
})

// ── 파일 저장 ──────────────────────────
async function main() {
  const outDir = __dirname
  const introBuf = await Packer.toBuffer(introDoc)
  fs.writeFileSync(path.join(outDir, '광장-서비스-소개.docx'), introBuf)
  console.log('✅ 광장-서비스-소개.docx 생성')

  const revBuf = await Packer.toBuffer(revenueDoc)
  fs.writeFileSync(path.join(outDir, '광장-수익구조.docx'), revBuf)
  console.log('✅ 광장-수익구조.docx 생성')
}

main().catch(err => { console.error(err); process.exit(1) })
