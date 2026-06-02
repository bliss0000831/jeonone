/**
 * 통신판매중개자 면책 고지 / 푸터·하단 띠에 표시되는 표준 문구 생성.
 *
 * 광장별 사업자 정보를 받아 문구를 조립. 모든 서비스 카테고리에서 공통 사용.
 * 웹·RN 양쪽에서 같은 문구를 렌더 → 단일 진실 원천.
 */
import type { LegalBusinessInfo } from "./apply-business-info"
import { isBusinessInfoComplete } from "./apply-business-info"

/**
 * 한 줄 짜리 면책 고지. 모든 페이지 하단 또는 푸터에 표시.
 *
 * 예) "본 플랫폼은 통신판매중개자로서 거래 당사자가 아닙니다."
 */
export const PLATFORM_DISCLAIMER_SHORT =
  "본 플랫폼은 통신판매중개자로서 거래의 당사자가 아닙니다. 게시된 상품·매물·서비스의 정확성·적법성 및 거래 이행에 대한 책임은 등록자에게 있습니다."

/**
 * 상세 면책 — 푸터/약관 페이지 진입 직전 표시.
 */
export const PLATFORM_DISCLAIMER_LONG =
  "본 서비스는 「전자상거래 등에서의 소비자보호에 관한 법률」 제20조에 따른 통신판매중개자로서, 등록자와 이용자 간 거래의 당사자가 아닙니다. 게시된 매물·상품·서비스 정보의 정확성·적법성 및 거래 이행에 대한 책임은 해당 등록자(공인중개사, 사업자, 게시자)에게 있으며, 본 플랫폼은 이를 보증하지 않습니다. 거래 전 반드시 등기부등본·사업자등록 진위·면허증 등을 직접 확인하시기 바랍니다."

/**
 * 사업자 정보 한 줄 (푸터·약관 사업자 카드용). 빈 필드는 자동 생략.
 *
 * 예) "상호: 광장 | 대표자: 홍길동 | 사업자등록번호: 000-00-00000 | 통신판매업: 제0000-춘천-0000호 | 주소: ... | 연락처: ..."
 */
export function formatBusinessLine(info: LegalBusinessInfo): string {
  const parts: string[] = []
  if (info.business_name?.trim()) parts.push(`상호: ${info.business_name.trim()}`)
  if (info.ceo_name?.trim()) parts.push(`대표자: ${info.ceo_name.trim()}`)
  if (info.business_number?.trim()) parts.push(`사업자등록번호: ${info.business_number.trim()}`)
  if (info.mailorder_number?.trim()) parts.push(`통신판매업: ${info.mailorder_number.trim()}`)
  if (info.address?.trim()) parts.push(`주소: ${info.address.trim()}`)
  if (info.phone?.trim()) parts.push(`연락처: ${info.phone.trim()}`)
  if (info.email?.trim()) parts.push(`이메일: ${info.email.trim()}`)
  return parts.join(" | ")
}

/** 사업자 정보가 의미있게 채워져 있으면 푸터에 사업자 라인 표시 가능 */
export function hasDisplayableBusinessInfo(info: LegalBusinessInfo): boolean {
  return isBusinessInfoComplete(info)
}

/**
 * 구인구직 메인 페이지 상단 — 직업안정법 신고번호 표시 의무.
 * 신고 안 됐으면 null.
 */
export function formatJobInfoNotice(info: LegalBusinessInfo): string | null {
  if (!info.job_info_number?.trim()) return null
  return `본 서비스는 「직업안정법」 제23조에 따른 직업정보제공사업으로 신고되었습니다. 신고번호: ${info.job_info_number.trim()}`
}
