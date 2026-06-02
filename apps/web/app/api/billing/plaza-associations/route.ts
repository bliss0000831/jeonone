import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth, canAccessPlaza } from '@/lib/services/admin-auth'
import {
  createPlazaAssociation,
  approveAssociation,
  getPlazaAssociation,
} from '@/lib/services/billing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/plaza-associations?plazaId=... — 협회 조회.
 * 누구나 본인 광장 협회 정보는 조회 가능 (사업자명 등 공개 정보).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const plazaId = searchParams.get('plazaId')
  if (!plazaId) return NextResponse.json({ error: 'plazaId required' }, { status: 400 })

  const association = await getPlazaAssociation(plazaId)
  if (!association) return NextResponse.json({ association: null })

  // 통장번호 등 민감정보는 가린 채 응답 (관리자만 전체)
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  let canSeeFull = false
  if (user) {
    const auth = await checkAdminAuth(supabase, user.id)
    canSeeFull = auth.ok && canAccessPlaza(auth, plazaId)
  }

  if (canSeeFull) {
    return NextResponse.json({ association })
  }

  // 일반 사용자에게는 공개 정보만
  return NextResponse.json({
    association: {
      id: association.id,
      plaza_id: association.plaza_id,
      business_name: association.business_name,
      ceo_name: association.ceo_name,
      contact_email: association.contact_email,
      status: association.status,
    },
  })
}

/**
 * POST /api/billing/plaza-associations — 협회 신청 (관리자가 등록).
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const required = [
    'plazaId',
    'businessName',
    'businessNumber',
    'ceoName',
    'bankName',
    'bankAccount',
    'bankHolder',
    'contactEmail',
  ]
  for (const k of required) {
    if (!body?.[k]) return NextResponse.json({ error: `${k} required` }, { status: 400 })
  }

  const result = await createPlazaAssociation(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}

/**
 * PATCH /api/billing/plaza-associations — 승인 (관리자).
 * Body: { associationId: string, action: 'approve' }
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { user } = await getAuthedUser(supabase, request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = await checkAdminAuth(supabase, user.id)
  if (!auth.ok) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const associationId = body?.associationId
  if (!associationId) return NextResponse.json({ error: 'associationId required' }, { status: 400 })

  if (body?.action === 'approve') {
    const result = await approveAssociation(associationId, user.id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
