/**
 * 부동산 매물 상세 페이지 최하단 면책 박스.
 * 중개사 매물: 중개사무소 정보 표시. 직거래 매물: 경고 박스.
 */

interface Props {
  profile?: { nickname?: string | null } | null
  /** 등록자 계정 타입 — "agent" 면 공인중개사 매물 */
  accountType?: string | null
}

export function PropertyLegalNotice({ profile, accountType }: Props) {
  const isAgent = accountType === "agent"

  if (isAgent) {
    return (
      <div className="mx-auto max-w-3xl px-4 mt-6 mb-8">
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">중개사 등록 매물</p>
          <p>
            본 매물은 공인중개사가 등록한 매물입니다. 거래 및 계약은 해당 중개사무소를 통해 진행하시기 바랍니다.
            본 플랫폼은 통신판매중개자로서 거래 당사자가 아니며, 매물 정보의 정확성·적법성에 대한 책임은
            등록 중개사에게 있습니다. 계약 전 반드시 등기부등본 및 중개사 등록증을 확인하세요.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 mt-6 mb-8">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-xs leading-relaxed">
        <p className="mb-1 font-semibold text-amber-700 dark:text-amber-400">
          ⚠ 직거래 매물 — 안전수칙
        </p>
        <p className="text-amber-700/90 dark:text-amber-400/90">
          본 매물은 일반회원이 등록한 직거래 매물입니다. 공인중개사를 통하지 않은 거래는 법적 보호가 제한될 수 있으며,
          거래 과정에서 발생하는 분쟁에 대해 본 플랫폼은 책임지지 않습니다.
          반드시 <strong>등기부등본·신분증·임대차계약서</strong> 확인 등 안전거래 수칙을 준수하시고,
          계약금 송금 전 매물 현장 방문을 권장합니다.
        </p>
      </div>
    </div>
  )
}
