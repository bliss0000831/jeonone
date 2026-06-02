'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AdminPageHeader } from '@/components/admin/page-header'
import {
  LayoutList,
  Plus,
  Save,
  Trash2,
  Pencil,
  X,
  FileText,
  GripVertical,
  Hash,
  MessageSquare,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from "sonner"

type Category = {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number | null
  created_at: string
  is_active?: boolean | null
}

export default function BoardCategoriesAdminPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', description: '', sort_order: 0 })

  const load = async () => {
    setLoading(true)
    const plaza = getCurrentPlazaClient()
    let catQ: any = supabase
      .from('board_categories')
      .select('*')
      .order('sort_order', { ascending: true })
    if (plaza) catQ = catQ.eq('plaza_id', plaza)
    const { data, error } = await catQ
    if (error) toast.error('불러오기 실패: ' + error.message)
    const list = (data as Category[]) || []
    setItems(list)
    let postsQ: any = supabase.from('board_posts').select('id, category_id')
    if (plaza) postsQ = postsQ.eq('plaza_id', plaza)
    const { data: posts } = await postsQ
    const countMap: Record<string, number> = {}
    ;(posts || []).forEach((p: any) => {
      if (p.category_id) countMap[p.category_id] = (countMap[p.category_id] || 0) + 1
    })
    setCounts(countMap)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const totalPosts = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts])

  const resetForm = () => {
    setForm({ name: '', slug: '', description: '', sort_order: 0 })
    setAdding(false)
    setEditId(null)
  }

  const save = async () => {
    if (!form.name || !form.slug) return toast('이름과 슬러그는 필수입니다.')
    if (editId) {
      const { error } = await supabase.from('board_categories').update(form).eq('id', editId)
      if (error) return toast.error('수정 실패: ' + error.message)
    } else {
      const plaza = getCurrentPlazaClient()
      const { error } = await supabase
        .from('board_categories')
        .insert(plaza ? { ...form, plaza_id: plaza } : form)
      if (error) return toast.error('추가 실패: ' + error.message)
    }
    resetForm()
    load()
  }

  const startEdit = (row: Category) => {
    setEditId(row.id)
    setAdding(false)
    setForm({
      name: row.name,
      slug: row.slug,
      description: row.description || '',
      sort_order: row.sort_order || 0,
    })
  }

  const remove = async (row: Category) => {
    const postCount = counts[row.id] || 0
    const msg = postCount > 0
      ? `'${row.name}' 카테고리에 게시물 ${postCount}개가 있습니다.\n정말 삭제하시겠습니까?`
      : `'${row.name}' 카테고리를 삭제하시겠습니까?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('board_categories').delete().eq('id', row.id)
    if (error) return toast.error('삭제 실패: ' + error.message)
    load()
  }

  const moveOrder = async (row: Category, direction: 'up' | 'down') => {
    const idx = items.findIndex(i => i.id === row.id)
    if (direction === 'up' && idx <= 0) return
    if (direction === 'down' && idx >= items.length - 1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const other = items[swapIdx]
    const myOrder = row.sort_order ?? idx
    const otherOrder = other.sort_order ?? swapIdx
    await Promise.all([
      supabase.from('board_categories').update({ sort_order: otherOrder }).eq('id', row.id),
      supabase.from('board_categories').update({ sort_order: myOrder }).eq('id', other.id),
    ])
    load()
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="커뮤니티 게시판 관리"
        description="게시판 카테고리를 관리합니다"
        icon={LayoutList}
      />

      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <LayoutList className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">카테고리</p>
            <p className="text-xl font-bold">{items.length}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">총 게시물</p>
            <p className="text-xl font-bold">{totalPosts}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">평균 게시물</p>
            <p className="text-xl font-bold">{items.length > 0 ? Math.round(totalPosts / items.length) : 0}</p>
          </div>
        </div>
      </div>

      {/* 추가 버튼 */}
      <div className="flex justify-end">
        {!adding && !editId && (
          <Button onClick={() => { setAdding(true); setForm({ name: '', slug: '', description: '', sort_order: items.length + 1 }) }}>
            <Plus className="w-4 h-4 mr-1.5" />카테고리 추가
          </Button>
        )}
      </div>

      {/* 추가/수정 폼 */}
      {(adding || editId) && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <h3 className="font-semibold text-sm">{editId ? '카테고리 수정' : '새 카테고리 추가'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12px]">이름 *</Label>
              <Input
                value={form.name}
                onChange={(e) => {
                  setForm({
                    ...form,
                    name: e.target.value,
                    // 추가 모드일 때 이름에서 슬러그 자동 생성
                    ...(!editId && { slug: e.target.value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-') }),
                  })
                }}
                placeholder="예: 자유게시판"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">슬러그 *</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="예: free"
                className="font-mono text-[13px]"
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-[12px]">설명</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="카테고리에 대한 간단한 설명"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">정렬 순서</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={save} size="sm">
              <Save className="w-3.5 h-3.5 mr-1.5" />{editId ? '수정 저장' : '추가'}
            </Button>
            <Button variant="ghost" onClick={resetForm} size="sm">
              <X className="w-3.5 h-3.5 mr-1.5" />취소
            </Button>
          </div>
        </div>
      )}

      {/* 카테고리 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <LayoutList className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">카테고리가 없습니다</p>
          <p className="text-xs mt-1">위 버튼으로 첫 카테고리를 추가해보세요</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          {items.map((row, idx) => {
            const postCount = counts[row.id] || 0
            const isEditing = editId === row.id
            return (
              <div
                key={row.id}
                className={cn(
                  'flex items-center gap-4 px-5 py-4 border-b border-border/50 last:border-0 transition-colors',
                  isEditing ? 'bg-primary/5' : 'hover:bg-accent/30',
                )}
              >
                {/* 순서 */}
                <div className="flex flex-col items-center gap-0.5 w-6 flex-shrink-0">
                  <button
                    onClick={() => moveOrder(row, 'up')}
                    disabled={idx === 0}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-20 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{row.sort_order ?? idx + 1}</span>
                  <button
                    onClick={() => moveOrder(row, 'down')}
                    disabled={idx === items.length - 1}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-20 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>

                {/* 아이콘 */}
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                  <Hash className="w-4 h-4 text-blue-500" />
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[14px]">{row.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-muted/50 text-muted-foreground">
                      {row.slug}
                    </Badge>
                  </div>
                  {row.description && (
                    <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{row.description}</p>
                  )}
                </div>

                {/* 게시물 수 */}
                <div className="flex items-center gap-1.5 flex-shrink-0 min-w-[80px]">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className={cn(
                    'text-[13px] font-semibold tabular-nums',
                    postCount > 0 ? 'text-foreground' : 'text-muted-foreground/40',
                  )}>
                    {postCount}
                  </span>
                  <span className="text-[11px] text-muted-foreground">게시물</span>
                </div>

                {/* 액션 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(row)}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="수정"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(row)}
                    className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors dark:hover:bg-red-950/30"
                    title="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
