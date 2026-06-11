/**
 * 시군청 게시판 공지 스크래핑 → 공지사항(notices) 시군별 등록.
 *
 * gov24(정부지원금/도 전체 안내)와 별개로, 실제 시군청이 올리는 공지(행사·모집·고시)를
 * 시군 게시판에서 떼와 region=시군 으로 저장 → 그 시군 사용자만 본다.
 *
 * 수동: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/notice-scrape-sync
 * 중복 방지: source='○○군청', source_id=nttNo (notices uq_notices_source)
 * 시군 추가: lib/services/local-gov-notices.ts 의 LOCAL_GOV_BOARDS 에 URL 등록.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth } from '@/lib/security/cron-auth'
import {
  LOCAL_GOV_BOARDS,
  fetchLocalGovNotices,
  buildScrapedContent,
} from '@/lib/services/local-gov-notices'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const PER_BOARD_LIMIT = 30

export async function GET(req: Request) {
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  let totalFetched = 0
  let totalInserted = 0
  const perBoard: any[] = []

  for (const board of LOCAL_GOV_BOARDS) {
    try {
      const notices = (await fetchLocalGovNotices(board)).slice(0, PER_BOARD_LIMIT)
      totalFetched += notices.length
      if (notices.length === 0) {
        perBoard.push({ board: board.name, fetched: 0, inserted: 0 })
        continue
      }

      const ids = notices.map((n) => n.sourceId)
      const { data: existing } = await (admin as any)
        .from('notices')
        .select('source_id')
        .eq('source', board.name)
        .in('source_id', ids)
      const seen = new Set(((existing as any[]) ?? []).map((r) => r.source_id).filter(Boolean))

      const fresh = notices.filter((n) => !seen.has(n.sourceId))
      if (fresh.length === 0) {
        perBoard.push({ board: board.name, fetched: notices.length, inserted: 0 })
        continue
      }

      const rows = fresh.map((n) => ({
        plaza_id: board.plazaId,
        title: n.title.slice(0, 200),
        content: buildScrapedContent(n, board),
        is_pinned: false,
        is_published: true,
        author_id: null,
        source: board.name,
        source_id: n.sourceId,
        region: board.region, // 시군 전용 → 그 시군 사용자만 노출
        ...(n.date ? { created_at: new Date(n.date).toISOString() } : {}),
      }))
      const { error: insErr, count } = await (admin as any)
        .from('notices')
        .insert(rows, { count: 'exact' })
      if (insErr) {
        perBoard.push({ board: board.name, error: insErr.message })
        continue
      }
      totalInserted += count ?? rows.length
      perBoard.push({ board: board.name, region: board.region, fetched: notices.length, inserted: count ?? rows.length })
    } catch (e: any) {
      perBoard.push({ board: board.name, error: e?.message ?? String(e) })
    }
  }

  return NextResponse.json({ ok: true, fetched: totalFetched, inserted: totalInserted, perBoard })
}
