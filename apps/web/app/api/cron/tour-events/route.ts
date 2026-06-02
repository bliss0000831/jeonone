/**
 * 한국관광공사 국문관광정보 API → chuncheon_events 자동 수집
 *
 * 매일 새벽 4시(KST) Vercel Cron 에서 호출:
 *   Vercel은 `Authorization: Bearer <CRON_SECRET>` 헤더를 자동으로 붙여줌.
 *
 * 수동 실행(로컬 테스트):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     http://localhost:3000/api/cron/tour-events
 *
 * - areaCode=32 (강원특별자치도)
 * - sigunguCode=1 (춘천시)
 * - 오늘 이후에 시작하는 행사만 upsert
 * - source='tour_api', external_id=contentid 로 중복 방지
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth } from '@/lib/security/cron-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const TOUR_BASE = 'https://apis.data.go.kr/B551011/KorService2'

// 한국관광공사 축제/행사 상세 카테고리(문자열 매칭)로 앱 내부 카테고리 매핑
// (API 는 cat1/cat2/cat3 코드를 주지만 cat2=A0207 '축제' 고정이라 여기선 제목 기반으로 재분류)
function classify(title: string): { category: string; color: string } {
  const s = title
  if (/마라톤|경기|대회|축구|FC/i.test(s)) return { category: 'sports', color: '#ef4444' }
  if (/전시|박물관|미술|공예/i.test(s)) return { category: 'exhibition', color: '#06b6d4' }
  if (/공연|콘서트|음악|극|연주|뮤지컬/i.test(s)) return { category: 'culture', color: '#8b5cf6' }
  if (/장터|마켓|플리|벼룩/i.test(s)) return { category: 'event', color: '#3b82f6' }
  if (/축제|페스티벌/i.test(s)) return { category: 'festival', color: '#6366f1' }
  return { category: 'event', color: '#3b82f6' }
}

function yyyymmdd(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function toISODate(yyyymmdd: string) {
  // '20260519' → '2026-05-19'
  if (!yyyymmdd || yyyymmdd.length !== 8) return null
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

interface TourFestivalItem {
  contentid: string
  title: string
  addr1?: string
  eventstartdate: string
  eventenddate?: string
  firstimage?: string
  mapx?: string
  mapy?: string
  tel?: string
}

async function fetchFestivalPage(
  pageNo: number,
  startDate: string,
  serviceKey: string,
  areaCode: string,
  sigunguCode: string,
) {
  const qs = new URLSearchParams({
    serviceKey,
    numOfRows: '100',
    pageNo: String(pageNo),
    MobileOS: 'ETC',
    MobileApp: 'gwangjang',
    _type: 'json',
    arrange: 'C',           // C: 수정일순 최신
    eventStartDate: startDate,
    areaCode,
    sigunguCode,
  })
  const url = `${TOUR_BASE}/searchFestival2?${qs.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`TourAPI HTTP ${res.status}`)
  const text = await res.text()
  // 공공데이터 API 는 인증 실패 시 XML 로 응답하는 경우가 많음 → 방어
  try {
    const json = JSON.parse(text)
    const body = json?.response?.body
    if (!body) {
      throw new Error(`TourAPI invalid response: ${text.slice(0, 200)}`)
    }
    const items: TourFestivalItem[] = body.items?.item
      ? Array.isArray(body.items.item) ? body.items.item : [body.items.item]
      : []
    return {
      items,
      totalCount: Number(body.totalCount || 0),
      numOfRows: Number(body.numOfRows || 0),
      pageNo: Number(body.pageNo || pageNo),
    }
  } catch (e) {
    throw new Error(`TourAPI parse fail: ${text.slice(0, 200)}`)
  }
}

export async function GET(req: Request) {
  // ── 인증 (fail-closed, timing-safe) ───────────────────
  // CRON_SECRET 미설정 = 공개 상태로 간주 → verifyCronAuth 가 false 반환.
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const key = process.env.DATA_GO_KR_KEY
  if (!key) {
    return NextResponse.json({ error: 'DATA_GO_KR_KEY 누락' }, { status: 500 })
  }

  // ── 광장별 수집 ──────────────────────────────────────
  const today = new Date()
  const startDate = yyyymmdd(today)

  const admin = createAdminClient()

  // 활성 광장 + tour 코드 보유한 광장만 (NULL 이면 SKIP)
  const { data: plazas, error: plazasErr } = await admin
    .from('plazas')
    .select('id, name, tour_area_code, tour_sigungu_code')
    .eq('is_active', true)
    .not('tour_area_code', 'is', null)
    .not('tour_sigungu_code', 'is', null)

  if (plazasErr) {
    return NextResponse.json(
      { error: 'plazas_fetch_failed', detail: plazasErr.message },
      { status: 500 },
    )
  }
  if (!plazas || plazas.length === 0) {
    return NextResponse.json({ ok: true, plazas: 0, results: [] })
  }

  const results: Array<{
    plaza: string
    fetched: number
    upserted: number
    rowCount: number | null
    error?: string
  }> = []

  for (const p of plazas) {
    const collected: TourFestivalItem[] = []
    try {
      for (let page = 1; page <= 5; page++) {
        const { items, totalCount, numOfRows } = await fetchFestivalPage(
          page,
          startDate,
          key,
          p.tour_area_code as string,
          p.tour_sigungu_code as string,
        )
        collected.push(...items)
        if (items.length < numOfRows) break
        if (collected.length >= totalCount) break
      }
    } catch (e: any) {
      results.push({ plaza: p.id, fetched: 0, upserted: 0, rowCount: null, error: e?.message ?? String(e) })
      continue
    }

    if (collected.length === 0) {
      results.push({ plaza: p.id, fetched: 0, upserted: 0, rowCount: 0 })
      continue
    }

    const rows = collected
      .map((it) => {
        const start = toISODate(it.eventstartdate)
        const end = toISODate(it.eventenddate || it.eventstartdate)
        if (!start) return null
        const { category, color } = classify(it.title || '')
        return {
          external_id: String(it.contentid),
          source: 'tour_api',
          plaza_id: p.id,
          title: (it.title || '').trim(),
          description: it.tel ? `문의: ${it.tel}` : null,
          location: it.addr1?.trim() || null,
          event_date: start,
          end_date: end && end !== start ? end : null,
          category,
          color,
          is_active: true,
          link_url: it.contentid
            ? `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${it.contentid}`
            : null,
        }
      })
      .filter(Boolean) as any[]

    // 같은 광장 안에서만 dedup (다른 광장이 같은 external_id 를 가질 일은
    // 거의 없지만 안전하게)
    const seen = new Set<string>()
    const dedup = rows.filter((r) => {
      const key = `${r.plaza_id}:${r.external_id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const { error, count } = await admin
      .from('chuncheon_events')
      .upsert(dedup, { onConflict: 'source,external_id,plaza_id', count: 'exact' })

    if (error) {
      results.push({ plaza: p.id, fetched: collected.length, upserted: 0, rowCount: null, error: "처리에 실패했습니다" })
    } else {
      results.push({ plaza: p.id, fetched: collected.length, upserted: dedup.length, rowCount: count ?? null })
    }
  }

  return NextResponse.json({ ok: true, plazas: plazas.length, results })
}
