import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { NoticeListClient, type NoticeItem } from "./notice-list"

export const dynamic = 'force-dynamic'

export default async function NoticePage() {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  // region 컬럼 미적용 환경 대비 — 실패하면 region 없이 재조회
  async function fetchNotices(withRegion: boolean) {
    let query = supabase
      .from('notices')
      .select(withRegion
        ? 'id, title, content, is_pinned, view_count, created_at, region'
        : 'id, title, content, is_pinned, view_count, created_at')
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      // 시군 공지가 최신 전체대상 공지에 밀려 누락되지 않게 충분히 가져옴 (클라에서 시군 필터)
      .limit(500)
    if (plaza) query = query.eq('plaza_id', plaza)
    return query
  }
  let res = await fetchNotices(true)
  if (res.error) res = await fetchNotices(false)

  const list = ((res.data ?? []) as any[]).map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    is_pinned: !!n.is_pinned,
    view_count: n.view_count ?? null,
    created_at: n.created_at,
    region: n.region ?? null,
  })) as NoticeItem[]

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
        <NoticeListClient notices={list} />
      </main>

      <BottomNav />
    </div>
  )
}
