import { createClient } from '@/lib/supabase/server'
import { unstable_cache, revalidateTag } from 'next/cache'

export const SITE_SETTINGS_TAG = 'site-settings'

export interface SiteSettings {
  site_name: string
  site_description: string
  admin_email: string
  site_logo: string
  homepage_banner_title: string
  homepage_banner_subtitle: string
  smtp_enabled: boolean
  maintenance_mode: boolean
  maintenance_settings?: {
    enabled?: boolean
    title?: string
    message?: string
    start_at?: string
    end_at?: string
    allow_admin?: boolean
    contact_email?: string
  }
  admin_permissions?: any[]
  announcement_bar?: {
    enabled?: boolean
    message?: string
    link?: string
    variant?: string
  }
  /** 허브(gwangjang.app) 배경 이미지 설정 — 슈퍼 어드민 전용. */
  hub_background?: {
    image_url?: string | null
    overlay_opacity?: number      // 0 ~ 1
    overlay_color?: 'slate' | 'sky' | 'violet' | 'emerald' | 'rose'
    position?: 'top' | 'center' | 'bottom'
  } | null
}

export const DEFAULT_SETTINGS: SiteSettings = {
  site_name: '전원일기',
  site_description: '이웃과 함께하는 농촌 생활. 농기구·자재 거래부터 일손 나눔, 로컬푸드까지 함께하세요.',
  admin_email: '',
  site_logo: '/logo.png?v=3',
  homepage_banner_title: '전원일기',
  homepage_banner_subtitle: '이웃과 함께하는 농촌 생활',
  smtp_enabled: false,
  maintenance_mode: false,
}

/**
 * Fetch all site settings from the `site_settings` key-value table.
 * Safe to call from Server Components / route handlers.
 * Falls back to DEFAULT_SETTINGS if the table is empty or inaccessible.
 *
 * React.cache 로 1요청 단위 dedup — layout.tsx generateMetadata + RootLayout +
 * page.tsx 가 한 번 페이지뷰에 3번 호출하던 것이 1번으로 합쳐짐.
 */
import { cache } from 'react'
export const fetchSiteSettings = cache(_fetchSiteSettings)

async function _fetchSiteSettings(): Promise<SiteSettings> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('site_settings').select('key, value')
    if (error || !data) return { ...DEFAULT_SETTINGS }

    const settings: SiteSettings = { ...DEFAULT_SETTINGS }
    data.forEach((row: { key: string; value: any }) => {
      try {
        const parsed =
          typeof row.value === 'string' ? JSON.parse(row.value) : row.value
        if (row.key === 'homepage_banner' && parsed && typeof parsed === 'object') {
          settings.homepage_banner_title = parsed.title || DEFAULT_SETTINGS.homepage_banner_title
          settings.homepage_banner_subtitle =
            parsed.subtitle || DEFAULT_SETTINGS.homepage_banner_subtitle
        } else {
          ;(settings as any)[row.key] = parsed
        }
      } catch {
        ;(settings as any)[row.key] = row.value
      }
    })
    return settings
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * 캐시된 사이트 설정 조회 — 5분마다 재검증.
 * 관리자에서 설정을 수정하면 `revalidateSiteSettings()`로 즉시 무효화.
 * Safe to call from Server Components / route handlers.
 */
export const getSiteSettings = unstable_cache(
  fetchSiteSettings,
  ['site-settings-v1'],
  { revalidate: 300, tags: [SITE_SETTINGS_TAG] }
)

/**
 * 사이트 설정 캐시 무효화. 관리자 설정 저장 핸들러에서 호출.
 */
export function revalidateSiteSettings() {
  // Next 16 signature: revalidateTag(tag, 'max')
  ;(revalidateTag as any)(SITE_SETTINGS_TAG, 'max')
}
