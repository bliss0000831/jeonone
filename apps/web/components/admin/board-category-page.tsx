'use client'
import { useEffect, useState, ComponentType } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminDataTable } from '@/components/admin/data-table'
import { Pin, PinOff, Trash2 } from 'lucide-react'
import { toast } from "sonner"

type Post = {
  id: string
  title: string
  author_name: string | null
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  is_pinned: boolean | null
  created_at: string
  category_id: string | null
}

interface Props {
  title: string
  description: string
  slug: string
  icon: ComponentType<{ className?: string }>
}

export function AdminBoardCategoryPage({ title, description, slug, icon }: Props) {
  const supabase = createClient()
  const [items, setItems] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const plaza = getCurrentPlazaClient()
    let catQ: any = supabase.from('board_categories').select('id').eq('slug', slug)
    if (plaza) catQ = catQ.eq('plaza_id', plaza)
    const { data: cat, error: catErr } = await catQ.single()
    if (catErr || !cat) {
      toast.error(`카테고리(${slug})를 찾을 수 없습니다.`)
      setItems([])
      setLoading(false)
      return
    }
    let postsQ: any = supabase
      .from('board_posts')
      .select('*')
      .eq('category_id', cat.id)
      .order('created_at', { ascending: false })
    if (plaza) postsQ = postsQ.eq('plaza_id', plaza)
    const { data, error } = await postsQ
    if (error) toast.error('불러오기 실패: ' + error.message)
    setItems((data as Post[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()

  }, [slug])

  const togglePin = async (row: Post) => {
    const { error } = await supabase
      .from('board_posts')
      .update({ is_pinned: !row.is_pinned })
      .eq('id', row.id)
    if (error) return toast.error('변경 실패: ' + error.message)
    load()
  }

  const remove = async (row: Post) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    // 삭제 전에 이미지/썸네일 URL 수집 (R2 정리용)
    const { data: full } = await supabase
      .from('board_posts')
      .select('images, thumbnail_url')
      .eq('id', row.id)
      .single()
    const urls = [
      ...(((full as any)?.images as string[] | null) || []),
      (full as any)?.thumbnail_url,
    ].filter((u): u is string => !!u)

    const { error } = await supabase.from('board_posts').delete().eq('id', row.id)
    if (error) return toast.error('삭제 실패: ' + error.message)
    if (urls.length > 0) {
      fetch('/api/r2-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      }).catch(() => {})
    }
    load()
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title={title} description={description} icon={icon} />
      <AdminDataTable
        loading={loading}
        data={items}
        columns={[
          {
            key: 'title',
            header: '제목',
            render: (r: Post) => (
              <div className="flex items-center gap-2">
                {r.is_pinned && <Badge className="bg-amber-500 text-white">고정</Badge>}
                <span>{r.title}</span>
              </div>
            ),
          },
          { key: 'author_name', header: '작성자', render: (r: Post) => r.author_name || '-' },
          { key: 'view_count', header: '조회', render: (r: Post) => r.view_count || 0 },
          { key: 'like_count', header: '좋아요', render: (r: Post) => r.like_count || 0 },
          { key: 'comment_count', header: '댓글', render: (r: Post) => r.comment_count || 0 },
          {
            key: 'created_at',
            header: '작성일',
            render: (r: Post) => new Date(r.created_at).toLocaleString('ko-KR'),
          },
          {
            key: 'actions',
            header: '관리',
            render: (r: Post) => (
              <div className="flex gap-0.5 justify-end">
                <button
                  onClick={() => togglePin(r)}
                  className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  title={r.is_pinned ? '고정 해제' : '고정'}
                >
                  {r.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => remove(r)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors dark:hover:bg-red-950/30"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
