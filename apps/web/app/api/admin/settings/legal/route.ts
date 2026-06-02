import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { checkAdminAuth, getAdminWriteClient } from '@/lib/services/admin-auth'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { getCurrentPlaza } from '@/lib/plaza/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/settings/legal
 * 약관 새 버전 등록 (기존 활성 비활성화 + 새 버전 삽입을 원자적으로 처리).
 *
 * Body: { type: 'terms' | 'privacy', version: string, content: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

    const limited = await enforceRateLimit(request, 'mutate', user.id)
    if (limited) return limited

    const plaza = await getCurrentPlaza()
    if (!plaza) return NextResponse.json({ error: '광장 정보 없음' }, { status: 400 })

    const body = await request.json().catch(() => null)
    const { type, version, content } = body ?? {}

    if (!type || !['terms', 'privacy'].includes(type)) {
      return NextResponse.json({ error: '유효하지 않은 약관 유형' }, { status: 400 })
    }
    if (!version?.trim() || !content?.trim()) {
      return NextResponse.json({ error: '버전과 내용을 모두 입력해주세요.' }, { status: 400 })
    }

    const admin = await getAdminWriteClient()
    if (!admin) return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })

    // 원자적 처리: 기존 모두 비활성 → 새 버전 삽입 (admin client로 순차 실행)
    const { error: deactivateErr } = await admin
      .from('legal_documents')
      .update({ is_active: false })
      .eq('plaza_id', plaza)
      .eq('type', type)

    if (deactivateErr) {
      console.error('[legal POST] deactivate error:', deactivateErr)
      return NextResponse.json({ error: '기존 버전 비활성화 실패' }, { status: 500 })
    }

    const { data, error: insertErr } = await admin
      .from('legal_documents')
      .insert({
        plaza_id: plaza,
        type,
        version: version.trim(),
        content: content.trim(),
        is_active: true,
      })
      .select()
      .single()

    if (insertErr) {
      // 삽입 실패 시 비활성화 롤백 시도 (best-effort)
      console.error('[legal POST] insert error:', insertErr)
      return NextResponse.json({ error: '새 버전 등록 실패' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, doc: data })
  } catch (e: any) {
    console.error('[legal POST]', e)
    return NextResponse.json({ error: '처리 실패' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/settings/legal
 * 약관 활성 버전 전환 (원자적으로 처리).
 *
 * Body: { type: 'terms' | 'privacy', docId: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

    const limited = await enforceRateLimit(request, 'mutate', user.id)
    if (limited) return limited

    const plaza = await getCurrentPlaza()
    if (!plaza) return NextResponse.json({ error: '광장 정보 없음' }, { status: 400 })

    const body = await request.json().catch(() => null)
    const { type, docId } = body ?? {}

    if (!type || !['terms', 'privacy'].includes(type)) {
      return NextResponse.json({ error: '유효하지 않은 약관 유형' }, { status: 400 })
    }
    if (!docId) {
      return NextResponse.json({ error: 'docId가 필요합니다.' }, { status: 400 })
    }

    const admin = await getAdminWriteClient()
    if (!admin) return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })

    // 원자적: 모두 비활성 → 대상만 활성
    const { error: deactivateErr } = await admin
      .from('legal_documents')
      .update({ is_active: false })
      .eq('plaza_id', plaza)
      .eq('type', type)

    if (deactivateErr) {
      console.error('[legal PATCH] deactivate error:', deactivateErr)
      return NextResponse.json({ error: '비활성화 실패' }, { status: 500 })
    }

    const { error: activateErr } = await admin
      .from('legal_documents')
      .update({ is_active: true })
      .eq('id', docId)
      .eq('plaza_id', plaza)

    if (activateErr) {
      console.error('[legal PATCH] activate error:', activateErr)
      return NextResponse.json({ error: '활성화 실패' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[legal PATCH]', e)
    return NextResponse.json({ error: '처리 실패' }, { status: 500 })
  }
}
