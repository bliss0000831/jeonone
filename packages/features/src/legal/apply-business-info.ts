/**
 * 광장별 사업자 정보를 정적 LegalDoc(TERMS_DOC, PRIVACY_DOC) 에 주입.
 *
 * 정적 콘텐츠는 사업자 정보가 빈 상태로 `[추후 등록]` 플레이스홀더를 갖고 있음.
 * 광장 관리자가 사업자 정보를 입력하면 렌더 시점에 이 함수로 치환해서 렌더.
 *
 * 치환 규칙:
 *  1. kv 블록 안의 row 는 `k` (key 라벨) 으로 식별해서 v 를 실제 값으로 교체.
 *     예: k="상호" → v = info.business_name
 *  2. p / callout 블록 안의 `[추후 등록]` 리터럴은 business_name 으로 치환.
 *  3. 사업자 정보가 모두 채워졌으면 안내용 amber callout (intro 최상단) 은 제거.
 *
 * 안전: 입력에 빈 문자열이 있으면 fallback ("[미등록]") 사용 — `[추후 등록]` 보다
 * 명확. 사용자가 모든 필드를 채울 때까지 약관은 절반만 유효한 상태.
 */
import type { LegalBlock, LegalDoc } from "./content"

export interface LegalBusinessInfo {
  business_name: string
  ceo_name: string
  business_number: string
  mailorder_number: string
  address: string
  phone: string
  email: string
  job_info_number: string
  privacy_officer: string
}

// kv row 의 key 라벨 → BusinessInfo 필드 매핑
const KV_KEY_MAP: Record<string, keyof LegalBusinessInfo> = {
  "상호": "business_name",
  "대표자": "ceo_name",
  "사업자등록번호": "business_number",
  "통신판매업신고번호": "mailorder_number",
  "주소": "address",
  "대표 전화": "phone",
  "대표전화": "phone",
  "이메일": "email",
  "개인정보 보호책임자": "privacy_officer",
}

const FALLBACK = "[미등록]"

function fieldOrFallback(info: LegalBusinessInfo, key: keyof LegalBusinessInfo): string {
  const v = info[key]
  return v && v.trim().length > 0 ? v.trim() : FALLBACK
}

/** 사업자 정보 핵심 3개 필드(상호/대표자/사업자번호) 가 모두 채워졌는지 */
export function isBusinessInfoComplete(info: LegalBusinessInfo): boolean {
  return !!(
    info.business_name?.trim() &&
    info.ceo_name?.trim() &&
    info.business_number?.trim()
  )
}

/** "[추후 등록]" 리터럴을 business_name 으로 치환 (직책은 별도 처리) */
function replacePlaceholder(text: string, info: LegalBusinessInfo): string {
  if (!text.includes("[추후 등록]")) return text
  const name = fieldOrFallback(info, "business_name")
  return text.split("[추후 등록]").join(name)
}

function transformBlock(block: LegalBlock, info: LegalBusinessInfo): LegalBlock {
  switch (block.type) {
    case "p":
      return { ...block, text: replacePlaceholder(block.text, info) }
    case "callout":
      return { ...block, text: replacePlaceholder(block.text, info) }
    case "kv":
      return {
        ...block,
        rows: block.rows.map((row) => {
          const mapped = KV_KEY_MAP[row.k.trim()]
          if (mapped) {
            return { k: row.k, v: fieldOrFallback(info, mapped) }
          }
          // "직책" 같은 보조 필드도 보호책임자 이름과 동일하게 처리하지는 않음 (UI 에서 그대로 노출)
          return row
        }),
      }
    case "ul":
    case "ol":
      return block
    default:
      return block
  }
}

/** LegalDoc 에 사업자 정보 주입. 원본을 변경하지 않고 새 객체 반환. */
export function applyBusinessInfo(doc: LegalDoc, info: LegalBusinessInfo): LegalDoc {
  const complete = isBusinessInfoComplete(info)

  // intro: 사업자 정보가 완성되면 안내성 amber callout 제거
  const intro = doc.intro
    ? doc.intro
        .filter((b) => !(complete && b.type === "callout" && b.tone === "amber" && b.text.includes("[추후 등록]")))
        .map((b) => transformBlock(b, info))
    : doc.intro

  const sections = doc.sections.map((sec) => ({
    ...sec,
    blocks: sec.blocks.map((b) => transformBlock(b, info)),
  }))

  return { ...doc, intro, sections }
}
