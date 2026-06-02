import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { banGuardResponse } from '@/lib/services/user-ban-guard'

export const dynamic = 'force-dynamic'

// POST /api/group-buying/[id]/close  —  주최자 수동 마감 → pending_payment
export async function POST(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const banRes = await banGuardResponse(user.id)
  if (banRes) return banRes

  const limited = await enforceRateLimit(request, 'mutate', user.id)
  if (limited) return limited

  const admin = createAdminClient()
  let postQ: any = admin
    .from('group_buying_posts')
    .select('id, user_id, status, plaza_id')
    .eq('id', id)
  if (plaza) postQ = postQ.eq('plaza_id', plaza)
  const { data: post } = await postQ.maybeSingle()
  if (!post) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 })

  // 주최자 or 관리자 — 통합 권한 (legacy + plaza_admins + cross-plaza 차단)
  const { checkAdminAuth, canAccessPlaza } = await import('@/lib/services/admin-auth')
  const auth = await checkAdminAuth(supabase, user.id)
  const postPlaza = (post as any).plaza_id ?? null
  const isAdmin =
    auth.isLegacySuper ||
    (auth.isLegacyAdmin && canAccessPlaza(auth, postPlaza)) ||
    canAccessPlaza(auth, postPlaza)
  if (post.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: '주최자만 마감할 수 있습니다' }, { status: 403 })
  }
  if (post.status !== 'recruiting') {
    return NextResponse.json({ error: '이미 마감된 공동구매입니다' }, { status: 400 })
  }

  const { error } = await admin
    .from('group_buying_posts')
    .update({ status: 'pending_payment' })
    .eq('id', id)
    .eq('plaza_id', (post as any).plaza_id)
  if (error) return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })

  return NextResponse.json({ ok: true, status: 'pending_payment' })
}
