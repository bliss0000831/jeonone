import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { FaqAccordion } from "@/components/faq-accordion"
import { listFaqs, type Faq } from "@gwangjang/features/support"

export const dynamic = 'force-dynamic'

export default async function FAQPage() {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  // DB faqs 우선, 없으면 어르신 친화 기본 FAQ(FALLBACK_FAQS) 표시
  const faqs: Faq[] = await listFaqs(supabase as any, plaza ?? undefined)

  // 카테고리별 그룹핑
  const grouped = new Map<string, Faq[]>()
  for (const f of faqs) {
    const c = f.category || 'general'
    if (!grouped.has(c)) grouped.set(c, [])
    grouped.get(c)!.push(f)
  }
  const groups = Array.from(grouped.entries())

  // 영문 카테고리 슬러그가 화면에 그대로 노출되지 않도록 한글 라벨 매핑 (미매핑은 원문 유지)
  const CATEGORY_LABEL: Record<string, string> = {
    general: '일반', account: '계정·로그인', posting: '글쓰기', trade: '거래',
    payment: '결제', points: '포인트', delivery: '배송', shipping: '배송',
    etc: '기타', other: '기타', faq: '자주 묻는 질문',
  }
  const labelFor = (c: string) => CATEGORY_LABEL[c.toLowerCase()] ?? c

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">자주 묻는 질문</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-sm">등록된 FAQ가 없습니다.</p>
          </div>
        ) : (
          groups.map(([category, items]) => (
            <div key={category} className="mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">{labelFor(category)}</h2>
              <FaqAccordion items={items.map((i) => ({ id: i.id, question: i.question, answer: i.answer }))} />
            </div>
          ))
        )}
      </main>

      <BottomNav />
    </div>
  )
}
