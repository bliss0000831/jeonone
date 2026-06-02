import { getSiteSettings } from '@/lib/services/site-settings'
import { AnnouncementBarClient } from './announcement-bar-client'

/**
 * 사이트 전체 상단에 표시되는 공지 배너.
 * 관리자 페이지 "기본환경설정 > 공지 배너"에서 제어.
 * site_settings.announcement_bar = { enabled, message, link, variant }
 */
export async function AnnouncementBar() {
  const settings = await getSiteSettings()
  const a = (settings as any).announcement_bar as
    | { enabled?: boolean; message?: string; link?: string; variant?: string }
    | undefined
  if (!a || !a.enabled || !a.message) return null
  return (
    <AnnouncementBarClient
      message={a.message}
      link={a.link || ''}
      variant={a.variant || 'info'}
    />
  )
}
