/**
 * 지자체 안내 자동수집 → 공지사항(notices) 시군별 등록.
 *
 * 정부24(gov24) 공공서비스에서 강원 "비농업" 생활·복지·안전 등 안내를 가져와
 * notices 에 region(시군) 태그로 저장. 농업 지원사업은 정부지원금 게시판이 따로
 * 다루므로 여기선 제외(중복 방지).
 *
 * ⚠️ 일반 지자체 게시판 공지(행사·모집·고시)는 전국 단일 공개 API가 없어 자동화 불가.
 *    여기서는 지역 태그가 붙는 유일한 정부 공개 API(gov24)를 활용한 "지자체 안내" 자동수집.
 *    실제 시군청 게시판 글은 관리자 수동 작성(admin/board/notice)으로 보완.
 *
 * 수동 실행:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notice-sync
 *
 * 중복 방지: source='정부24', source_id=서비스ID (notices uq_notices_source 인덱스)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth } from '@/lib/security/cron-auth'
import {
  collectGangwonLocalNotices,
  buildNoticeContent,
  regionFromService,
} from '@/lib/services/subsidy-gov24'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const PLAZA_ID = 'gangwon'
const SOURCE = '정부24'

export async function GET(req: Request) {
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const key = process.env.DATA_GO_KR_KEY
  if (!key) {
    return NextResponse.json({ error: 'DATA_GO_KR_KEY 누락' }, { status: 500 })
  }

  const admin = createAdminClient()

  try {
    const services = await collectGangwonLocalNotices(key, 80)
    if (services.length === 0) {
      return NextResponse.json({ ok: true, fetched: 0, inserted: 0, skipped: 0 })
    }

    // 이미 등록된 source_id 조회 (중복 방지 + region backfill)
    const ids = services.map((s) => s.서비스ID)
    const { data: existing, error: existErr } = await (admin as any)
      .from('notices')
      .select('id, source_id, region')
      .eq('source', SOURCE)
      .in('source_id', ids)
    if (existErr) {
      return NextResponse.json(
        { ok: false, error: 'existing_fetch_failed', detail: existErr.message },
        { status: 500 },
      )
    }

    type ExistRow = { id: string; source_id: string | null; region: string | null }
    const existingRows = ((existing as ExistRow[] | null) ?? []).filter(
      (r): r is ExistRow => !!r.source_id,
    )
    const seenById = new Map<string, ExistRow>(existingRows.map((r) => [r.source_id as string, r]))

    // 기존 공지 region backfill (계산 시군이 바뀌면)
    let backfilled = 0
    for (const s of services) {
      const row = seenById.get(s.서비스ID)
      if (!row) continue
      const want = regionFromService(s)
      if ((row.region ?? null) === (want ?? null)) continue
      const { error: upErr } = await (admin as any)
        .from('notices')
        .update({ region: want })
        .eq('id', row.id)
      if (!upErr) backfilled++
    }

    const seen = new Set<string>(seenById.keys())
    const newServices = services.filter((s) => !seen.has(s.서비스ID))
    if (newServices.length === 0) {
      return NextResponse.json({
        ok: true,
        fetched: services.length,
        inserted: 0,
        backfilled,
        skipped: services.length,
      })
    }

    const rows = newServices.map((s) => ({
      plaza_id: PLAZA_ID,
      title: (s.서비스명 || '지자체 안내').trim().slice(0, 200),
      content: buildNoticeContent(s),
      is_pinned: false,
      is_published: true,
      author_id: null,
      source: SOURCE,
      source_id: s.서비스ID,
      // 시군 단위면 시군명, 도청/전국이면 null(= 모든 시군 노출)
      region: regionFromService(s),
    }))

    const { error: insErr, count } = await (admin as any)
      .from('notices')
      .insert(rows, { count: 'exact' })
    if (insErr) {
      return NextResponse.json(
        { ok: false, error: 'insert_failed', detail: insErr.message },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      fetched: services.length,
      inserted: count ?? rows.length,
      backfilled,
      skipped: services.length - rows.length,
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'notice_sync_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    )
  }
}
