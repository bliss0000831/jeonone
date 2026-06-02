/**
 * PG 어댑터 팩토리.
 *
 * 환경변수 PG_PROVIDER 로 선택. 기본값 'portone'.
 * 미설정 환경 (6개월 무료 운영 기간 등) 에서는 isConfigured = false 인
 * 어댑터를 반환하므로 빌드는 깨지지 않음.
 */
import type { PgAdapter } from './adapter'
import { PortOnePgAdapter } from './portone'

let cached: PgAdapter | null = null

export function getPgAdapter(): PgAdapter {
  if (cached) return cached
  // 향후 PG_PROVIDER === 'toss' 분기 추가 가능
  cached = new PortOnePgAdapter()
  return cached
}

export type { PgAdapter } from './adapter'
export {
  UnsupportedPgOperationError,
} from './adapter'
