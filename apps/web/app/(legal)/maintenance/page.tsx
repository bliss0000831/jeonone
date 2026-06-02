import { Wrench } from 'lucide-react'
import { getSiteSettings } from '@/lib/services/site-settings'

export const dynamic = 'force-dynamic'

export default async function MaintenancePage() {
  const settings = await getSiteSettings()
  const m = settings.maintenance_settings || {}
  const title = m.title || '사이트 점검 중'
  const message =
    m.message ||
    '더 나은 서비스 제공을 위해 시스템 점검을 진행하고 있습니다.\n잠시 후 다시 이용해 주시기 바랍니다.'
  const contactEmail = m.contact_email || settings.admin_email

  const fmt = (iso?: string) => {
    if (!iso) return null
    try {
      return new Date(iso).toLocaleString('ko-KR')
    } catch {
      return null
    }
  }
  const startAt = fmt(m.start_at)
  const endAt = fmt(m.end_at)

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="inline-flex p-4 rounded-full bg-primary/10">
          <Wrench className="w-12 h-12 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground whitespace-pre-line">{message}</p>
        </div>
        {(startAt || endAt) && (
          <div className="text-sm text-muted-foreground pt-2 border-t">
            <div className="font-medium mb-1">점검 일정</div>
            <div>
              {startAt || '-'} ~ {endAt || '-'}
            </div>
          </div>
        )}
        {contactEmail && (
          <div className="text-sm text-muted-foreground">
            문의: <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a>
          </div>
        )}
      </div>
    </div>
  )
}
