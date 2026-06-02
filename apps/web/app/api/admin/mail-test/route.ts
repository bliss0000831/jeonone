import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from "@/lib/supabase/auth-helpers"
import { checkAdminAuth } from '@/lib/services/admin-auth'
import { enforceRateLimit } from "@/lib/services/ratelimit"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user } = await getAuthedUser(supabase, request)

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const auth = await checkAdminAuth(supabase, user.id)
    if (!auth.ok) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const limited = await enforceRateLimit(request, "admin-notify", user.id)
    if (limited) return limited

    const { to, subject, body } = await request.json()

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: '수신자, 제목, 내용을 모두 입력해주세요.' },
        { status: 400 }
      )
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json(
        { error: '올바른 이메일 주소가 아닙니다.' },
        { status: 400 }
      )
    }

    const { data: settingsRows } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'smtp_enabled'])

    const smtp: Record<string, any> = {}
    settingsRows?.forEach((row) => {
      try {
        smtp[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
      } catch {
        smtp[row.key] = row.value
      }
    })

    if (!smtp.smtp_host || !smtp.smtp_user) {
      return NextResponse.json(
        {
          error:
            'SMTP 설정이 완료되지 않았습니다. 기본환경설정에서 SMTP 정보를 저장한 후 다시 시도해주세요.',
        },
        { status: 400 }
      )
    }

    // 실제 SMTP 전송은 nodemailer 등 서버 환경에 의존하므로,
    // 여기서는 발송 시도 로그만 기록합니다.
    // [mail-test] 발송 시도 — 디버그 로그 제거됨 (production 노이즈)

    return NextResponse.json({
      ok: true,
      message: 'SMTP 설정이 확인되었습니다. 실제 발송을 위해선 서버 측 메일 전송 모듈(nodemailer 등) 연동이 필요합니다.',
    })
  } catch (error: any) {
    console.error('[mail-test] error', error)
    return NextResponse.json(
      { error: '메일 발송 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
