// RSC — 정적 텍스트 페이지 + 광장별 사업자 정보 주입.
// 사업자 정보가 비어있으면 `[미등록]` 표기 + 안내 callout 유지.
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getCurrentPlazaBusinessInfo } from '@/lib/plaza/business-info'

export const metadata = {
  title: '이용약관 | 전원일기',
}

// 빈 필드는 '[미등록]' 으로 표시
function v(s: string): string {
  return s && s.trim().length > 0 ? s.trim() : '[미등록]'
}

export default async function TermsPage() {
  const info = await getCurrentPlazaBusinessInfo()
  const isFilled = !!(info.business_name && info.ceo_name && info.business_number)
  const companyName = v(info.business_name)

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center gap-4 px-4 h-14">
          <Link href="/">
            <ArrowLeft className="w-5 h-5 text-foreground hover:text-muted-foreground transition-colors" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">이용약관</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-base text-foreground/80 leading-relaxed">

        {/* 사업자 정보 미입력 시에만 표시되는 운영자 안내 */}
        {!isFilled && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-400">
            ※ 본 약관은 한국 전자상거래법·정보통신망법·약관규제법 표준 양식에 따라 작성되었습니다.
            현재 운영 주체의 사업자 정보가 일부 비어있으며, 관리자 페이지의 <strong>설정 → 사업자 정보 (법적표시)</strong> 메뉴에서 입력 시 약관 전체에 자동 반영됩니다.
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">전문</h2>
          <p>
            본 이용약관(이하 "약관")은 <strong className="text-foreground">{companyName}</strong>(이하 "회사")가
            운영하는 지역 커뮤니티 플랫폼(이하 "서비스")의 이용과 관련하여
            회사와 이용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제1조 (정의)</h2>
          <ul className="list-disc list-outside ml-5 space-y-1.5">
            <li><strong>서비스</strong>: 회사가 제공하는 농기구·자재 직거래·대여·경매, 로컬푸드 직거래, 일손(구인·구직), 무료 나눔, 소식통(지역 게시판), 채팅 등 농촌·지역 기반 커뮤니티 및 정보 제공 서비스 일체.</li>
            <li><strong>이용자(회원)</strong>: 본 약관에 동의하고 서비스를 이용하는 자.</li>
            <li><strong>계정</strong>: 회원이 서비스를 이용하기 위해 생성·사용하는 식별자(이메일·소셜 로그인 ID).</li>
            <li><strong>게시물</strong>: 회원이 서비스에 게시·등록한 글, 이미지, 영상, 거래 정보, 댓글, 메시지 등 모든 형태의 정보.</li>
            <li><strong>포인트</strong>: 회사가 서비스 활동 보상 또는 결제 수단으로 부여·판매하는 가상의 적립금. 현금으로 환불되지 않으며 본 약관 및 별도 운영정책을 따릅니다.</li>
            <li><strong>사업자 회원</strong>: 로컬푸드 생산자·농기구 판매사업자 등 회사의 별도 인증 절차를 거쳐 사업자로 활동하는 회원.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제2조 (약관의 게시 및 변경)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회사는 본 약관을 회원이 쉽게 알 수 있도록 서비스 내에 게시합니다.</li>
            <li>회사는 「약관의 규제에 관한 법률」, 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관련 법령을 위배하지 않는 범위에서 약관을 개정할 수 있습니다.</li>
            <li>약관을 개정하는 경우 적용일자 및 개정 사유를 명시하여 적용일 7일 전부터(회원에게 불리하거나 중대한 변경의 경우 30일 전부터) 서비스 내 공지합니다.</li>
            <li>회원이 개정 약관에 동의하지 않는 경우 회원 탈퇴를 요청할 수 있으며, 공지된 적용일까지 거부 의사를 밝히지 않으면 동의한 것으로 간주합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제3조 (회원가입)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>이용 신청자가 약관과 개인정보처리방침에 동의하고 가입 신청을 하면, 회사가 이를 승낙함으로써 회원가입이 완료됩니다.</li>
            <li>회사는 다음 각 호에 해당하는 경우 가입 승낙을 거절하거나 사후에 이용 계약을 해지할 수 있습니다.
              <ul className="list-disc list-outside ml-5 mt-1.5 space-y-1">
                <li>실명이 아니거나 타인의 정보를 이용한 경우</li>
                <li>허위 정보를 기재하거나 회사가 요구하는 사항을 기재하지 않은 경우</li>
                <li>14세 미만의 아동이 법정대리인의 동의 없이 신청한 경우</li>
                <li>이전에 회원자격을 상실한 적이 있는 경우(회사가 재가입을 승낙한 경우 제외)</li>
                <li>기타 회사가 합리적인 판단에 의하여 필요하다고 인정하는 경우</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제4조 (회원정보의 변경)</h2>
          <p>
            회원은 마이페이지를 통해 언제든 자신의 정보를 열람·수정할 수 있으며, 가입 시 기재한 사항이 변경된 경우 즉시 수정해야 합니다.
            변경하지 않아 발생한 불이익에 대하여 회사는 책임을 지지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제5조 (회원 탈퇴 및 자격 상실)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회원은 언제든지 설정 메뉴의 "회원 탈퇴"를 통해 이용계약을 해지할 수 있습니다. 탈퇴 시 회원이 작성한 게시물 및 보유 포인트는 즉시 소멸하며, 일부 정보는 관계 법령에 따라 일정 기간 보관됩니다(개인정보처리방침 참조).</li>
            <li>회원이 다음 각 호의 사유에 해당하면 회사는 사전 통지 후 이용을 제한·정지하거나 회원 자격을 상실시킬 수 있습니다. 다만 긴급하거나 중대한 위반의 경우 사전 통지 없이 즉시 조치할 수 있습니다.
              <ul className="list-disc list-outside ml-5 mt-1.5 space-y-1">
                <li>본 약관 또는 운영정책 위반</li>
                <li>타인의 명예훼손, 개인정보 침해, 사기·기망</li>
                <li>스팸·도배·광고성 게시물 반복 등록</li>
                <li>음란물·폭력·차별 콘텐츠 게시</li>
                <li>서비스 운영을 고의로 방해하거나 보안을 침해하는 행위</li>
                <li>타인의 ID/비밀번호 도용</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제6조 (서비스의 제공)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회사는 다음과 같은 서비스를 제공합니다.
              <ul className="list-disc list-outside ml-5 mt-1.5 space-y-1">
                <li>농기구·자재 직거래·대여·경매 정보 게재 및 검색</li>
                <li>로컬푸드(농산물) 직거래 및 무료 나눔 정보 게재</li>
                <li>일손(구인·구직) 정보 게재</li>
                <li>회원 간 채팅 및 메시지</li>
                <li>소식통(지역 게시판)·정부지원금 정보 및 댓글</li>
                <li>포인트 적립·결제·교환</li>
                <li>그 밖에 회사가 추가 개발하거나 제휴를 통해 제공하는 일체의 서비스</li>
              </ul>
            </li>
            <li>서비스는 연중무휴 24시간 제공함을 원칙으로 하나, 시스템 점검·증설·교체, 천재지변, 통신장애 등의 사유가 있는 경우 일시 중단될 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제7조 (회사의 지위 — 통신판매중개자)</h2>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mb-2">
            <p className="font-semibold text-foreground">
              회사는 회원 상호 간의 거래를 위한 온라인 거래 장소(통신판매중개)를 제공할 뿐, 거래 당사자가 아닙니다.
            </p>
          </div>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회원이 게시한 농기구·자재·로컬푸드 등의 정보, 가격, 품질, 거래 조건, 계약 이행 책임은 전적으로 해당 게시자(판매자/대여인 등)에게 있습니다.</li>
            <li>회사는 회원 간 분쟁에 개입하지 않으며, 거래 결과(상품 하자, 배송 지연, 환불 거부, 계약 불이행 등)에 대하여 책임지지 않습니다. 다만 회사는 분쟁 해결을 위한 합리적 노력을 다하며, 신고·중재 절차를 운영합니다.</li>
            <li>사업자·생산자 회원이 제공하는 상품·용역의 품질·자격·인허가 보유 여부는 해당 회원이 직접 책임지며, 회사는 이를 보증하지 않습니다. 회사는 사업자 회원에 대한 기본 신원 확인을 수행하나, 실제 상품·서비스 품질을 보증하는 것은 아닙니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제8조 (게시물의 권리와 책임)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회원이 서비스 내에 게시한 게시물의 저작권은 게시한 회원에게 귀속됩니다.</li>
            <li>회원은 회사에 대하여 자신의 게시물을 서비스 운영·홍보·개선·신규 서비스 개발의 목적으로 무상으로 사용·복제·전송·전시·배포·2차 가공할 수 있는 비독점적·전세계적 라이선스를 부여합니다. 회원이 탈퇴한 후에도 이미 적법하게 라이선스가 부여된 게시물에 한해 본 권리는 유지됩니다.</li>
            <li>회원은 자신이 게시하는 게시물에 대해 적법한 권리를 보유하고 있음을 보증하며, 제3자의 저작권·초상권·상표권·개인정보·명예 등을 침해하지 않을 책임이 있습니다.</li>
            <li>회사는 다음 각 호에 해당하는 게시물을 사전 통지 없이 임시조치(블라인드)·삭제하거나 게시자에게 제재를 가할 수 있습니다.
              <ul className="list-disc list-outside ml-5 mt-1.5 space-y-1">
                <li>법령 또는 본 약관에 위배되는 게시물</li>
                <li>타인의 권리를 침해하거나 침해 우려가 있는 게시물</li>
                <li>음란·폭력·차별·혐오 표현</li>
                <li>스팸·광고·도배성 게시물</li>
                <li>허위·과장·기만적 정보, 사기성 거래</li>
                <li>일정 횟수 이상 신고가 누적된 게시물(자동 임시조치 후 검토)</li>
              </ul>
            </li>
            <li>임시조치된 게시물은 게시자가 이의를 제기할 수 있으며, 회사는 검토 후 복원 또는 삭제 여부를 결정합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제9조 (포인트)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>포인트는 회사가 정한 정책에 따라 회원에게 부여·사용·소멸됩니다.</li>
            <li>적립 포인트는 무상으로 지급되며 현금으로 환불되지 않습니다.</li>
            <li>유상으로 충전한 포인트는 회원의 청약 철회 가능 기간(결제일로부터 7일) 내, 사용 이력이 없는 경우에 한해 환불을 요청할 수 있습니다(전자상거래법 제17조).</li>
            <li>현재 포인트에는 별도의 만료 정책을 적용하지 않습니다. 향후 만료 정책을 도입할 경우 약관 개정 및 충분한 사전 공지를 거쳐 적용합니다.</li>
            <li>부정한 방법(자전거래, 다중 계정 등)으로 적립된 포인트는 사전 통지 없이 회수·소멸할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제10조 (회원의 의무 및 금지행위)</h2>
          <p className="mb-2">회원은 다음 각 호의 행위를 하여서는 안 됩니다.</p>
          <ul className="list-disc list-outside ml-5 space-y-1">
            <li>법령, 공공질서 또는 본 약관에 위배되는 행위</li>
            <li>타인의 개인정보·계정·결제수단 도용</li>
            <li>허위 상품·허위 정보·사기성 거래의 게시 또는 권유</li>
            <li>회사의 사전 동의 없는 영리 목적의 광고·홍보, 자동화 도구를 이용한 대량 게시</li>
            <li>서비스의 안정적 운영을 방해하는 행위(해킹, 크롤링 남용, DDoS, 보안 우회 등)</li>
            <li>타인의 명예 훼손, 모욕, 차별, 성적 수치심 유발</li>
            <li>저작권 등 지적재산권 침해</li>
            <li>회사·서비스의 신용을 훼손하는 행위</li>
            <li>외부 결제 유도, 거래 회피를 위한 연락처 무단 공개 등 회사의 안전 거래 시스템을 우회하는 행위</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제11조 (개인정보 보호)</h2>
          <p>
            회사는 관련 법령이 정하는 바에 따라 회원의 개인정보를 보호하기 위해 노력하며,
            구체적인 처리 방침은 별도의 <Link href="/privacy" className="text-primary underline">개인정보처리방침</Link>에 따릅니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제12조 (광고 및 마케팅)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회사는 서비스 운영을 위해 화면 내 광고를 게재할 수 있습니다.</li>
            <li>회사는 회원이 동의한 경우에 한해 마케팅 정보(이벤트·프로모션·신규 서비스 안내)를 이메일·푸시·SMS 등으로 발송하며, 회원은 언제든 설정에서 수신을 거부할 수 있습니다.</li>
            <li>광고를 통해 진입한 외부 사이트의 거래 결과에 대해서는 회사가 책임지지 않습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제13조 (책임 제한 및 면책)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회사는 천재지변, 전쟁, 정전, 통신·전산 장애 등 불가항력적 사유로 서비스를 제공할 수 없는 경우 책임이 면제됩니다.</li>
            <li>회사는 회원의 귀책사유로 인한 서비스 이용 장애에 대해 책임지지 않습니다.</li>
            <li>회사는 회원이 게시한 정보·자료의 신뢰도, 정확성에 대해 보증하지 않으며, 그로 인한 손해에 책임지지 않습니다.</li>
            <li>회사는 회원 상호 간 또는 회원과 제3자 간에 서비스를 매개로 발생한 분쟁에 대해 개입할 의무가 없으며, 이로 인한 손해를 배상할 책임이 없습니다.</li>
            <li>회사는 무료 서비스 이용과 관련하여 관련 법령에 특별한 규정이 없는 한 책임을 지지 않습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제14조 (분쟁 해결)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회사는 회원의 정당한 의견·불만을 신속히 처리하기 위하여 고객센터를 운영합니다.</li>
            <li>회사와 회원 간 발생한 분쟁은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 콘텐츠분쟁조정위원회·한국소비자원 등에 조정을 신청할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제15조 (준거법 및 관할)</h2>
          <p>
            본 약관 및 서비스와 관련된 분쟁은 대한민국 법령을 준거법으로 하며, 분쟁이 발생할 경우
            「민사소송법」상의 관할 법원에 제기합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">사업자 정보</h2>
          <div className="rounded-lg border border-border bg-card p-4 space-y-1 text-foreground">
            <p>· 상호: <span className="text-muted-foreground">{v(info.business_name)}</span></p>
            <p>· 대표자: <span className="text-muted-foreground">{v(info.ceo_name)}</span></p>
            <p>· 사업자등록번호: <span className="text-muted-foreground">{v(info.business_number)}</span></p>
            <p>· 통신판매업신고번호: <span className="text-muted-foreground">{v(info.mailorder_number)}</span></p>
            <p>· 주소: <span className="text-muted-foreground">{v(info.address)}</span></p>
            <p>· 대표 전화: <span className="text-muted-foreground">{v(info.phone)}</span></p>
            <p>· 이메일: <span className="text-muted-foreground">{v(info.email)}</span></p>
            <p>· 호스팅 제공자: Vercel Inc., Supabase Inc., Cloudflare Inc.</p>
          </div>
        </section>

        <div className="mt-8 pt-6 border-t border-border text-xs text-muted-foreground">
          <p>· 공고일자: 2026년 5월 4일</p>
          <p>· 시행일자: 2026년 5월 4일</p>
          <p className="mt-2">본 약관은 회원이 동의함으로써 효력이 발생하며, 변경 시 사전에 공지합니다.</p>
        </div>
      </div>
    </main>
  )
}
