/**
 * 보조금24(gov24) 농업 지원사업 → 정부지원금 게시판(board_posts) 자동 등록 — 전국 9개 도.
 *
 * 매일 1회 Vercel Cron 에서 호출 (Authorization: Bearer <CRON_SECRET> 자동).
 * 수동: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/subsidy-sync
 *
 * 동작:
 *   - PROVINCES(9개 도) 순회 → 도별 농업 사업(소관기관명 LIKE '<도>') 수집
 *   - 각 도의 board_categories slug='subsidy' 카테고리에 신규만 INSERT
 *   - source='보조금24', source_id=서비스ID 전역 유니크로 중복 방지
 *   - region = 시군명(있으면) / null(도 전체)
 *
 * ⚠️ 기존 글 절대 수정/삭제 안 함(INSERT only). 봇 author = SUBSIDY_BOT_USER_ID.
 *    미설정 시 안전하게 skip. 실패해도 best-effort(도별 독립 try).
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth } from '@/lib/security/cron-auth'
import {
  PROVINCES,
  collectAgricultureForProvince,
  buildContent,
  regionFromService,
} from '@/lib/services/subsidy-gov24'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const CATEGORY_SLUG = 'subsidy'
const SOURCE = '보조금24'
const AUTHOR_NAME = '보조금24 안내봇'
const PER_PROVINCE_LIMIT = 30

export async function GET(req: Request) {
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const key = process.env.DATA_GO_KR_KEY
  if (!key) return NextResponse.json({ error: 'DATA_GO_KR_KEY 누락' }, { status: 500 })

  const botUserId = process.env.SUBSIDY_BOT_USER_ID
  if (!botUserId) {
    return NextResponse.json(
      { ok: false, skipped: true, reason: 'SUBSIDY_BOT_USER_ID 미설정 (안전하게 skip)' },
      { status: 200 },
    )
  }

  const admin = createAdminClient()
  let totalFetched = 0
  let totalInserted = 0
  const perProvince: any[] = []

  for (const prov of PROVINCES) {
    try {
      // 카테고리 (도별 subsidy)
      const { data: category } = await admin
        .from('board_categories')
        .select('id')
        .eq('plaza_id', prov.plazaId)
        .eq('slug', CATEGORY_SLUG)
        .maybeSingle()
      if (!category) {
        perProvince.push({ plaza: prov.plazaId, skipped: 'no_category' })
        continue
      }

      const services = await collectAgricultureForProvince(key, prov.orgLike, PER_PROVINCE_LIMIT)
      totalFetched += services.length
      if (services.length === 0) {
        perProvince.push({ plaza: prov.plazaId, fetched: 0, inserted: 0 })
        continue
      }

      const ids = services.map((s) => s.서비스ID)
      const { data: existing } = await (admin as any)
        .from('board_posts')
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
        category_id: (category as any).id,
        user_id: botUserId,
        author_name: AUTHOR_NAME,
        title: (s.서비스명 || '농업 지원사업').trim().slice(0, 200),
        content: buildContent(s),
        status: 'active',
        source: SOURCE,
        source_id: s.서비스ID,
        source_url: s.상세조회URL ?? null,
        region: regionFromService(s, prov.sigungu),
      }))
      const { error: insErr, count } = await (admin as any)
        .from('board_posts')
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
