/**
 * POST /api/points/award — 클라이언트에서 활동 후 포인트 적립 호출용.
 *
 * 보안:
 *   1) 본인 user_id 만 적립 가능 (auth 체크).
 *   2) sourceId 가 있으면 — 해당 source 테이블에서 author_id/user_id 가
 *      현재 user 와 일치하는지 검증. 다른 사람 글로 포인트 가로채기 차단.
 *   3) daily.login 은 sourceId 불필요.
 *
 * 추가로 server-side 평가(24h pending → confirmed) 단계에서 한 번 더 검증.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { earn } from '@/lib/services/billing/points'
import { enforceRateLimit } from '@/lib/services/ratelimit'

export const dynamic = 'force-dynamic'

/** rule → (table, ownerColumn) — sourceId 검증용 */
const SOURCE_TABLES: Record<string, { table: string; ownerCol: string }> = {
  'post.create':         { table: 'board_posts',     ownerCol: 'author_id' },
  'comment.create':      { table: 'board_comments',  ownerCol: 'author_id' },
  'property.create':     { table: 'properties',      ownerCol: 'user_id' },
  'secondhand.create':   { table: 'secondhand_items', ownerCol: 'user_id' },
  'sharing.create':      { table: 'sharing_items',   ownerCol: 'user_id' },
  'group_buying.create': { table: 'group_buying',    ownerCol: 'user_id' },
  'local_food.create':   { table: 'local_food_items', ownerCol: 'user_id' },
  'jobs.create':         { table: 'jobs',            ownerCol: 'user_id' },
  'new_store.create':    { table: 'new_stores',      ownerCol: 'user_id' },
  'club.create':         { table: 'clubs',           ownerCol: 'creator_id' },
}

const ALLOWED_RULES = new Set([
  ...Object.keys(SOURCE_TABLES),
  'daily.login', // sourceId 불필요
])

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 도배 방어 — 클라이언트 트리거 적립 호출 제한
  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const body = await request.json().catch(() => ({}))
  const ruleId: string | undefined = body?.ruleId
  const sourceId: string | undefined = body?.sourceId
  const qualityData = body?.qualityData ?? {}

  if (!ruleId || !ALLOWED_RULES.has(ruleId)) {
    return NextResponse.json({ error: 'invalid ruleId' }, { status: 400 })
  }

  // sourceId 소유권 검증 — 다른 사람 글로 포인트 가로채기 방지
  const sourceConfig = SOURCE_TABLES[ruleId]
  if (sourceConfig) {
    if (!sourceId) {
      return NextResponse.json({ error: 'sourceId required' }, { status: 400 })
    }
    const { data: row, error: srcErr } = await (supabase as any)
      .from(sourceConfig.table)
      .select(`id, ${sourceConfig.ownerCol}`)
      .eq('id', sourceId)
      .maybeSingle()
    if (srcErr || !row) {
      return NextResponse.json({ error: 'source not found' }, { status: 404 })
    }
    if ((row as any)[sourceConfig.ownerCol] !== user.id) {
      return NextResponse.json({ error: 'not owner of source' }, { status: 403 })
    }
  }

  const result = await earn({
    userId: user.id,
    ruleId,
    sourceId,
    qualityData,
  })

  return NextResponse.json(result)
}
