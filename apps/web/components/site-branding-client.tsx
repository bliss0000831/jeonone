"use client"

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getCurrentPlazaClient } from '@/lib/plaza/client'

export interface SiteBranding {
  name: string
  logo: string
}

const SiteBrandingContext = createContext<SiteBranding>({
  name: '광장',
  logo: '/logo.png?v=3',
})

export function SiteBrandingClient({
  initial,
  children,
}: {
  initial: SiteBranding
  children: React.ReactNode
}) {
  const [value, setValue] = useState<SiteBranding>(initial)

  // 같은 세션 안에서 관리자가 로고를 바꿨을 때 즉시 반영하기 위한
  // 백그라운드 갱신. 초기 렌더는 SSR 값으로 끝나서 지연 없음.
  // 멀티-광장: 광장 서브도메인이면 site_settings.site_name 으로 덮어쓰지 않음
  // (plazas.name 이 SSR 에서 이미 박혀있고 더 정확함).
  useEffect(() => {
    let alive = true
    const onPlaza = getCurrentPlazaClient() !== null
    // 광장 도메인에선 site_settings 조회 자체를 건너뜀 (SSR plazas.theme.logoUrl 가 정답)
    if (onPlaza) return
    // 허브에서만 글로벌 site_settings 백그라운드 갱신
    fetch('/api/site-settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s) => {
        if (!alive) return
        const next = {
          name: s.site_name || initial.name,
          logo: s.hub_logo || initial.logo,
        }
        if (next.name !== value.name || next.logo !== value.logo) {
          setValue(next)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // mount 시 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const memoValue = useMemo(() => value, [value.name, value.logo])

  return (
    <SiteBrandingContext.Provider value={memoValue}>
      {children}
    </SiteBrandingContext.Provider>
  )
}

export function useSiteBranding() {
  return useContext(SiteBrandingContext)
}
