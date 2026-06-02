import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { FaqAccordion } from "@/components/faq-accordion"

export const dynamic = 'force-dynamic'

interface Faq {
  id: string
  category: string
  question: string
  answer: string
  sort_order: number
}

export default async function FAQPage() {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q = supabase
    .from('faqs')
    .select('id, category, question, answer, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (plaza) q = q.eq('plaza_id', plaza)

  const { data } = await q
  const faqs = (data ?? []) as Faq[]

  // 카테고리별 그룹핑
  const grouped = new Map<string, Faq[]>()
  for (const f of faqs) {
    const c = f.category || 'general'
    if (!grouped.has(c)) grouped.set(c, [])
    grouped.get(c)!.push(f)
  }
  const groups = Array.from(grouped.entries())

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
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">{category}</h2>
              <FaqAccordion items={items.map((i) => ({ id: i.id, question: i.question, answer: i.answer }))} />
            </div>
          ))
        )}
      </main>

      <BottomNav />
    </div>
  )
}
