// 공공데이터포털 "공중화장실 정보" 춘천시 CSV → chuncheon-toilets.ts 변환
// 실행: node scripts/convert-toilets.mjs <input-csv-path>
import fs from 'fs'
import path from 'path'

const INPUT = process.argv[2] || 'C:/Users/123/Desktop/toilets-raw.csv'
const OUTPUT = path.join(process.cwd(), 'lib', 'chuncheon-toilets.ts')

// --- 간단 CSV 파서 (따옴표 이스케이프 처리) ---
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (ch === '\r') { /* skip */ }
      else field += ch
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// --- 메인 ---
const buf = fs.readFileSync(INPUT)
const text = new TextDecoder('euc-kr').decode(buf)
const rows = parseCSV(text).filter(r => r.length > 5)
const header = rows[0]
const col = (name) => header.indexOf(name)

const iName = col('화장실명')
const iRoad = col('소재지도로명주소')
const iJibun = col('소재지지번주소')
const iLat = col('WGS84위도')
const iLng = col('WGS84경도')
const iOpen = col('개방시간')
const iOpenDetail = col('개방시간상세')
const iDiaper = col('기저귀교환대유무')
const iManNo = col('남성용-대변기수')
const iManUr = col('남성용-소변기수')
const iWomNo = col('여성용-대변기수')
const iManDis = col('남성용-장애인용대변기수')
const iWomDis = col('여성용-장애인용대변기수')
const iManage = col('관리번호')

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null }
function int0(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0 }

function detect24h(openField, detail) {
  const s = (openField || '') + ' ' + (detail || '')
  if (/상시|24시간|24:00.*00:00|00:00\s*[~∼\-]\s*24:00/.test(s)) return true
  return false
}
function cleanHours(openField, detail) {
  const d = (detail || '').trim().replace(/[∼]/g, '~')
  if (d && /\d/.test(d)) return d
  const o = (openField || '').trim()
  if (o && !/^\d+$/.test(o) && o !== '정시' && o !== '상시' && o !== '불규칙') return o
  if (o === '상시') return '24시간'
  if (o === '불규칙') return '비정기 운영'
  return null
}

const toilets = []
const seenIds = new Set()

for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const name = (r[iName] || '').trim()
  const lat = num(r[iLat])
  const lng = num(r[iLng])
  if (!name || !lat || !lng) continue

  // 춘천 좌표 대충 박스 (위도 37.7~38.1, 경도 127.5~127.9) — 비정상 좌표 제거
  if (lat < 37.6 || lat > 38.2 || lng < 127.4 || lng > 128.0) continue

  const manTotal = int0(r[iManNo]) + int0(r[iManUr])
  const womTotal = int0(r[iWomNo])
  const unisex = !(manTotal > 0 && womTotal > 0) // 둘 다 있어야 분리, 아니면 공용/단독 취급
  const hasDisabled = int0(r[iManDis]) + int0(r[iWomDis]) > 0
  const diaperRaw = (r[iDiaper] || '').trim()
  const hasDiaperTable = diaperRaw === 'Y' || diaperRaw === '장애인화장실'

  const open24h = detect24h(r[iOpen], r[iOpenDetail])
  const openingHours = open24h ? null : cleanHours(r[iOpen], r[iOpenDetail])

  const address = ((r[iRoad] || r[iJibun] || '').trim()) || undefined
  const mgmt = (r[iManage] || '').trim()
  const id = mgmt ? `cc-${mgmt}` : `cc-${i}`
  if (seenIds.has(id)) continue
  seenIds.add(id)

  toilets.push({
    id, name, lat, lng, address,
    open24h,
    openingHours,
    unisex,
    hasDiaperTable,
    hasDisabled,
  })
}

// --- TS 파일 생성 ---
const tsBody = `// 춘천시 공중화장실 공공데이터 (공공데이터포털 - 행정안전부)
// 생성: ${new Date().toISOString().slice(0, 10)} / 총 ${toilets.length}곳
// 원본: https://www.data.go.kr/data/15021667/standard.do

export interface Toilet {
  id: string
  name: string
  lat: number
  lng: number
  address?: string
  open24h: boolean
  openingHours?: string | null
  unisex: boolean
  hasDiaperTable: boolean
  hasDisabled?: boolean
}

export const CHUNCHEON_TOILETS: Toilet[] = ${JSON.stringify(toilets, null, 2)}

// Haversine 거리 계산 (km)
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
`

fs.writeFileSync(OUTPUT, tsBody, 'utf8')
console.log(`✓ ${toilets.length}곳 → ${OUTPUT}`)
console.log(`  24시간: ${toilets.filter(t => t.open24h).length}곳`)
console.log(`  기저귀교환대: ${toilets.filter(t => t.hasDiaperTable).length}곳`)
console.log(`  장애인화장실: ${toilets.filter(t => t.hasDisabled).length}곳`)
