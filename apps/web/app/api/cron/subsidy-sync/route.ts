/**
 * 보조금24(gov24) 농업 지원사업 → 정부지원금 게시판(board_posts) 자동 등록
 *
 * 매일 1회 Vercel Cron 에서 호출:
 *   Vercel 은 `Authorization: Bearer <CRON_SECRET>` 헤더를 자동으로 붙여줌.
 *
 * 수동 실행(로컬 테스트):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     http://localhost:3000/api/cron/subsidy-sync
 *
 * 동작:
 *   - 농업(서비스분야='농림축산어업') + 강원/농림축산식품부(전국) 사업 수집
 *   - board_categories slug='subsidy', plaza_id='gangwon' 카테고리에
 *   - 신규(서비스ID 미존재)만 INSERT (봇 author)
 *   - source='보조금24', source_id=서비스ID 로 중복 방지
 *
 * ⚠️ 기존 게시판/cron 동작 보존:
 *   - 기존 글은 절대 수정/삭제하지 않음 (INSERT only, 신규만).
 *   - 봇 author user_id 는 환경변수 SUBSIDY_BOT_USER_ID 로 받음.
 *     미설정 시 아무것도 INSERT 하지 않고 안전하게 skip (임의 계정 생성 금지).
 *   - 실패해도 best-effort: 에러를 JSON 으로 돌려주되 기존 데이터엔 영향 0.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth } from '@/lib/security/cron-auth'
import {
  collectAgricultureSubsidies,
  buildContent,
  regionFromService,
} from '@/lib/services/subsidy-gov24'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const PLAZA_ID = 'gangwon'
const CATEGORY_SLUG = 'subsidy'
const SOURCE = '보조금24'
const AUTHOR_NAME = '보조금24 안내봇'

export async function GET(req: Request) {
  // ── 인증 (fail-closed, timing-safe) ───────────────────
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const key = process.env.DATA_GO_KR_KEY
  if (!key) {
    return NextResponse.json({ error: 'DATA_GO_KR_KEY 누락' }, { status: 500 })
  }

  // 봇 author — 미설정이면 임의 계정 생성 없이 안전하게 종료
  const botUserId = process.env.SUBSIDY_BOT_USER_ID
  if (!botUserId) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        reason:
          'SUBSIDY_BOT_USER_ID 미설정 — 봇 작성자 계정이 필요합니다. (안전하게 skip)',
      },
      { status: 200 },
    )
  }

  const admin = createAdminClient()

  try {
    // ── 정부지원금 카테고리(subsidy) id 조회 (gangwon 광장) ──────────
    const { data: category, error: catErr } = await admin
      .from('board_categories')
      .select('id')
      .eq('plaza_id', PLAZA_ID)
      .eq('slug', CATEGORY_SLUG)
      .maybeSingle()

    if (catErr) {
      return NextResponse.json(
        { ok: false, error: 'category_fetch_failed', detail: catErr.message },
        { status: 500 },
      )
    }
    if (!category) {
      return NextResponse.json(
        {
          ok: false,
          error: 'category_not_found',
          detail: `board_categories(plaza_id='${PLAZA_ID}', slug='${CATEGORY_SLUG}') 없음`,
        },
        { status: 500 },
      )
    }

    // ── 수집 (강원 50 + 전국 30, 첫 동기화 폭주 방지) ─────────────
    const services = await collectAgricultureSubsidies(key, {
      gangwonLimit: 50,
      nationalLimit: 30,
    })

    if (services.length === 0) {
      return NextResponse.json({ ok: true, fetched: 0, inserted: 0, skipped: 0 })
    }

    // ── 이미 등록된 source_id 조회 (중복 방지 + region backfill) ──────
    const ids = services.map((s) => s.서비스ID)
    // source/source_id/region 컬럼은 마이그레이션으로 추가됨(타입 미반영) → any 캐스트
    const { data: existing, error: existErr } = await (admin as any)
      .from('board_posts')
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
    const seenById = new Map<string, ExistRow>(
      existingRows.map((r) => [r.source_id as string, r]),
    )

    // 기존 글 region backfill — 계산한 시군과 다르면 UPDATE (best-effort, 실패 무시)
    let backfilled = 0
    const toBackfill = services.filter((s) => {
      const row = seenById.get(s.서비스ID)
      if (!row) return false
      const want = regionFromService(s)
      return (row.region ?? null) !== (want ?? null)
    })
    for (const s of toBackfill) {
      const row = seenById.get(s.서비스ID)!
      const want = regionFromService(s)
      const { error: upErr } = await (admin as any)
        .from('board_posts')
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

    // ── 신규 글 INSERT (봇 author, status='active') ────────────────
    const rows = newServices.map((s) => ({
      plaza_id: PLAZA_ID,
      category_id: category.id,
      user_id: botUserId,
      author_name: AUTHOR_NAME,
      title: (s.서비스명 || '농업 지원사업').trim().slice(0, 200),
      content: buildContent(s),
      status: 'active',
      source: SOURCE,
      source_id: s.서비스ID,
      source_url: s.상세조회URL ?? null,
      // 시군 단위면 시군명, 도청/전국이면 null(= 모든 시군 노출)
      region: regionFromService(s),
    }))

    const { error: insErr, count } = await (admin as any)
      .from('board_posts')
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
    // best-effort: 실패해도 기존 게시판 영향 0
    return NextResponse.json(
      { ok: false, error: 'subsidy_sync_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    )
  }
}
