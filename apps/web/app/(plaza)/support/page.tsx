import {
  ArrowLeft,
  Mail,
  MessageCircle,
  Clock,
  ChevronRight,
  HelpCircle,
  FileText,
  Megaphone,
  Shield,
  Info,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { BottomNav } from "@/components/bottom-nav"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { createClient } from "@/lib/supabase/server"

const SUPPORT_EMAIL = "ikdohyeon@gmail.com"

export default async function SupportPage() {
  const plazaId = await getCurrentPlaza()
  let plazaName = "전원일기"
  if (plazaId) {
    const supabase = await createClient()
    const { data } = await supabase.from("plazas").select("name").eq("id", plazaId).maybeSingle()
    if (data?.name) plazaName = data.name
  }
  return (
    <div className="min-h-screen bg-muted/30 pb-20 md:pb-0">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">고객센터</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* 안내 카드 */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/15 p-5">
          <h2 className="text-base font-bold text-foreground mb-1">무엇을 도와드릴까요?</h2>
          <p className="text-xs text-muted-foreground">
            궁금한 점이 있으시면 자주 묻는 질문을 먼저 확인해주세요. 그래도 해결되지 않으면 이메일로 문의해주시기 바랍니다.
          </p>
        </div>

        {/* 문의 채널 */}
        <section>
          <h2 className="px-1 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
            문의 채널
          </h2>
          <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=%5B%EC%A0%84%EC%9B%90%EC%9D%BC%EA%B8%B0%5D%20%EB%AC%B8%EC%9D%98`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 border-b border-border/60 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10 flex-shrink-0">
                <Mail className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">이메일 문의</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{SUPPORT_EMAIL}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </a>

            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-500/10 flex-shrink-0">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">운영 시간</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  평일 10:00 – 18:00 (점심 12:00 – 13:00, 주말·공휴일 휴무)
                </p>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 px-1">
            · 영업일 기준 1~2일 내 답변드리며, 문의량이 많은 경우 다소 지연될 수 있습니다.
          </p>
        </section>

        {/* 신속 안내 */}
        <section>
          <h2 className="px-1 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
            바로가기
          </h2>
          <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
            <Link
              href="/faq"
              className="flex items-center gap-3 px-4 py-3 border-b border-border/60 hover:bg-secondary/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-cyan-500/10 flex-shrink-0">
                <HelpCircle className="w-5 h-5 text-cyan-600" />
              </div>
              <span className="flex-1 text-sm font-medium text-foreground">자주 묻는 질문</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link
              href="/notice"
              className="flex items-center gap-3 px-4 py-3 border-b border-border/60 hover:bg-secondary/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-500/10 flex-shrink-0">
                <Megaphone className="w-5 h-5 text-amber-600" />
              </div>
              <span className="flex-1 text-sm font-medium text-foreground">공지사항</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link
              href="/terms"
              className="flex items-center gap-3 px-4 py-3 border-b border-border/60 hover:bg-secondary/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-500/10 flex-shrink-0">
                <FileText className="w-5 h-5 text-slate-600" />
              </div>
              <span className="flex-1 text-sm font-medium text-foreground">이용약관</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link
              href="/privacy"
              className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-500/10 flex-shrink-0">
                <Shield className="w-5 h-5 text-slate-600" />
              </div>
              <span className="flex-1 text-sm font-medium text-foreground">개인정보처리방침</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          </div>
        </section>

        {/* 신고/분쟁 안내 */}
        <section>
          <h2 className="px-1 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            신고 및 분쟁
          </h2>
          <div className="rounded-2xl bg-card border border-border shadow-sm p-4 space-y-3 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">허위 매물·사기·욕설·음란물 등</strong>은 게시물 우측 메뉴의
              "신고하기" 또는 채팅방 우측 메뉴의 "신고하기" 를 통해 접수해주세요. 일정 횟수 이상 신고가 누적되면 자동 임시조치되며, 운영팀이 검토 후 후속 조치합니다.
            </p>
            <p>
              회원 간 거래 분쟁(매물·중고·공동구매 등)에서 회사는 통신판매중개자로서 거래 당사자가 아닙니다.
              필요 시 다음 기관에 도움을 요청할 수 있습니다.
            </p>
            <ul className="list-disc list-outside ml-5 space-y-0.5">
              <li>한국소비자원: 1372 / <a className="underline text-primary" href="https://www.kca.go.kr" target="_blank" rel="noopener">www.kca.go.kr</a></li>
              <li>전자거래분쟁조정위원회: <a className="underline text-primary" href="https://www.ecmc.or.kr" target="_blank" rel="noopener">www.ecmc.or.kr</a></li>
              <li>경찰청 사이버수사국: 국번없이 182</li>
              <li>개인정보 침해신고센터(KISA): 국번없이 118</li>
            </ul>
          </div>
        </section>

        {/* 1:1 문의 — mailto 로 직접 연결 */}
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=%5B%EC%A0%84%EC%9B%90%EC%9D%BC%EA%B8%B0%5D%201%3A1%20%EB%AC%B8%EC%9D%98`}
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          <MessageCircle className="w-5 h-5" />
          1:1 이메일 문의 보내기
        </a>

        {/* 시범 운영 안내 */}
        <section className="pt-2">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 mb-3">
            <p className="text-base font-bold text-amber-900 mb-1">시범 운영 중이에요</p>
            <p className="text-sm text-amber-800 leading-relaxed">
              지금은 정식 출시 전이라 일부 거래·결제 기능이 점검 중입니다. 사업자 등록과 결제 연동이 완료되면 안내드릴게요.
            </p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-4 text-sm text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Info className="w-4 h-4" />
              <span className="font-bold text-foreground">사업자 정보</span>
            </div>
            <p>· 상호: 등록 예정 (정식 출시 시)</p>
            <p>· 대표: 등록 예정</p>
            <p>· 사업자등록번호: 등록 예정</p>
            <p>· 통신판매업신고: 등록 예정</p>
            <p>· 주소: 등록 예정</p>
            <p>· 이메일: {SUPPORT_EMAIL}</p>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">{plazaName} v1.0.0</p>
          <p className="text-center text-[10px] text-muted-foreground mt-1">
            © 2026 {plazaName}. All rights reserved.
          </p>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
