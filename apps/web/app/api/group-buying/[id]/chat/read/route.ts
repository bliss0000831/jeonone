import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'

export const dynamic = 'force-dynamic'

// POST /api/group-buying/[id]/chat/read  —  내 last_read_at 갱신
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await params
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request as any)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const admin = createAdminClient()

  const plaza = await getCurrentPlaza()
  if (plaza) {
    const { data: post } = await admin.from('group_buying_posts').select('plaza_id, visibility').eq('id', postId).maybeSingle()
    if (!post || (post.plaza_id && post.plaza_id !== plaza && post.visibility !== 'national')) {
      return NextResponse.json({ error: '공동구매를 찾을 수 없습니다' }, { status: 404 })
    }
  }
  await admin
    .from('group_buying_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('post_id', postId)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
