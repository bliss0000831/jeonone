/**
 * 금지품목 안내 — 정보통신망법·전자상거래법 등 법령 + 자체 운영정책 기반.
 * 푸터 "금지품목" 링크에서 접근.
 */
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "거래 금지·제한 품목 안내",
}

interface Category {
  title: string
  desc?: string
  items: string[]
}

const ABSOLUTELY_PROHIBITED: Category[] = [
  {
    title: "의약·의료기기",
    desc: "약사법, 의료기기법상 일반 거래 금지",
    items: [
      "전문의약품·일반의약품",
      "처방약, 영양주사제",
      "콘택트렌즈, 보청기 (의료기기 — 면허 필요)",
      "의료용 마스크 (KF94 등 의약외품 일부 제한)",
    ],
  },
  {
    title: "주류·담배",
    desc: "전자상거래법상 개인 간 통신판매 금지",
    items: [
      "양주, 와인, 맥주, 소주 등 일반 주류",
      "담배, 전자담배, 액상",
      "(예외: 전통주 — 사업자 등록 + 통신판매 허가 필요)",
    ],
  },
  {
    title: "총포·도검·마약",
    desc: "총포도검화약류법 / 마약류관리법",
    items: [
      "총포, 화약, 가스총, 공기총",
      "도검 (식칼 등 일상용 제외)",
      "마약·향정신성의약품 일체",
    ],
  },
  {
    title: "반려동물·동물",
    desc: "동물보호법 (2023년 개정) — 영업자 아닌 자의 온라인 거래 금지",
    items: [
      "강아지, 고양이 등 반려동물 분양·판매",
      "유료 분양, 입양비, 책임비 명목 거래",
      "(예외: 무상 입양 게시는 신중 검토 필요)",
    ],
  },
  {
    title: "음란·도박·불법",
    desc: "정보통신망법, 사행행위 등 규제법",
    items: [
      "음란물, 성인용품 (일반 거래 불가)",
      "도박 도구, 사행성 게임 머니",
      "위조품·짝퉁 (상표법 위반)",
      "저작권 침해물 (불법 복제 CD/DVD/소프트웨어)",
      "개인정보, 계정 (정보통신망법)",
      "암표 (대중문화예술산업법)",
    ],
  },
  {
    title: "인체·생명윤리",
    desc: "생명윤리법",
    items: [
      "장기, 혈액, 인체조직",
      "모유, 정자, 난자",
      "법정 보호 동식물 (멸종위기 야생동물 등)",
    ],
  },
]

const CONDITIONALLY_RESTRICTED: Category[] = [
  {
    title: "자동차·이륜차",
    items: ["이전 등록 필요 — 안전거래 매뉴얼 확인 권장"],
  },
  {
    title: "전동킥보드 (PM)",
    items: ["안전 인증된 제품만 거래 가능"],
  },
  {
    title: "유아용품",
    items: ["안전인증 KC 마크 미부착 제품 거래 제한"],
  },
  {
    title: "건강기능식품",
    items: ["개인 간 거래 회색지대 — 권장하지 않음"],
  },
  {
    title: "화장품",
    items: ["개봉품, 유통기한 임박품 거래 제한"],
  },
  {
    title: "수제 식품",
    items: ["식품위생법 회색지대 — 영업신고 없이 판매 시 위반 가능"],
  },
  {
    title: "유료 강의·전자책",
    items: ["계정 공유 거래는 저작권 침해 우려"],
  },
]

export default function ProhibitedItemsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center gap-4 px-4 h-14">
          <Link href="/" aria-label="뒤로 가기">
            <ArrowLeft className="w-5 h-5 text-foreground hover:text-muted-foreground transition-colors" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">거래 금지·제한 품목 안내</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          본 플랫폼은 「전자상거래 등에서의 소비자보호에 관한 법률」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등
          관련 법령에 따라 다음 품목의 거래·게시를 금지하거나 제한합니다. 위반 게시물은 사전 통지 없이 삭제될 수 있으며,
          반복 위반 시 계정이 영구 정지되고 관계기관(경찰청 사이버수사대, 식약처, 공정거래위원회 등)에 신고됩니다.
        </div>

        <section>
          <h2 className="text-xl font-bold text-foreground mb-3">🚫 거래 절대 금지 품목</h2>
          <p className="text-sm text-muted-foreground mb-4">
            법령상 통신판매·개인 간 거래가 금지된 품목입니다. 게시 시 즉시 삭제 + 계정 정지 조치됩니다.
          </p>
          <div className="space-y-4">
            {ABSOLUTELY_PROHIBITED.map((cat) => (
              <div key={cat.title} className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-foreground mb-1">{cat.title}</h3>
                {cat.desc && <p className="text-xs text-muted-foreground mb-2">{cat.desc}</p>}
                <ul className="list-disc list-outside ml-5 space-y-1 text-sm text-foreground">
                  {cat.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-foreground mb-3">⚠ 조건부 거래 제한 품목</h2>
          <p className="text-sm text-muted-foreground mb-4">
            특정 조건(인증, 허가, 자격증 등) 하에서만 거래 가능하거나, 사기·하자 분쟁 위험이 높은 품목입니다.
          </p>
          <div className="space-y-3">
            {CONDITIONALLY_RESTRICTED.map((cat) => (
              <div key={cat.title} className="rounded-lg border border-border/60 bg-muted/40 p-3">
                <h3 className="font-medium text-foreground mb-1">{cat.title}</h3>
                <ul className="list-disc list-outside ml-5 space-y-0.5 text-sm text-muted-foreground">
                  {cat.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-foreground mb-3">신고 안내</h2>
          <p className="text-sm text-muted-foreground mb-3">
            금지·제한 품목 거래를 발견하시면 게시물 우측 상단의 신고 버튼을 이용해주세요.
            범죄 의심 거래는 외부 기관에도 즉시 신고할 수 있습니다.
          </p>
          <ul className="list-disc list-outside ml-5 space-y-1 text-sm text-foreground">
            <li>경찰청 사이버수사 — 국번없이 <strong>182</strong></li>
            <li>금융감독원 보이스피싱 — <strong>1332</strong></li>
            <li>식품의약품안전처 부정·불량식품 신고 — <strong>1399</strong></li>
            <li>한국소비자원 — <strong>1372</strong></li>
            <li>사이버캅(경찰청) — 계좌·전화번호 사기 이력 조회</li>
          </ul>
        </section>

        <div className="mt-8 pt-6 border-t border-border text-xs text-muted-foreground">
          본 안내는 「관련 법령」 및 본 플랫폼 「이용약관」을 기반으로 작성되었으며,
          법령 개정에 따라 변경될 수 있습니다. 자세한 내용은{" "}
          <Link href="/terms" className="text-primary underline">이용약관</Link>{" "}
          및{" "}
          <Link href="/privacy" className="text-primary underline">개인정보처리방침</Link>{" "}
          을 참조하세요.
        </div>
      </div>
    </main>
  )
}
