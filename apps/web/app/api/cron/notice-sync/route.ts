/**
 * 지자체 안내 자동수집 → 공지사항(notices) 시군별 등록 — 전국 9개 도.
 *
 * 정부24(gov24) 공공서비스에서 도별 "비농업" 생활·복지·안전 안내를 가져와
 * notices 에 region(시군) 태그로 저장. 농업은 정부지원금 게시판이 따로 다룸.
 *
 * ⚠️ 일반 지자체 게시판 공지(행사·모집·고시)는 전국 단일 공개 API가 없어,
 *    지역 태그가 붙는 유일한 정부 공개 API(gov24)를 활용한 "지자체 안내" 자동수집.
 *    실제 시군청 게시판 글은 관리자 수동 작성으로 보완.
 *
 * 수동: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/notice-sync
 * 중복 방지: source='정부24', source_id=서비스ID (notices uq_notices_source)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth } from '@/lib/security/cron-auth'
import {
  PROVINCES,
  collectLocalNoticesForProvince,
  buildNoticeContent,
  regionFromTitle,
} from '@/lib/services/subsidy-gov24'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const SOURCE = '정부24'
const PER_PROVINCE_LIMIT = 50

export async function GET(req: Request) {
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const key = process.env.DATA_GO_KR_KEY
  if (!key) return NextResponse.json({ error: 'DATA_GO_KR_KEY 누락' }, { status: 500 })

  const admin = createAdminClient()
  let totalFetched = 0
  let totalInserted = 0
  const perProvince: any[] = []

  for (const prov of PROVINCES) {
    try {
      const services = await collectLocalNoticesForProvince(key, prov.orgLike, PER_PROVINCE_LIMIT)
      totalFetched += services.length
      if (services.length === 0) {
        perProvince.push({ plaza: prov.plazaId, fetched: 0, inserted: 0 })
        continue
      }

      const ids = services.map((s) => s.서비스ID)
      const { data: existing } = await (admin as any)
        .from('notices')
        .select('source_id')
        .eq('source', SOURCE)
        .in('source_id', ids)
      const seen = new Set(((existing as any[]) ?? []).map((r) => r.source_id).filter(Boolean))

      const newServices = services.filter((s) => !seen.has(s.서비스ID))
      if (newServices.length === 0) {
        perProvince.push({ plaza: prov.plazaId, fetched: services.length, inserted: 0 })
        continue
      }

      const rows = newServices.map((s) => ({
        plaza_id: prov.plazaId,
        title: (s.서비스명 || '지자체 안내').trim().slice(0, 200),
        content: buildNoticeContent(s),
        is_pinned: false,
        is_published: true,
        author_id: null,
        source: SOURCE,
        source_id: s.서비스ID,
        // 제목에 시군명이 있으면 그 시군 전용, 없으면 도 전체(null).
        // (소관기관명=관할청이라 도 전역 사업이 오태깅되던 문제 → 제목 기준으로)
        region: regionFromTitle(s.서비스명 ?? '', prov.sigungu),
      }))
      const { error: insErr, count } = await (admin as any)
        .from('notices')
        .insert(rows, { count: 'exact' })
      if (insErr) {
        perProvince.push({ plaza: prov.plazaId, error: insErr.message })
        continue
      }
      totalInserted += count ?? rows.length
      perProvince.push({ plaza: prov.plazaId, fetched: services.length, inserted: count ?? rows.length })
    } catch (e: any) {
      perProvince.push({ plaza: prov.plazaId, error: e?.message ?? String(e) })
    }
  }

  return NextResponse.json({ ok: true, fetched: totalFetched, inserted: totalInserted, perProvince })
}
