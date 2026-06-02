/**
 * 광장 법적 검토·컴플라이언스 보고서 .docx 생성
 *  - 광장-법적검토-컴플라이언스.docx
 *
 * 실행: node generate-legal-doc.js
 */

const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat,
} = require('docx')

const FONT = "맑은 고딕"
const ACCENT = "1d4ed8"
const HIGHLIGHT = "ef4444"
const MUTED = "64748b"
const LIGHT = "f1f5f9"

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
    ]},
    { reference: "numbers", levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
    ]},
    { reference: "checks", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "☐", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
    ]},
  ]
}

const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] }) }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] }) }
function h3(t) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] }) }
function h4(t) { return new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun(t)] }) }
function p(t, opts = {}) {
  const runs = Array.isArray(t) ? t.map(x => typeof x === 'string' ? new TextRun(x) : new TextRun(x)) : [new TextRun(t)]
  return new Paragraph({ children: runs, spacing: { after: 120 }, ...opts })
}
function bullet(t) {
  const runs = Array.isArray(t) ? t.map(x => typeof x === 'string' ? new TextRun(x) : new TextRun(x)) : [new TextRun(t)]
  return new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs })
}
function check(t) {
  return new Paragraph({ numbering: { reference: "checks", level: 0 }, children: [new TextRun(t)] })
}
function num(t) {
  const runs = Array.isArray(t) ? t.map(x => typeof x === 'string' ? new TextRun(x) : new TextRun(x)) : [new TextRun(t)]
  return new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: runs })
}
function spacer() { return new Paragraph({ children: [new TextRun("")] }) }
function divider() {
  return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 6 } }, spacing: { before: 200, after: 200 } })
}
function quote(t) {
  return new Paragraph({
    children: [new TextRun({ text: t, italics: true, color: MUTED })],
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 12 } },
    spacing: { before: 120, after: 120 },
  })
}
function callout(t, color = ACCENT) {
  return new Paragraph({
    children: [new TextRun({ text: t, bold: true, color })],
    shading: { fill: LIGHT, type: ShadingType.CLEAR },
    spacing: { before: 120, after: 120 },
    indent: { left: 180 },
  })
}
function warning(t) {
  return new Paragraph({
    children: [new TextRun({ text: t, bold: true, color: HIGHLIGHT })],
    shading: { fill: "FEF2F2", type: ShadingType.CLEAR },
    spacing: { before: 120, after: 120 },
    indent: { left: 180 },
  })
}

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
            size: 18,
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
// 본문
// ============================================================================

