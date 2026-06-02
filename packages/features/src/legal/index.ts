/**
 * @gwangjang/features/legal — 약관·방침 등 정적 법적 콘텐츠.
 * 웹과 RN 양쪽이 같은 텍스트를 import 해서 렌더 — 단일 진실 원천.
 */

export {
  TERMS_DOC,
  PRIVACY_DOC,
  type LegalDoc,
  type LegalSection,
  type LegalBlock,
} from "./content"

export {
  applyBusinessInfo,
  isBusinessInfoComplete,
  type LegalBusinessInfo,
} from "./apply-business-info"

export {
  PLATFORM_DISCLAIMER_SHORT,
  PLATFORM_DISCLAIMER_LONG,
  formatBusinessLine,
  hasDisplayableBusinessInfo,
  formatJobInfoNotice,
} from "./disclaimer"
