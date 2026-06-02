import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/supabase/auth-helpers'
import { checkAdminAuth, getAdminWriteClient } from '@/lib/services/admin-auth'
import { enforceRateLimit } from '@/lib/services/ratelimit'
import { getCurrentPlaza } from '@/lib/plaza/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/billing/bank-account
 * 현재 광장의 정산 계좌 정보 조회.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

    const plaza = await getCurrentPlaza()
    if (!plaza) return NextResponse.json({ error: '광장 정보 없음' }, { status: 400 })

    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', `bank_account_${plaza}`)
      .maybeSingle()

    let bankAccount = { bank_name: '', account_number: '', account_holder: '' }
    if (data?.value) {
      try {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value as string) : data.value
        bankAccount = {
          bank_name: parsed.bank_name || '',
          account_number: parsed.account_number || '',
          account_holder: parsed.account_holder || '',
        }
      } catch { /* ignore parse error */ }
    }

    return NextResponse.json(bankAccount)
  } catch (e: any) {
    console.error('[bank-account GET]', e)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}

/**
 * POST /api/admin/billing/bank-account
 * 정산 계좌 정보 저장. 관리자 인증 + admin write client 사용.
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
    if (!body?.bank_name || !body?.account_number || !body?.account_holder) {
      return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
    }

    const bankAccount = {
      bank_name: String(body.bank_name).slice(0, 50),
      account_number: String(body.account_number).slice(0, 50),
      account_holder: String(body.account_holder).slice(0, 50),
    }

    const admin = await getAdminWriteClient()
    if (!admin) return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })

    const { error } = await admin
      .from('site_settings')
      .upsert({
        key: `bank_account_${plaza}`,
        value: JSON.stringify(bankAccount),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    if (error) {
      console.error('[bank-account POST]', error)
      return NextResponse.json({ error: '저장 실패' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[bank-account POST]', e)
    return NextResponse.json({ error: '처리 실패' }, { status: 500 })
  }
}
