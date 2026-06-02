// RSC — 정적 텍스트 + 광장별 사업자 정보 주입
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getCurrentPlazaBusinessInfo } from '@/lib/plaza/business-info'

export const metadata = {
  title: '개인정보처리방침 | 광장',
}

function v(s: string): string {
  return s && s.trim().length > 0 ? s.trim() : '[미등록]'
}

export default async function PrivacyPage() {
  const info = await getCurrentPlazaBusinessInfo()
  const isFilled = !!(info.business_name && info.ceo_name && info.business_number)
  return (
    <main className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center gap-4 px-4 h-14">
          <Link href="/">
            <ArrowLeft className="w-5 h-5 text-foreground hover:text-muted-foreground transition-colors" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">개인정보처리방침</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-sm text-muted-foreground leading-relaxed">

        {!isFilled && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-400">
            ※ 본 방침은 「개인정보 보호법」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등에 따른
            표준 양식으로 작성되었습니다. 현재 사업자 정보가 일부 비어있으며, 관리자 페이지의 <strong>설정 → 사업자 정보 (법적표시)</strong> 메뉴에서 입력 시 자동 반영됩니다.
          </div>
        )}

        <section>
          <p>
            <strong className="text-foreground">{v(info.business_name)}</strong>(이하 "회사")은 정보주체의 자유와 권리 보호를 위해
            「개인정보 보호법」 및 관계 법령이 정한 바를 준수하여, 적법하게 개인정보를 처리하고 안전하게 관리하고 있습니다.
            이에 「개인정보 보호법」 제30조에 따라 정보주체에게 개인정보 처리에 관한 절차 및 기준을 안내하고,
            이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보처리방침을 수립·공개합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제1조 (개인정보의 처리 목적)</h2>
          <p className="mb-2">회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리한 개인정보는 다음의 목적 이외의 용도로는 사용되지 않으며, 이용 목적이 변경될 시에는 별도의 동의를 받는 등 필요한 조치를 이행합니다.</p>
          <ul className="list-disc list-outside ml-5 space-y-1">
            <li>회원가입 및 관리: 회원 식별·인증, 회원자격 유지·관리, 부정이용 방지, 만 14세 미만 아동 회원가입 차단, 각종 고지·통지</li>
            <li>서비스 제공: 부동산 정보·중고거래·공동구매·로컬푸드·모임·게시판·채팅 등 콘텐츠 제공, 본인인증, 거래 중개</li>
            <li>고객 문의 응대 및 분쟁 해결</li>
            <li>유료 서비스 제공에 따른 요금 결제·정산, 환불</li>
            <li>마케팅 및 광고 활용(별도 동의 시): 신규 서비스 개발, 이벤트 및 프로모션 안내</li>
            <li>서비스 이용 통계 및 품질 개선</li>
            <li>법령상 의무 이행</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제2조 (처리하는 개인정보 항목 및 보유 기간)</h2>

          <div className="rounded-lg border border-border bg-card p-3 mb-3">
            <h3 className="font-semibold text-foreground text-sm mb-2">[필수] 회원가입·서비스 이용</h3>
            <p className="text-xs">· 항목: 이메일 주소, 비밀번호(암호화), 닉네임, 프로필 사진(선택)</p>
            <p className="text-xs">· 소셜 로그인 시: OAuth 제공자가 전달하는 식별자·이메일·이름</p>
            <p className="text-xs">· 자동 수집: IP 주소, 접속 일시, 기기·브라우저 정보, 쿠키, 서비스 이용 기록</p>
            <p className="text-xs mt-1">· 보유 기간: <strong>회원 탈퇴 시까지</strong>(아래 법령상 보관 항목 제외)</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-3 mb-3">
            <h3 className="font-semibold text-foreground text-sm mb-2">[선택] 거래·게시 활동</h3>
            <p className="text-xs">· 부동산 매물 정보(주소, 면적, 가격, 사진)</p>
            <p className="text-xs">· 중고거래·나눔·공동구매·로컬푸드 게시 정보, 채팅 메시지, 댓글</p>
            <p className="text-xs">· 위치 정보(읍·면·동 단위, 동의 시)</p>
            <p className="text-xs">· 전화번호·카카오 ID(거래 당사자 간 직접 연락용, 본인이 공개 선택 시)</p>
            <p className="text-xs mt-1">· 보유 기간: <strong>회원 탈퇴 시까지</strong>(거래 기록은 아래 법령에 따라 별도 보관)</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-3 mb-3">
            <h3 className="font-semibold text-foreground text-sm mb-2">[선택] 결제·포인트 충전</h3>
            <p className="text-xs">· 결제수단 정보(카드사명, 승인번호 등 — 카드번호는 PG사가 보관, 회사 미보관)</p>
            <p className="text-xs">· 결제 일시·금액·상품, 환불 내역</p>
            <p className="text-xs mt-1">· 보유 기간: <strong>전자상거래법 제6조에 따라 5년</strong></p>
          </div>

          <div className="rounded-lg border border-border bg-card p-3 mb-3">
            <h3 className="font-semibold text-foreground text-sm mb-2">[전문가 회원] 사업자 인증</h3>
            <p className="text-xs">· 공인중개사 자격번호, 사업자등록번호, 상호, 대표자명, 사업장 주소·연락처</p>
            <p className="text-xs">· 본인 신원 확인 자료(자격증 사본, 사업자등록증 사본 등)</p>
            <p className="text-xs mt-1">· 보유 기간: <strong>전문가 자격 유지 기간 + 5년</strong>(분쟁 대비)</p>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <h3 className="font-semibold text-foreground text-sm mb-2">법령에 따른 별도 보관</h3>
            <ul className="list-disc list-outside ml-5 text-xs space-y-1">
              <li>계약 또는 청약철회 등에 관한 기록: <strong>5년</strong>(전자상거래법)</li>
              <li>대금결제 및 재화 등의 공급에 관한 기록: <strong>5년</strong>(전자상거래법)</li>
              <li>소비자의 불만 또는 분쟁처리에 관한 기록: <strong>3년</strong>(전자상거래법)</li>
              <li>표시·광고에 관한 기록: <strong>6개월</strong>(전자상거래법)</li>
              <li>웹사이트 방문 기록·로그인 기록: <strong>3개월</strong>(통신비밀보호법)</li>
              <li>부정이용 기록: <strong>1년</strong>(부정 가입·이용 방지)</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제3조 (개인정보의 제3자 제공)</h2>
          <p className="mb-2">
            회사는 정보주체의 개인정보를 제1조의 처리 목적 범위 내에서만 처리하며,
            정보주체의 동의, 법률의 특별한 규정 등 「개인정보 보호법」 제17조에 해당하는 경우에만 제3자에게 제공합니다.
          </p>
          <ul className="list-disc list-outside ml-5 space-y-1">
            <li>거래 상대방 회원에게 본인이 공개한 닉네임·프로필·게시 정보·연락처(채팅·매물 등록 시)</li>
            <li>법령 또는 수사기관의 적법한 요청이 있는 경우</li>
            <li>분쟁 조정·해결을 위해 관련 기관(한국소비자원·콘텐츠분쟁조정위원회 등)이 적법하게 요청하는 경우</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제4조 (개인정보 처리의 위탁)</h2>
          <p className="mb-2">회사는 원활한 서비스 제공을 위해 개인정보 처리 업무를 다음과 같이 위탁하고 있으며, 「개인정보 보호법」 제26조에 따라 위탁계약 시 안전한 처리를 위한 사항을 규정하고 있습니다.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-border">
              <thead className="bg-muted">
                <tr>
                  <th className="border border-border p-2 text-left text-foreground">수탁자</th>
                  <th className="border border-border p-2 text-left text-foreground">위탁 업무</th>
                  <th className="border border-border p-2 text-left text-foreground">국가</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border border-border p-2">Supabase Inc.</td><td className="border border-border p-2">데이터베이스·인증·실시간 통신</td><td className="border border-border p-2">미국</td></tr>
                <tr><td className="border border-border p-2">Vercel Inc.</td><td className="border border-border p-2">웹 호스팅·CDN</td><td className="border border-border p-2">미국</td></tr>
                <tr><td className="border border-border p-2">Cloudflare, Inc.</td><td className="border border-border p-2">이미지·동영상 저장(R2), 보안</td><td className="border border-border p-2">미국</td></tr>
                <tr><td className="border border-border p-2">Sentry (Functional Software, Inc.)</td><td className="border border-border p-2">오류 모니터링</td><td className="border border-border p-2">미국</td></tr>
                <tr><td className="border border-border p-2">네이버 주식회사</td><td className="border border-border p-2">지도·주소 검색 API</td><td className="border border-border p-2">대한민국</td></tr>
                <tr><td className="border border-border p-2">카카오 주식회사</td><td className="border border-border p-2">소셜 로그인(선택 시)</td><td className="border border-border p-2">대한민국</td></tr>
                <tr><td className="border border-border p-2">[결제 PG사 — 추후 등록]</td><td className="border border-border p-2">결제·환불 처리</td><td className="border border-border p-2">대한민국</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs">국외 이전 시: 「개인정보 보호법」 제28조의8에 따라 본 방침의 게시로 동의 및 통지를 갈음하며, 정보주체는 별도로 거부 의사를 표시할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제5조 (정보주체의 권리·의무 및 행사방법)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>정보주체는 회사에 대해 언제든지 다음의 권리를 행사할 수 있습니다.
              <ul className="list-disc list-outside ml-5 mt-1.5 space-y-1">
                <li>개인정보 열람 요구</li>
                <li>오류 등이 있을 경우 정정 요구</li>
                <li>삭제 요구(법령상 보관 의무가 있는 경우 제외)</li>
                <li>처리 정지 요구</li>
              </ul>
            </li>
            <li>권리 행사는 마이페이지의 "프로필 정보 편집"·"회원 탈퇴" 또는 고객센터를 통해 가능하며, 회사는 지체 없이 조치합니다.</li>
            <li>대리인을 통한 권리 행사 시 위임장을 제출해야 합니다(개인정보 보호법 시행규칙 별지 제11호 서식).</li>
            <li>정보주체는 자신의 개인정보를 정확하게 유지할 의무가 있으며, 부정확한 정보 입력으로 발생하는 책임은 정보주체 본인에게 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제6조 (개인정보의 파기 절차 및 방법)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회사는 개인정보 보유기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 해당 개인정보를 파기합니다.</li>
            <li>파기 절차: 파기 사유 발생 시 개인정보 보호책임자의 승인을 받아 파기합니다.</li>
            <li>파기 방법:
              <ul className="list-disc list-outside ml-5 mt-1.5 space-y-1">
                <li>전자적 파일 형태: 복원이 불가능한 방식으로 영구 삭제</li>
                <li>종이 문서: 분쇄 또는 소각</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제7조 (개인정보의 안전성 확보 조치)</h2>
          <ul className="list-disc list-outside ml-5 space-y-1">
            <li><strong className="text-foreground">관리적 조치</strong>: 내부관리계획 수립·시행, 정기 직원 교육</li>
            <li><strong className="text-foreground">기술적 조치</strong>: 개인정보 암호화 저장 및 전송(HTTPS/TLS), 비밀번호 단방향 해시, 접근통제(RLS·IAM), 로그 보관·점검, 침입 방지·탐지 시스템</li>
            <li><strong className="text-foreground">물리적 조치</strong>: 데이터센터 보안(클라우드 사업자가 ISO 27001·SOC 2 등 인증 보유)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제8조 (쿠키 등 자동 수집 장치)</h2>
          <ol className="list-decimal list-outside ml-5 space-y-1.5">
            <li>회사는 이용자에게 개별 맞춤 서비스를 제공하기 위해 쿠키 및 유사 기술(local storage, session storage)을 사용합니다.</li>
            <li>수집 항목: 로그인 세션, 위치(광장) 선택값, 다크모드 설정, 채팅·검색 등 이용 기록</li>
            <li>이용자는 브라우저 설정에서 쿠키 저장을 거부할 수 있으나, 거부 시 일부 서비스 이용이 제한될 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제9조 (만 14세 미만 아동의 개인정보 보호)</h2>
          <p>
            회사는 만 14세 미만 아동의 개인정보를 수집하지 않습니다. 회원가입 시 만 14세 미만으로 확인되는 경우 가입이 제한되며,
            법정대리인의 동의가 확인된 경우에 한해 개별적으로 처리합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제10조 (개인정보 보호책임자)</h2>
          <div className="rounded-lg border border-border bg-card p-4 space-y-1 text-foreground">
            <p>· 개인정보 보호책임자: <span className="text-muted-foreground">{v(info.privacy_officer || info.ceo_name)}</span></p>
            <p>· 직책: <span className="text-muted-foreground">대표</span></p>
            <p>· 연락처: <span className="text-muted-foreground">{v(info.email)}</span></p>
          </div>
          <p className="mt-2">정보주체는 회사의 서비스를 이용하면서 발생한 모든 개인정보 보호 관련 문의·불만처리·피해구제 등에 관한 사항을 위 연락처로 문의할 수 있으며, 회사는 지체 없이 답변 및 처리해드립니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제11조 (권익침해 구제방법)</h2>
          <p className="mb-2">개인정보 침해로 인한 신고나 상담이 필요하신 경우 아래 기관에 문의하실 수 있습니다.</p>
          <ul className="list-disc list-outside ml-5 space-y-1">
            <li>개인정보 침해신고센터(KISA): <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener" className="underline text-primary">privacy.kisa.or.kr</a> / 국번없이 118</li>
            <li>개인정보 분쟁조정위원회: <a href="https://www.kopico.go.kr" target="_blank" rel="noopener" className="underline text-primary">www.kopico.go.kr</a> / 1833-6972</li>
            <li>대검찰청 사이버수사과: 국번없이 1301</li>
            <li>경찰청 사이버수사국: 국번없이 182</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">제12조 (개인정보처리방침의 변경)</h2>
          <p>
            본 방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경 내용의 추가·삭제 및 정정이 있는 경우에는
            변경사항의 시행 7일 전부터 서비스 내 공지사항을 통하여 고지합니다.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t border-border text-xs text-muted-foreground">
          <p>· 공고일자: 2026년 5월 4일</p>
          <p>· 시행일자: 2026년 5월 4일</p>
          <p>· 이전 버전: 2026년 4월 8일</p>
        </div>
      </div>
    </main>
  )
}
