"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FileText } from "lucide-react"

export type ServiceKind =
  | "property"
  | "secondhand"
  | "sharing"
  | "groupBuying"
  | "localFood"
  | "club"
  | "jobs"
  | "newStore"
  | "service"

interface ConsentItem {
  id: string
  text: string
  emphasis?: string
}

const CONSENT_BY_KIND: Record<ServiceKind, ConsentItem[]> = {
  property: [
    { id: "owner", text: "본인은 등록 부동산의 소유자 또는 임차인 본인임을 확인합니다", emphasis: "소유자 또는 임차인 본인" },
    { id: "notBroker", text: "타인을 위한 중개 목적이 아님을 확인합니다 (공인중개사법 위반 시 처벌)", emphasis: "중개 목적이 아님" },
    { id: "truthful", text: "정보가 사실에 부합하며, 허위 등록의 책임은 본인에게 있습니다", emphasis: "사실에 부합" },
  ],
  secondhand: [
    { id: "owner", text: "본인이 정당한 소유자이며 처분 권한이 있습니다", emphasis: "정당한 소유자" },
    { id: "notBusiness", text: "개인 간 거래 목적이며 사업적 반복 판매가 아닙니다", emphasis: "사업적 반복 판매가 아닙니다" },
    { id: "noProhibited", text: "금지·제한 품목이 아니며 타인 권리를 침해하지 않습니다", emphasis: "금지·제한 품목이 아니며" },
  ],
  sharing: [
    { id: "free", text: "본 나눔은 무상이며, 운송비 외 어떠한 대가도 받지 않습니다", emphasis: "무상" },
    { id: "noFoodMed", text: "식품·의약품·건강기능식품 등 안전 우려 품목이 아닙니다", emphasis: "안전 우려 품목이 아닙니다" },
    { id: "ownRisk", text: "나눔품 하자에 대해 본인이 책임지며, 받는 사람도 자기 책임 하에 수령합니다", emphasis: "본인이 책임" },
  ],
  groupBuying: [
    { id: "business", text: "본 공동구매는 사업자등록·통신판매업 신고를 마친 본인이 직접 판매합니다", emphasis: "직접 판매" },
    { id: "law", text: "전자상거래법·표시광고법·식품위생법 등 관련 법령을 준수합니다", emphasis: "관련 법령을 준수" },
    { id: "refund", text: "청약철회권(7일)을 보장하며, 이를 부당하게 제한하지 않습니다", emphasis: "청약철회권(7일)" },
  ],
  localFood: [
    { id: "producer", text: "본인은 농어업경영체로 등록된 실제 생산자입니다", emphasis: "실제 생산자" },
    { id: "origin", text: "원산지 표시 의무를 준수하며, 허위 표시 시 본인이 모든 법적 책임을 집니다", emphasis: "원산지 표시 의무" },
    { id: "noEffect", text: "효능·효과를 표시·광고하지 않습니다 (예: \"당뇨에 좋은\", \"면역력 증진\")", emphasis: "효능·효과를 표시·광고하지 않습니다" },
  ],
  club: [
    { id: "lawful", text: "본 모임이 다단계·도박·사이비 종교·정치 활동·성매매 목적이 아닙니다", emphasis: "목적이 아닙니다" },
    { id: "safety", text: "참가자 안전 및 미성년자 보호 의무를 인지합니다", emphasis: "안전 및 미성년자 보호" },
    { id: "feeTransparent", text: "참가비를 받는 경우 용도·정산을 투명하게 운영합니다", emphasis: "투명하게 운영" },
  ],
  jobs: [
    { id: "real", text: "본인은 실제 채용 의사가 있으며 허위 채용공고가 아닙니다", emphasis: "허위 채용공고가 아닙니다" },
    { id: "minWage", text: "최저임금법을 준수하며 명시 임금은 최저임금 이상입니다", emphasis: "최저임금법을 준수" },
    { id: "noDiscrim", text: "성별·연령·외모 등 직무 무관 차별 표현을 사용하지 않습니다", emphasis: "차별 표현을 사용하지 않습니다" },
    { id: "noScam", text: "보이스피싱·대포통장·다단계 등 범죄 가담 알바 모집이 아닙니다", emphasis: "범죄 가담 알바 모집이 아닙니다" },
  ],
  newStore: [
    { id: "owner", text: "본인은 본 사업장의 실제 운영자이며 사업자등록·영업신고를 마쳤습니다", emphasis: "실제 운영자" },
    { id: "noAd", text: "표시광고법을 준수하며 \"최고\"·\"1위\"·\"100% 보장\" 등 단정 표현을 사용하지 않습니다", emphasis: "단정 표현을 사용하지 않습니다" },
    { id: "lawful", text: "업종별 광고 규제(의료법·약사법·변호사법 등)를 준수합니다", emphasis: "업종별 광고 규제" },
  ],
  service: [
    { id: "license", text: "관련 법령상 요구되는 면허·등록·자격을 갖춘 범위 내에서만 제공합니다", emphasis: "면허·등록·자격" },
    { id: "insurance", text: "법정 보험·공제 가입 의무가 있는 경우 이를 이행합니다", emphasis: "법정 보험·공제" },
    { id: "noFalse", text: "허위·과장 광고(\"최저가\"·\"100% 만족\"·\"평생 A/S\" 등)를 게시하지 않습니다", emphasis: "허위·과장 광고" },
    { id: "responsibility", text: "시공 하자·손해배상 등 모든 책임은 본 업체에 있음에 동의합니다", emphasis: "모든 책임은 본 업체에" },
  ],
}

interface Props {
  serviceKind: ServiceKind
  onChange: (allChecked: boolean) => void
}

function renderText(text: string, emphasis?: string) {
  if (!emphasis || !text.includes(emphasis)) {
    return text
  }
  const parts = text.split(emphasis)
  return (
    <>
      {parts[0]}
      <strong className="font-bold text-foreground">{emphasis}</strong>
      {parts[1]}
    </>
  )
}

export function RegisterConsentBlock({ serviceKind, onChange }: Props) {
  const items = CONSENT_BY_KIND[serviceKind]
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const allChecked = items.every((i) => checked[i.id])
    onChange(allChecked)
  }, [checked, items, onChange])

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 space-y-3">
      <p className="text-sm font-bold text-foreground">필수 동의 사항</p>
      {items.map((item) => (
        <label
          key={item.id}
          className="flex items-start gap-2 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={!!checked[item.id]}
            onChange={() =>
              setChecked((p) => ({ ...p, [item.id]: !p[item.id] }))
            }
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <span className="text-xs leading-[18px] text-muted-foreground">
            {renderText(item.text, item.emphasis)}
          </span>
        </label>
      ))}
      <div className="flex justify-end">
        <Link
          href="/legal/terms"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          <FileText className="w-3 h-3" />
          약관 전문 보기
        </Link>
      </div>
    </div>
  )
}