const children = [
  new Paragraph({
    children: [new TextRun({ text: "광장 법적 검토·컴플라이언스 보고서", bold: true, size: 52, color: ACCENT })],
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "9개 서비스 카테고리 × 18개 법령 정밀 매핑 + 실행 로드맵", size: 26, color: MUTED })],
    alignment: AlignmentType.CENTER, spacing: { after: 400 },
  }),

  warning("⚠️ 면책 고지: 본 보고서는 공개된 한국 법령·행정해석 기반의 일반적 컴플라이언스 가이드이며, 구체적 사안에 대한 법률자문이 아닙니다. 출시 전 반드시 변호사·노무사·세무사 검토를 받으시기 바랍니다. 수치(과태료·SLA 등)는 2024년 말 기준 공개 정보에 근거하며 일부는 추정임을 명시합니다."),

  spacer(),

  // ── 0. 5라운드 진행 기록 ──
  h1("0. 5라운드 검토 진행 기록"),
  table([
    ["R", "검토 내용", "핵심 발견"],
    ["R1", "9개 카테고리 × 18개 법령 매핑", "전자상거래법(통판중개업 신고)·정보통신망법·개인정보보호법은 전 카테고리 공통; 부동산·이사·인테리어/수리·식품·구인구직은 카테고리 고유 법령 중첩 적용. 통판중개 신고는 직전년도 거래 50건/1200만원 미만 면제이나 결제 도입 시 거의 확실히 의무 발생."],
    ["R2", "카테고리별 분쟁·책임 시나리오 도출", "\"단순 중개\" 면책은 거래에 직접 개입(가격 결정·결제 보유·광고 보증) 시 깨짐. 인테리어/이사/수리는 무자격 업체 노출 자체가 위험. 부동산은 비공인중개사 매물 노출 시 표시광고법·중개사법 저촉 가능."],
    ["R3", "면책·고지 문구 초안 작성", "\"통신판매중개자에 불과함\" 단순 명시만으로는 약관규제법 §6(불공정약관) 위험. 정보제공·표시·확인절차를 갖춘 후의 면책만 유효. 카테고리별 차별화된 체크박스 필요."],
    ["R4", "기술·운영 통제 설계", "본인확인(휴대폰 실명)·사업자 진위확인 API(국세청)·자격증 진위확인(공인중개사·건설업)·금칙어 필터(주류·담배·총포·마약·성인·도박)·신고 24시간 SLA·관리자 검수 큐 필요."],
    ["R5", "우선순위 로드맵", "즉시(런칭 전): 약관·개인정보처리방침·통판중개 면책 표시·금칙어 필터·본인확인·신고 채널. 단기(3M): 통판중개업 신고·사업자/자격증 검증·로컬푸드 신고. 중기(6M): 안전결제·미성년 결제 동의·구독해지. 장기(1Y): 자체 분쟁조정·ISMS-P 검토."],
  ], [540, 2700, 6120]),

  divider(),

  // ── 1. 법령 매트릭스 ──
  h1("1. 카테고리별 적용 법령 매트릭스"),
  p([{text: "범례: ", italics: true}, "●필수 적용 / ◐조건부 / ○간접·낮음"]),
  spacer(),
  table([
    ["카테고리", "전상법", "정통망법", "개인정보법", "표광법", "약관법", "청보법", "위치법", "카테고리 고유 법령"],
    ["1. 부동산", "●", "●", "●", "●", "●", "○", "◐", "공인중개사법, 부동산거래신고법, 주택임대차보호법"],
    ["2. 인테리어", "●", "●", "●", "●", "●", "○", "○", "건설산업기본법(실내건축업), 방문판매법"],
    ["3. 이사", "●", "●", "●", "●", "●", "○", "○", "화물자동차운수사업법, 소비자기본법(표준약관)"],
    ["4. 청소", "●", "●", "●", "●", "●", "○", "○", "(자격 의무 낮음)"],
    ["5. 수리", "●", "●", "●", "●", "●", "○", "○", "전기공사업법, 건설산업기본법(설비·도배·바닥)"],
    ["6. 공동구매", "●", "●", "●", "●", "●", "●", "○", "할부거래법, 전자금융거래법, 식품위생법, 제조물책임법"],
    ["7. 로컬푸드", "●", "●", "●", "●", "●", "●", "○", "식품위생법, 식품표시광고법, 농수산물품질관리법, 축산물위생관리법"],
    ["8. 중고거래", "◐", "●", "●", "●", "●", "●", "○", "통신사기피해환급법, 형사법(장물·총포·마약), 동물보호법"],
    ["9. 나눔", "○", "●", "●", "○", "●", "●", "○", "동물보호법, 의약품 무상양도 금지"],
    ["10. 신장개업", "◐", "●", "●", "●", "●", "●", "○", "표시광고법, 업종별 광고규제(의료법·변호사법)"],
    ["11. 모임", "○", "●", "●", "○", "●", "●", "○", "다단계·도박성 모집 금지"],
    ["12. 구인구직", "○", "●", "●", "●", "●", "●", "○", "직업안정법, 근로기준법(연소자), 채용절차법"],
  ], [1200, 540, 540, 720, 540, 540, 540, 540, 4200]),

  spacer(),
  warning("⚠️ 추정: 공동구매·로컬푸드가 본사 결제 PG를 거치면 통신판매중개업자 신고 의무가 발생할 가능성이 매우 높음. 게시판형(외부 결제)일 경우에도 \"거래정보 제공·중개\" 요소로 신고 대상이 될 수 있음 — 공정위 질의·법무 자문 필수."),

  divider(),

  // ── 2. 카테고리별 리스크 ──
  h1("2. 카테고리별 리스크·대응"),
  table([
    ["카테고리", "주요 리스크", "면책 가능성", "핵심 대응"],
    ["부동산", "무자격자 중개(중개사법 §9 위반 방조), 허위매물, 보증금 사기, 전세사기", "조건부 — 단순 게시판형은 면책 여지, 가격/거래 개입 시 불가", "공인중개사 자격증 진위확인, 일반인 매물은 \"직거래·중개사 아님\" 라벨 강제, 허위매물 신고 채널, 전세사기 경고 배너"],
    ["인테리어", "무등록 실내건축업자(건산법 §9 — 1500만원 이상 공사), 하자·계약분쟁, 방판법 14일 청약철회", "조건부", "건설업등록증 진위확인, 표준계약서 권고, 청약철회 안내 의무 표시"],
    ["이사", "무허가 이사업체(화운법), 분실·파손, 이사화물 표준약관 미준수", "조건부", "화물자동차운수사업 허가증 확인, 이사화물표준약관 링크 의무 표시"],
    ["청소", "분실·도난, 가사근로자법, 산재", "가능성 높음", "사업자 진위확인, 분쟁조정 안내"],
    ["수리", "전기공사 무자격(형사처벌), 가스·LP 무자격, 누전·화재 손해", "조건부", "전기·가스 카테고리는 자격증 진위확인 필수, 무자격 게시 자동 차단"],
    ["공동구매", "식품·화장품·의료기기 불법광고, 미배송·환불 지연, 청약철회(7일), 위해식품", "조건부 — 결제 보유 시 책임 ↑", "사업자등록증 검증, 식품/화장품 카테고리 필터, 청약철회 안내, 에스크로 검토"],
    ["로컬푸드", "식품 영업신고 미보유, 원산지·유통기한 미표시, 알레르기 정보 누락, 정기구독 자동연장 분쟁", "조건부 — 식품 안전사고 시 책임 가중", "식품 영업신고증 확인, 원산지·생산자·유통기한 필수 입력, 정기구독 해지 1클릭"],
    ["중고거래", "장물·총포·마약·야생동물·의약품·주류 거래(형사), 사기, 미성년자 거래, 가품", "조건부", "본인확인 필수, 금칙어/금지카테고리 자동 차단, 사기이력 공유(더치트 연동 검토), 경찰청 사이버수사대 안내"],
    ["나눔", "동물 무상양도, 의약품 양도, 미성년자 술·담배", "무상이라도 책임 잔존", "동물·의약품·주류·담배 자동 차단, 본인확인"],
    ["신장개업", "의료·법무·금융 등 업종별 광고법 위반, 허위·과장(표광법 §3)", "조건부", "의료·법무·금융·다단계 카테고리 별도 검수 큐, 광고심의필 번호 입력란"],
    ["모임", "도박·다단계·이성만남·종교 강요, 미성년자 보호, 회비 횡령", "가능성 높음", "신고 채널, 키워드 필터, 회비 결제 미지원 또는 안전결제"],
    ["구인구직", "허위 채용공고(채용절차법 §4의2), 성차별·연령차별, 연소자 야간·유해업종 금지, 보이스피싱·대출사기 위장공고", "조건부 — 무료직업정보제공사업 신고대상 가능성", "사업자등록증 확인, 금지업종 차단, 연소자 표시 의무, 워크넷 신고 채널 안내"],
  ], [1200, 2880, 1620, 3660]),

  spacer(),
  h3("⚠️ 면책 조항의 실질적 유효성 (중요)"),
  warning("\"통신판매중개자에 불과하므로 책임 없음\" 단순 면책은 불공정약관(약관규제법 §6, §7)으로 무효 위험."),
  spacer(),
  p([{text: "유효한 면책 구조 5요소:", bold: true}]),
  num("사전 고지 — 매 거래 화면에 통신판매중개자 지위 명시(전상법 §20)"),
  num("정보 제공 — 판매자 신원정보 확인·제공"),
  num("분쟁 조정 협조 — 거래정보 열람 요구 응답(전상법 §20의2)"),
  num("고의·중과실 면책 제외 — 면책에서 고의·중과실을 제외해야 유효"),
  num("소비자기본권 침해 금지 — 손해배상청구권 전면 배제 조항은 무효"),

  divider(),

  // ── 3. 체크박스 문구 ──
  h1("3. 등록 시 체크박스 문구 (실사용 가능 초안)"),

  h2("3-1. 공통 (모든 카테고리)"),
  check("본인은 만 14세 이상이며, 게시 내용에 대한 민·형사상 모든 책임은 게시자 본인에게 있음을 확인합니다."),
  check("본인은 광장이 통신판매중개자로서 거래 당사자가 아니며, 거래 분쟁의 직접 당사자가 아님을 이해합니다."),
  check("허위·과장·타인 권리침해 게시 시 게시중단·이용제한 및 관계법령에 따른 처벌 대상이 됨에 동의합니다."),

  h2("3-2. 부동산"),
  check("본인은 공인중개사이며 등록번호는 정확합니다. (중개사 선택 시)"),
  check("본인은 소유자 본인 또는 정당한 처분권자이며 직거래임을 확인합니다. (개인 선택 시)"),
  check("매물 정보(면적·층·금액·등기 상태)는 부동산거래신고법 및 표시광고법에 따라 정확히 기재했습니다."),

  h2("3-3. 인테리어·수리"),
  check("1,500만원 이상 공사는 실내건축공사업 등록(건설산업기본법) 보유 업체만 가능함을 이해하며, 본인은 해당 자격을 보유하고 있습니다."),
  check("전기공사·소방·가스 공사는 해당 법령상 자격자만 시공 가능함에 동의합니다."),
  check("방문판매·할부거래 해당 시 소비자 청약철회권(14일/7일)을 보장합니다."),

  h2("3-4. 이사"),
  check("본인은 화물자동차운수사업 허가/신고 보유 업체입니다."),
  check("이사화물 표준약관을 준수하며 손해배상 책임을 부담합니다."),

  h2("3-5. 공동구매·로컬푸드"),
  check("본인은 사업자등록을 보유하며, 식품의 경우 식품 영업신고(통신판매업·식품제조가공업 등)를 완료했습니다."),
  check("식품표시광고법·농수산물품질관리법에 따른 원산지·유통기한·알레르기·영양성분 정보를 정확히 표시합니다."),
  check("결제 후 7일 내 청약철회(전상법 §17)를 보장하며, 식품 등 예외 사유는 사전 고지합니다."),

  h2("3-6. 중고거래"),
  check("본인은 소유자 본인이며 장물·위조품·복제품이 아닙니다."),
  check("의약품·주류·담배·총포·마약·야생동물·성인용품 등 법령상 거래금지 물품이 아닙니다."),

  h2("3-7. 나눔"),
  check("본 나눔물품은 동물(생체)·의약품·주류·담배·식품 변질품이 아닙니다."),

  h2("3-8. 신장개업 (광고)"),
  check("본 광고는 표시광고법 §3(허위·과장 금지)을 준수하며, 의료·금융·법무 등은 해당 업종 광고 사전심의를 받았습니다."),

  h2("3-9. 구인구직"),
  check("본 채용공고는 채용절차법 §4(거짓 채용광고 금지)을 준수하며, 성별·연령·출신 차별 표현을 포함하지 않습니다."),
  check("연소자(만 18세 미만) 채용 시 야간·유해업종 금지(근기법 §65·§70)를 준수합니다."),
  check("보증금·교재구입·대출권유 등 취업사기성 요건이 없음을 확약합니다."),

  divider(),

  // ── 4. 이용약관 조항 ──
  h1("4. 이용약관·개인정보처리방침 필수 조항"),

  h2("4-1. 이용약관 핵심 조항"),

  h4("제○조 (서비스의 지위)"),
  p("회사는 「전자상거래 등에서의 소비자보호에 관한 법률」상 통신판매중개자이며, 회원 상호간의 거래에 있어 거래 당사자가 아닙니다. 다만 회사는 다음 의무를 부담합니다: ①판매자 신원정보 확인·제공, ②분쟁 발생 시 거래정보 제공 및 조정 협조, ③명백히 위법한 게시물에 대한 조치."),

  h4("제○조 (회원의 책임)"),
  p("회원이 게시한 콘텐츠·거래의 적법성, 진실성, 품질, 안전성에 대한 민·형사상 책임은 게시자 본인에게 있습니다. 단, 회사의 고의 또는 중과실로 인한 손해에 대해서는 본 조항이 적용되지 않습니다."),

  h4("제○조 (게시물의 게시중단·삭제)"),
  p("회사는 「정보통신망법 §44의2」(임시조치) 및 본 약관 위반 시 게시물을 임시조치 또는 삭제할 수 있으며, 게시자에게 사후 통지합니다."),

  h4("제○조 (금지행위 및 게시금지물품)"),
  p("회원은 다음 물품·서비스를 게시할 수 없으며 위반 시 즉시 이용제한 됩니다: 주류·담배·의약품·총포도검·마약·야생동물·장물·위조품·성인용품(청소년보호법상)·도박·다단계 권유."),

  h4("제○조 (미성년 회원 보호)"),
  p("만 14세 미만은 가입할 수 없으며, 만 19세 미만은 법정대리인 동의 하에 가입 및 결제가 가능합니다. 청소년유해매체물 카테고리 노출이 제한됩니다."),

  h4("제○조 (청약철회·환불)"),
  p("「전상법 §17」 및 「할부거래법 §8」에 따른 청약철회권은 판매자가 직접 처리하며, 회사는 분쟁 발생 시 조정 협조 의무를 이행합니다."),

  h4("제○조 (광장(지역) 격리)"),
  p("각 광장은 시·군 단위로 회원이 격리되어 운영되며, 거주지 변경 시 광장 이전 절차를 따릅니다."),

  h4("제○조 (분쟁해결 및 관할)"),
  p("분쟁은 콘텐츠분쟁조정위원회/한국소비자원/전자거래분쟁조정위원회 조정을 우선 시도하며, 소송 관할은 회원 주소지 관할 법원으로 합니다(소비자 관할 보호)."),

  h4("제○조 (책임의 제한)"),
  p("회사는 천재지변·회원 귀책·제3자 행위로 인한 손해에 대해 책임지지 않습니다. 단, 「약관규제법 §7」에 따라 고의·중과실 손해는 본 조항에서 제외됩니다."),

  h4("제○조 (약관의 변경)"),
  p("약관 변경 시 시행 7일 전(불리한 변경 시 30일 전) 공지하며, 회원은 거부 시 탈퇴할 수 있습니다."),

  spacer(),
  h2("4-2. 개인정보처리방침 필수 항목"),
  num("처리목적·항목·보유기간 — 카테고리별 구분(예: 결제정보 5년-전상법, 게시물 3년 등)"),
  num("수집 동의 / 제3자 제공 동의 / 마케팅 동의 분리 (개인정보보호법 §22, 2024 개정 반영)"),
  num("위탁업체 명시 (PG, SMS, 본인확인기관, 클라우드)"),
  num("국외이전 동의 (해외 클라우드·CDN 사용 시 — 보호법 §28의8)"),
  num("14세 미만 법정대리인 동의 절차"),
  num("개인정보보호책임자 연락처"),
  num("자동결정·프로파일링 거부권 (2024 개정)"),
  num("이용자 권리(열람·정정·삭제·처리정지) 행사방법"),
  num("안전성 확보조치(암호화·접근통제·로그)"),
  num("위치정보 별도 동의 및 위치정보사업/위치기반서비스사업 신고 여부"),

  divider(),

  // ── 5. 기술·운영 ──
  h1("5. 기술·운영 컴플라이언스 체크리스트"),

  h2("5-1. 본인확인 강제 대상"),
  table([
    ["카테고리", "휴대폰 본인확인", "사업자등록증", "자격증/허가증"],
    ["부동산(중개사)", "●", "●", "● (공인중개사 자격)"],
    ["부동산(직거래)", "●", "—", "—"],
    ["인테리어·수리(1500만원↑)", "●", "●", "● (건설업등록)"],
    ["인테리어·수리(소규모)", "●", "●", "—"],
    ["이사", "●", "●", "● (화운법 허가)"],
    ["청소", "●", "●", "—"],
    ["공동구매 판매자", "●", "●", "● (식품 시 영업신고)"],
    ["로컬푸드 판매자", "●", "●", "● (영업신고·축산물 등)"],
    ["중고·나눔", "●", "—", "—"],
    ["신장개업 광고주", "●", "●", "(업종별)"],
    ["모임 모임장", "●", "—", "—"],
    ["구인구직 사업자", "●", "●", "—"],
    ["구인구직 구직자", "●", "—", "—"],
  ], [2880, 2160, 2160, 2160]),

  spacer(),
  h2("5-2. 자동 필터링 금칙어·금지카테고리 (예시)"),
  bullet([{text: "거래금지: ", bold: true, color: HIGHLIGHT}, "대마, 필로폰, 권총, 실탄, 도검(15cm↑), 마약, LSD, 떨, 작대기, 야동, 성인용품, 콘돔(개봉), 의약품명(처방), 항생제, 비아그라, 시알리스, 야생동물, 천산갑, 멸종위기"]),
  bullet([{text: "주류/담배: ", bold: true}, "소주·맥주·위스키·전자담배·액상·궐련 (미성년 노출 차단 후 성인인증)"]),
  bullet([{text: "사기위험: ", bold: true}, "\"선입금\", \"외부거래\", \"카톡으로\", \"텔레그램\", \"보증금 입금\" (경고)"]),
  bullet([{text: "차별/혐오 (모임·게시판): ", bold: true}, "인종·종교·성별·장애 비하 표현"]),
  bullet([{text: "다단계/도박: ", bold: true}, "\"수당\", \"리쿠르팅\", \"회원가입비\", \"사다리\", \"토토\""]),
  spacer(),
  p([{text: "기술 스택: ", italics: true}, "욕설필터 라이브러리 + 키워드DB + 머신러닝 후행 검수 + 사용자 신고"]),

  spacer(),
  h2("5-3. Admin 검수 프로세스"),
  num("자동 필터 통과 → 즉시 게시 + 후행 검수 큐 (중고·나눔·모임)"),
  num("사전 검수 (게시 전 승인) → 부동산 중개사, 인테리어/수리 자격업체, 로컬푸드, 신장개업 광고, 구인구직 사업자, 공동구매"),
  num("광장 운영자(local admin) + 본사 운영팀 2단계"),
  num("검수 SLA: 영업일 24시간 내"),

  spacer(),
  h2("5-4. 신고·임시조치 처리 SLA"),
  p({text: "(정보통신망법 §44의2 권고기준)", italics: true, color: MUTED}),
  bullet("권리침해 신고 접수 → 24시간 내 임시조치(블라인드) 또는 반박 절차 안내"),
  bullet([{text: "명백한 위법 (마약·총포·미성년 성착취) → ", bold: true, color: HIGHLIGHT}, "즉시 차단 + 경찰청 사이버안전국 신고"]),
  bullet("거래사기 신고 → 48시간 내 거래정보 회신 (피해자/수사기관)"),
  bullet("게시중단 요청자·게시자 양측 통지 의무"),
  bullet("처리 이력 3년 보존 (정통망법 시행령 권고)"),

  spacer(),
  h2("5-5. 동의 이력 보존"),
  bullet("약관·개인정보·마케팅 동의 각각 버전+시간+IP 로그"),
  bullet("보유기간: 회원탈퇴 후 5년 (전자상거래법 §6, 분쟁대비)"),
  bullet("본인확인·법정대리인 동의·결제동의 별도 보존"),

  divider(),

  // ── 6. 실행 로드맵 ──
  h1("6. 실행 우선순위 로드맵"),

  h2("6-1. 즉시 (런칭 전, 필수)"),
  table([
    ["항목", "담당", "비고"],
    ["이용약관·개인정보처리방침·위치정보 동의서 초안 → 변호사 검토", "법무·CEO", "약관규제법 사전 검토"],
    ["통신판매중개자 면책 고지 화면 구현 (전상법 §20)", "FE", "푸터·등록화면·구매화면 3곳"],
    ["휴대폰 본인확인(KISA 본인확인기관 연동)", "BE", "NICE/KMC/SCI"],
    ["만 14세 미만 가입 차단·법정대리인 동의 플로우", "BE/FE", "보호법 §22의2"],
    ["금칙어·금지카테고리 자동 필터 v1", "BE", "키워드DB"],
    ["신고 채널·임시조치 플로우", "FE/운영", "정통망법 §44의2"],
    ["게시금지 물품 안내 (중고·나눔·공구)", "콘텐츠", "도움말 페이지"],
    ["미성년 노출 제어(주류·담배 카테고리)", "BE", "청보법"],
    ["개인정보 처리 위탁 계약 (PG·SMS·CDN)", "법무", "보호법 §26"],
    ["개인정보보호책임자 지정·공시", "경영", "보호법 §31"],
  ], [4320, 1800, 3240]),

  spacer(),
  h2("6-2. 단기 (런칭 후 ~3개월)"),
  table([
    ["항목", "담당"],
    ["통신판매중개업자 신고 (관할 시·군·구청 / 공정거래위)", "법무"],
    ["위치기반서비스사업 신고 (방통위) — 위치정보 활용 시", "법무"],
    ["사업자등록증 진위확인 API (국세청 홈택스 OpenAPI)", "BE"],
    ["공인중개사 자격 검증 (협회 연동 또는 등록증 OCR + 수동검수)", "BE/운영"],
    ["식품 영업신고증 업로드·검수", "운영"],
    ["표준약관 적용: 이사화물표준약관·실내건축공사표준계약서 링크", "콘텐츠"],
    ["청약철회·환불 정책 화면 (공구·로컬푸드 결제 시)", "FE/BE"],
    ["분쟁조정 안내 (한국소비자원·콘텐츠분쟁조정위·전자거래분쟁조정위)", "운영"],
    ["채용절차법 거짓광고 차단 검수(구인구직)", "운영"],
    ["광장 admin 운영 매뉴얼·신고처리 SLA 문서화", "운영"],
  ], [7200, 2160]),

  spacer(),
  h2("6-3. 중기 (~6개월)"),
  table([
    ["항목", "담당"],
    ["안전결제(에스크로) 도입 — 중고·공구 → 전자금융거래법 검토", "BE/법무"],
    ["미성년 결제 법정대리인 동의 시스템 (보호법 §22의2 + 민법 §5)", "BE"],
    ["정기구독 해지 1클릭 (로컬푸드) — 전상법 시행령 개정사항 반영", "FE/BE"],
    ["건설업등록 진위확인 자동화 (키스콘)", "BE"],
    ["화물자동차운수사업 허가 확인 절차", "운영"],
    ["표시광고법 자율심의 가이드라인 (의료·금융·법무 광고)", "법무"],
    ["개인정보 영향평가 (권고)", "법무"],
    ["보이스피싱·전세사기 경고 캠페인 (통신사기피해환급법 안내)", "콘텐츠"],
    ["ADR 채널 연동 (eCRB, 1372 등)", "운영"],
  ], [7200, 2160]),

  spacer(),
  h2("6-4. 장기 (~1년)"),
  table([
    ["항목", "담당"],
    ["ISMS-P 인증 검토 (회원 100만↑ 또는 매출 100억↑ 시 의무)", "보안"],
    ["자체 분쟁조정·신뢰점수 시스템", "PM"],
    ["무료직업정보제공사업 신고 검토 (구인구직 트래픽 증가 시)", "법무"],
    ["약관·개인정보 정책 정기 재검토 (연 1회)", "법무"],
    ["사용자 데이터 국외이전 정책 정비 (글로벌 인프라 사용 시)", "보안"],
    ["자동결정·프로파일링 거부권 UI (보호법 2024 개정)", "FE/BE"],
  ], [7200, 2160]),

  divider(),

  // ── 부록 ──
  h1("부록: 즉시 주의 사항 3가지"),

  warning("⚠️ 1. 통신판매중개업 신고 누락 시 — 전상법 §44 위반으로 1천만원 이하 과태료. 결제·중개 기능 활성화 전 반드시 신고."),

  warning("⚠️ 2. 단순 \"면책\" 약관은 무효 — 정보제공 의무·분쟁조정 협조 의무를 약관과 시스템에 함께 구현해야 면책이 실질적으로 인정됨."),

  warning("⚠️ 3. 카테고리 자체가 위법 방조 위험 — 예: \"전기수리\" 무자격 게시 노출, \"장물성 의심 중고\", \"무허가 이사\" — 카테고리 설계 단계에서 자격증 입력란을 필수화하지 않으면 플랫폼이 방조 책임을 질 가능성. 변호사 검토 후 카테고리 구조 확정 권장."),

  spacer(),
  quote("본 보고서의 모든 법령 조문은 작성일(2026-05-18) 기준 일반 정보이며, 시행령·고시 개정으로 변동 가능. 최종 약관·신고는 변호사·관할관청 확인 후 진행해야 합니다."),
]

const doc = new Document({
  styles: STYLES,
  numbering: NUMBERING,
  sections: [{ properties: { page: PAGE }, children }],
})

async function main() {
  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(path.join(__dirname, '광장-법적검토-컴플라이언스.docx'), buf)
  console.log('✅ 광장-법적검토-컴플라이언스.docx 생성')
}

main().catch(err => { console.error(err); process.exit(1) })
