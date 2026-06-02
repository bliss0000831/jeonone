/**
 * 서버 컴포넌트 / 라우트 핸들러에서 현재 광장 ID 를 읽는 헬퍼.
 *
 * 사용 예:
 *   const plaza = await getCurrentPlaza()
 *   if (!plaza) return <HubLanding />  // 허브 도메인 진입
 *   const { data } = await supabase.from('properties').select('*').eq('plaza_id', plaza)
 */
import { headers } from 'next/headers'
import { plazaFromHost, type PlazaId, isActivePlaza } from './config'

/**
 * 현재 요청의 광장 ID. 허브(gwangjang.app) 진입이면 null.
 * middleware 에서 x-plaza 헤더 박아두면 그걸 읽고, fallback 으로 host 직접 파싱.
 */
export async function getCurrentPlaza(): Promise<PlazaId | null> {
  const h = await headers()
  const fromHeader = h.get('x-plaza')
  if (fromHeader && fromHeader.length > 0) {
    return fromHeader as PlazaId
  }
  // fallback: 미들웨어를 거치지 않는 경로 (예: 일부 RSC) 에서도 host 로 추출
  const host = h.get('host')
  return plazaFromHost(host)
}

/**
 * 현재 광장이 활성 상태인지. 비활성/허브면 false.
 */
export async function isCurrentPlazaActive(): Promise<boolean> {
  const plaza = await getCurrentPlaza()
  return isActivePlaza(plaza)
}

/**
 * 현재 광장 ID 를 반환하되, 허브거나 비활성이면 throw.
 * "광장 페이지" 임을 보장하고 싶을 때 사용.
 */
export async function requirePlaza(): Promise<PlazaId> {
  const plaza = await getCurrentPlaza()
  if (!plaza) {
    throw new Error('이 페이지는 광장 도메인에서만 접근 가능합니다')
  }
  return plaza
}
