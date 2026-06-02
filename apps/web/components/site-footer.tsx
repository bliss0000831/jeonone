/**
 * 사이트 푸터 — site_settings.theme_footer 에서 설정 읽어 렌더.
 *
 * 어드민 → 테마 → 푸터에서 저장한 값을 실제로 소비.
 * 어드민/슈퍼어드민/인증 페이지에선 숨김 (자체 chrome 보유).
 */
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlazaBusinessInfo } from '@/lib/plaza/business-info'
import { SiteFooterClient } from './site-footer.client'

export interface FooterLink {
  label: string
  href: string
}
export interface FooterSettings {
  copyright?: string
  show_sns?: boolean
  sns?: { instagram?: string; youtube?: string; blog?: string }
  links?: FooterLink[]
}

async function loadFooter(): Promise<FooterSettings> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'theme_footer')
      .maybeSingle()
    if (!data?.value) return {}
    return typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as any)
  } catch {
    return {}
  }
}

export async function SiteFooter() {
  const [footer, business] = await Promise.all([
    loadFooter(),
    getCurrentPlazaBusinessInfo(),
  ])
  return <SiteFooterClient settings={footer} business={business} />
}
