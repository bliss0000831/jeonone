/**
 * Property 도메인 — barrel export.
 *
 * 컴포넌트 / app / 라우트 측 사용:
 *   import { formatPropertyPrice, validatePropertyInput } from '@/lib/features/property'
 *
 * 내부 파일끼리는 상대 경로 (./api, ./types) 사용.
 */

export type {
  Property,
  DbProperty,
  PropertyCreateInput,
  PropertyStatus,
  PropertyFilter,
} from './types'

export {
  listProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  countUserPropertiesThisMonth,
  toggleFavorite,
  createPropertyPost,
  updatePropertyPost,
  PROPERTY_TYPES,
  PROPERTY_TRANSACTION_TYPES,
  PROPERTY_DIRECTIONS,
  PROPERTY_FEATURES,
  type PropertyPostInput,
} from './api'

export {
  validatePropertyInput,
  assertPropertyInput,
  ValidationException,
  type ValidationError,
} from './validators'

export {
  formatPropertyPrice,
  formatManwon,
  formatArea,
  formatPostedAgo,
  getTransactionBadgeColor,
  getStatusLabel,
} from './formatters'

export {
  useProperty,
  useProperties,
  usePropertyFavorite,
} from './hooks'
