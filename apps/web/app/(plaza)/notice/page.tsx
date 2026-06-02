import { ArrowLeft, Megaphone } from "lucide-react"
import Link from "next/link"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"

export const dynamic = 'force-dynamic'

interface Notice {
  id: string
  title: string
  content: string
  is_pinned: boolean
  view_count: number | null
  created_at: string
}

export default async function NoticePage() {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let query = supabase
    .from('notices')
    .select('id, title, content, is_pinned, view_count, created_at')
    .eq('is_published', true)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)
  if (plaza) query = query.eq('plaza_id', plaza)

  const { data: notices } = await query

  const list = (notices ?? []) as Notice[]

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">공지사항</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Megaphone className="w-10 h-10 mb-3 text-muted-foreground/40" />
            <p className="text-sm">등록된 공지사항이 없습니다.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border bg-card rounded-2xl border border-border overflow-hidden">
            {list.map((n) => (
              <li key={n.id} className="p-4">
                <div className="flex items-start gap-2">
                  {n.is_pinned && (
                    <span className="shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 rounded">
                      고정
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground mb-1">{n.title}</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                      {n.content}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      {new Date(n.created_at).toLocaleDateString('ko-KR')}
                      {typeof n.view_count === 'number' && (
                        <span className="ml-2">조회 {n.view_count}</span>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
