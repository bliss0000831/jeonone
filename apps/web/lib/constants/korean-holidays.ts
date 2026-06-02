// 한국 공휴일 정적 데이터 (공공데이터포털 특일정보 API 결과를 연초에 업데이트해 넣는다)
// 음력 공휴일(설·추석·부처님오신날)은 연도마다 바뀌므로 2~3년치만 관리.
// 달력에서 해당 날짜를 빨간색 + 공휴일명 툴팁으로 표시.

export interface Holiday {
  date: string  // YYYY-MM-DD
  name: string
  isLeapWeek?: boolean  // 대체공휴일 여부
}

export const KOREAN_HOLIDAYS: Holiday[] = [
  // ── 2026 ─────────────────────────────────────────────
  { date: '2026-01-01', name: '신정' },
  { date: '2026-02-16', name: '설날' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-02-18', name: '설날' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-03-02', name: '대체공휴일 (삼일절)', isLeapWeek: true },
  { date: '2026-05-05', name: '어린이날' },
  { date: '2026-05-24', name: '부처님오신날' },
  { date: '2026-05-25', name: '대체공휴일 (부처님오신날)', isLeapWeek: true },
  { date: '2026-06-06', name: '현충일' },
  { date: '2026-08-15', name: '광복절' },
  { date: '2026-08-17', name: '대체공휴일 (광복절)', isLeapWeek: true },
  { date: '2026-09-24', name: '추석' },
  { date: '2026-09-25', name: '추석' },
  { date: '2026-09-26', name: '추석' },
  { date: '2026-10-03', name: '개천절' },
  { date: '2026-10-05', name: '대체공휴일 (개천절)', isLeapWeek: true },
  { date: '2026-10-09', name: '한글날' },
  { date: '2026-12-25', name: '크리스마스' },

  // ── 2027 ─────────────────────────────────────────────
  { date: '2027-01-01', name: '신정' },
  { date: '2027-02-06', name: '설날' },
  { date: '2027-02-07', name: '설날' },
  { date: '2027-02-08', name: '설날' },
  { date: '2027-02-09', name: '대체공휴일 (설날)', isLeapWeek: true },
  { date: '2027-03-01', name: '삼일절' },
  { date: '2027-05-05', name: '어린이날' },
  { date: '2027-05-13', name: '부처님오신날' },
  { date: '2027-06-06', name: '현충일' },
  { date: '2027-08-15', name: '광복절' },
  { date: '2027-08-16', name: '대체공휴일 (광복절)', isLeapWeek: true },
  { date: '2027-09-14', name: '추석' },
  { date: '2027-09-15', name: '추석' },
  { date: '2027-09-16', name: '추석' },
  { date: '2027-10-03', name: '개천절' },
  { date: '2027-10-04', name: '대체공휴일 (개천절)', isLeapWeek: true },
  { date: '2027-10-09', name: '한글날' },
  { date: '2027-10-11', name: '대체공휴일 (한글날)', isLeapWeek: true },
  { date: '2027-12-25', name: '크리스마스' },
]

// 빠른 조회용 Map (date → Holiday)
export const HOLIDAY_MAP: Map<string, Holiday> = new Map(
  KOREAN_HOLIDAYS.map((h) => [h.date, h]),
)

export function getHoliday(dateKey: string): Holiday | undefined {
  return HOLIDAY_MAP.get(dateKey)
}
