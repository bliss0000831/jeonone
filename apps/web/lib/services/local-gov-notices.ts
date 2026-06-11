/**
 * 시군청 게시판 공지 스크래핑 — eGov 표준프레임워크 게시판(selectBbsNttList.do) 파싱.
 *
 * gov24(정부지원금/도 전체 안내)와 별개로, 실제 시군청이 올리는 공지(행사·모집·고시)를
 * 시군별로 떼와 notices 에 region=시군 으로 저장한다.
 *
 * ⚠️ 사이트별 HTML 구조에 의존 → 깨질 수 있음(best-effort). 표준 eGov 게시판(p-subject)
 *    구조면 그대로 동작. 시군 추가 = LOCAL_GOV_BOARDS 에 URL 등록.
 *
 * 검증: 홍천군 https://www.hongcheon.go.kr/www/selectBbsNttList.do?key=255&bbsNo=1
 *   <td class="p-subject"><a href="...nttNo=NNN...">제목 <span>새글</span></a></td>
 *   <td>부서</td> ... <time datetime="YYYY-MM-DD">
 */

export interface LocalGovBoard {
  plazaId: string   // 광장(도) id
  region: string    // 시군명 (예: '홍천군') — notices.region 으로 저장
  name: string      // 출처명 (예: '홍천군청') — notices.source
  origin: string    // https://www.hongcheon.go.kr
  /** 목록 URL (pageUnit 충분히 크게) */
  listUrl: string
}

export const LOCAL_GOV_BOARDS: LocalGovBoard[] = [
  {
    plazaId: 'gangwon',
    region: '홍천군',
    name: '홍천군청',
    origin: 'https://www.hongcheon.go.kr',
    listUrl: 'https://www.hongcheon.go.kr/www/selectBbsNttList.do?key=255&bbsNo=1&pageUnit=30&pageIndex=1',
  },
]

export interface ScrapedNotice {
  sourceId: string  // nttNo
  title: string
  url: string       // 원문 상세 URL (절대)
  dept: string | null
  date: string | null // YYYY-MM-DD
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** eGov 표준 게시판(p-subject) HTML 파싱 → 공지 목록 */
export function parseEgovBoard(html: string, board: LocalGovBoard): ScrapedNotice[] {
  const out: ScrapedNotice[] = []
  const rows = html.split(/<tr[\s>]/i).slice(1)
  for (const row of rows) {
    const a = /<td[^>]*class="[^"]*p-subject[^"]*"[^>]*>\s*<a\s+href="([^"]*nttNo=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(row)
    if (!a) continue
    const href = decodeEntities(a[1])
    const nttNo = a[2]
    const title = decodeEntities(a[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .replace(/\s*(새\s*글|NEW|HOT)\s*$/i, '') // 목록 아이콘(새글/NEW) 텍스트 제거
      .trim()
    if (!title) continue
    const url = href.startsWith('http')
      ? href
      : `${board.origin}/www/${href.replace(/^\.\//, '')}`
    const date = /<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/i.exec(row)?.[1] ?? null
    // p-subject 다음 첫 <td>텍스트</td> = 부서
    const afterSubject = row.split(/class="[^"]*p-subject[^"]*"[\s\S]*?<\/td>/i)[1] ?? ''
    const dept = (/<td[^>]*>\s*([^<>]+?)\s*<\/td>/i.exec(afterSubject)?.[1] ?? '').trim() || null
    out.push({ sourceId: nttNo, title, url, dept, date })
  }
  return out
}

/** 한 시군청 게시판에서 공지 목록을 가져온다 */
export async function fetchLocalGovNotices(board: LocalGovBoard): Promise<ScrapedNotice[]> {
  const res = await fetch(board.listUrl, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JeonwondiaryBot/1.0)' },
  })
  if (!res.ok) throw new Error(`${board.name} HTTP ${res.status}`)
  const html = await res.text()
  return parseEgovBoard(html, board)
}

/** 스크랩 공지 → notices content 본문 */
export function buildScrapedContent(n: ScrapedNotice, board: LocalGovBoard): string {
  const lines: string[] = []
  if (n.dept) lines.push(`【담당】 ${n.dept}`)
  lines.push(`【출처】 ${board.name} 공지사항`)
  lines.push(`\n원문 보기: ${n.url}`)
  lines.push(`\n— ${board.name} 공지사항에서 자동 수집된 글입니다.`)
  return lines.join('\n')
}
