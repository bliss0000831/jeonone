/**
 * 클라이언트 컴포넌트에서 현재 광장 ID 를 읽는 헬퍼.
 * window.location.host 기준으로 추출.
 */
'use client'

import { plazaFromHost, type PlazaId, isActivePlaza } from './config'

export function getCurrentPlazaClient(): PlazaId | null {
  if (typeof window === 'undefined') return null

  // 서브도메인 방식 안 통하는 환경 (localhost dev / Vercel preview) 에선
  // ?plaza= 쿼리 또는 dev-plaza 쿠키로 광장 진입.
  // production *.gwangjang.app 은 host 기반 분기 정상.
  const hostname = window.location.hostname
  const isSubdomainUnsupported =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.vercel.app')

  if (isSubdomainUnsupported) {
    // ?plaza=xxx 우선 (URL 직접 지정)
    const qParam = new URLSearchParams(window.location.search).get('plaza')
    if (qParam && qParam !== '' && qParam !== 'hub') {
      return qParam as PlazaId
    }
    // dev-plaza 쿠키 fallback
    const m = document.cookie.match(/(?:^|;\s*)dev-plaza=([^;]+)/)
    if (m && m[1]) {
      return decodeURIComponent(m[1]) as PlazaId
    }
    // hub 로 fallback (preview 에선 기본 hub)
    return null
  }

  return plazaFromHost(window.location.host)
}

export function isCurrentPlazaActiveClient(): boolean {
  return isActivePlaza(getCurrentPlazaClient())
}

/**
 * 다른 광장 도메인으로 이동하는 URL 생성.
 *   buildPlazaUrl('gangneung', '/property/123')
 *     → "https://gangneung.gwangjang.app/property/123"
 *   buildPlazaUrl(null, '/')   // 허브
 *     → "https://gwangjang.app/"
 */
export function buildPlazaUrl(plazaId: PlazaId | null, path = '/'): string {
  if (typeof window === 'undefined') return path

  const host = window.location.host.split(':')[0]
  const protocol = window.location.protocol
  const port = window.location.port ? `:${window.location.port}` : ''

  // 서브도메인 방식이 안 통하는 환경 (localhost / Vercel preview):
  //   - localhost → 서브도메인 자체 X
  //   - *.vercel.app → "chuncheon.vercel.app" 은 광장 도메인 아님 (남의 사이트)
  // 이 환경에선 같은 host 에서 ?plaza= 쿼리 방식으로 진입.
  // getCurrentPlazaClient() 가 dev-plaza 쿠키/쿼리를 읽도록 이미 분기됨.
  const isSubdomainUnsupported =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.vercel.app')

  if (isSubdomainUnsupported) {
    const sep = path.includes('?') ? '&' : '?'
    const queryStr = plazaId ? `${sep}plaza=${plazaId}` : ''
    return `${protocol}//${host}${port}${path}${queryStr}`
  }

  // 프로덕션: 서브도메인 방식 ("chuncheon.gwangjang.app")
  const labels = host.split('.')
  const rootDomain = labels.length >= 2 ? labels.slice(-2).join('.') : host
  const targetHost = plazaId ? `${plazaId}.${rootDomain}` : rootDomain
  return `${protocol}//${targetHost}${port}${path}`
}
