/**
 * 사이트 브랜딩(로고/이름) SSR 주입.
 *
 * 헤더 로고가 마운트 후 fetch 끝나야 그려지던 지연을 없애려고,
 * layout.tsx 에서 이미 호출 중인 getSiteSettings() 결과를 client context
 * 초기값으로 흘려보낸다. 헤더는 이 값을 그대로 첫 렌더에 사용 → 빈 박스 0.
 *
 * 멀티-광장: 광장 서브도메인 진입 시 plazas 테이블의 광장 이름을 우선 사용.
 * 허브 도메인이면 기존 site_settings (또는 "광장") 사용.
 */
import { fetchSiteSettings } from '@/lib/services/site-settings'
import { getCurrentPlaza } from '@/lib/plaza/server'
import { createClient } from '@/lib/supabase/server'
import { SiteBrandingClient } from './site-branding-client'

export async function SiteBrandingProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const settings = await fetchSiteSettings()
  const plaza = await getCurrentPlaza()

  let plazaName: string | null = null
  let plazaLogo: string | null = null
  let hubLogo: string | null = null

  if (plaza) {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('plazas')
        .select('name, theme')
        .eq('id', plaza)
        .single()
      plazaName = data?.name ?? null
      const t = (data?.theme || {}) as any
      plazaLogo = t.logoUrl || t.logo_url || null
    } catch {
      // fall through
    }
  } else {
    // 허브 도메인 — super admin 전용 hub_logo 키만
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'hub_logo')
        .maybeSingle()
      const raw = data?.value
      hubLogo = typeof raw === 'string' && raw.startsWith('http') ? raw : null
    } catch {
      // fall through
    }
  }

  // 우선순위: 지역이면 지역 이름, 허브이면 "전국 전원일기"
  const name = plazaName || (plaza ? '전원일기' : '전국 전원일기')
  // 로고: 광장이면 plazas.theme.logoUrl, 허브이면 site_settings.hub_logo, 둘 다 없으면 기본
  const logo = plaza
    ? (plazaLogo || '/logo.png?v=3')
    : (hubLogo || '/logo.png?v=3')

  return (
    <SiteBrandingClient
      initial={{
        name,
        logo,
      }}
    >
      {children}
    </SiteBrandingClient>
  )
}
