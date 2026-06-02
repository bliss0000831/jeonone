'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import { toast } from "sonner"
import {
  HelpCircle, Plus, Save, Trash2, Pencil, X,
  Loader2, Search, Eye, EyeOff, ChevronDown, ChevronUp,
  MessageSquareText, Tag, GripVertical, CheckCircle2,
  Hash, ToggleLeft, Inbox,
} from 'lucide-react'

type Faq = {
  id: string
  category: string | null
  question: string
  answer: string
  sort_order: number | null
  is_active: boolean
  created_at: string
}

export default function FaqAdminPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Faq[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [form, setForm] = useState({
    category: '',
    question: '',
    answer: '',
    sort_order: 0,
    is_active: true,
  })

  const load = async () => {
    setLoading(true)
    const plaza = getCurrentPlazaClient()
    let q: any = supabase
      .from('faqs')
      .select('*')
      .order('sort_order', { ascending: true })
    if (plaza) q = q.eq('plaza_id', plaza)
    const { data, error } = await q
    if (error) toast.error('불러오기 실패: ' + error.message)
    setItems((data as Faq[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // 통계
  const stats = useMemo(() => {
    const active = items.filter(f => f.is_active).length
    const inactive = items.filter(f => !f.is_active).length
    const categories = [...new Set(items.map(f => f.category).filter(Boolean))]
    return { total: items.length, active, inactive, categoryCount: categories.length }
  }, [items])

  // 카테고리 목록
  const categories = useMemo(() => {
    const cats: Record<string, number> = {}
    items.forEach(f => {
      const c = f.category || '미분류'
      cats[c] = (cats[c] || 0) + 1
    })
    return cats
  }, [items])

  // 필터링
  const filtered = useMemo(() => {
    let result = items
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(f =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category?.toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== 'all') {
      result = result.filter(f => (f.category || '미분류') === categoryFilter)
    }
    return result
  }, [items, searchQuery, categoryFilter])

  const resetForm = () => {
    setForm({ category: '', question: '', answer: '', sort_order: 0, is_active: true })
    setShowForm(false)
    setEditId(null)
  }

  const openCreate = () => {
    setEditId(null)
    setForm({ category: '', question: '', answer: '', sort_order: items.length + 1, is_active: true })
    setShowForm(true)
  }

  const openEdit = (row: Faq) => {
    setEditId(row.id)
    setForm({
      category: row.category || '',
      question: row.question,
      answer: row.answer,
      sort_order: row.sort_order || 0,
      is_active: row.is_active,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.question || !form.answer) return toast('질문과 답변은 필수입니다.')
    setSaving(true)
    try {
      if (editId) {
        const plaza = getCurrentPlazaClient()
        let q = supabase.from('faqs').update(form).eq('id', editId)
        if (plaza) q = q.eq('plaza_id', plaza)
        const { error } = await q
        if (error) return toast.error('수정 실패: ' + error.message)
      } else {
        const plaza = getCurrentPlazaClient()
        const { error } = await supabase
          .from('faqs')
          .insert(plaza ? { ...form, plaza_id: plaza } : form)
        if (error) return toast.error('추가 실패: ' + error.message)
      }
      resetForm()
      load()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: Faq) => {
    const plaza = getCurrentPlazaClient()
    let q = supabase.from('faqs').update({ is_active: !row.is_active }).eq('id', row.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error('변경 실패: ' + error.message)
    load()
  }

  const remove = async (id: string) => {
    const plaza = getCurrentPlazaClient()
    let q = supabase.from('faqs').delete().eq('id', id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error('삭제 실패: ' + error.message)
    setDeleteConfirm(null)
    load()
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="FAQ 관리"
        description="자주 묻는 질문과 답변을 관리합니다"
        icon={<HelpCircle className="w-6 h-6" />}
        badge={
          stats.total > 0 ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {stats.total}개 등록
            </span>
          ) : null
        }
        actions={
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            FAQ 추가
          </Button>
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquareText className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-0.5">전체 FAQ</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Eye className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.active}</div>
          <div className="text-xs text-muted-foreground mt-0.5">활성</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <EyeOff className="w-4 h-4 text-gray-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-400">{stats.inactive}</div>
          <div className="text-xs text-muted-foreground mt-0.5">비활성</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
              <Tag className="w-4 h-4 text-violet-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-violet-600">{stats.categoryCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">카테고리</div>
        </div>
      </div>

      {/* 카테고리 필터 칩 */}
      {Object.keys(categories).length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter('all')}
            className={cn(
              "px-3 py-1.5 text-xs rounded-full border transition-all",
              categoryFilter === 'all'
                ? "bg-primary text-primary-foreground border-primary font-semibold"
                : "border-border hover:border-primary/50 text-muted-foreground"
            )}
          >
            전체 ({items.length})
          </button>
          {Object.entries(categories).map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-full border transition-all",
                categoryFilter === cat
                  ? "bg-violet-50 text-violet-600 border-violet-300 font-semibold dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-700"
                  : "border-border hover:border-primary/50 text-muted-foreground"
              )}
            >
              {cat} ({count})
            </button>
          ))}
        </div>
      )}

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="질문·답변·카테고리 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* FAQ 목록 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">FAQ를 불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <HelpCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">
              {items.length === 0 ? 'FAQ가 없습니다' : '검색 결과가 없습니다'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {items.length === 0
                ? '자주 묻는 질문을 추가해보세요'
                : '검색어나 필터를 변경해보세요'}
            </p>
          </div>
          {items.length === 0 && (
            <Button onClick={openCreate} size="sm" className="gap-1.5 mt-2">
              <Plus className="w-3.5 h-3.5" />
              첫 FAQ 추가
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length}개</p>
          <div className="space-y-2">
            {filtered.map((row, idx) => {
              const isExpanded = expandedId === row.id
              return (
                <div
                  key={row.id}
                  className={cn(
                    "rounded-xl border bg-card transition-all hover:shadow-sm",
                    !row.is_active && "opacity-50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    {/* 순서 번호 */}
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-muted-foreground">
                        Q{row.sort_order || idx + 1}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-sm">{row.question}</span>
                        {!row.is_active && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                            비활성
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {row.category && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400">
                            <Tag className="w-2.5 h-2.5" />
                            {row.category}
                          </span>
                        )}
                        <span className="truncate text-muted-foreground/70">
                          {row.answer.length > 60 ? row.answer.slice(0, 60) + '...' : row.answer}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t mx-4 mb-2 mt-0 border-dashed space-y-3">
                      {/* 답변 */}
                      <div className="pt-3">
                        <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                          <MessageSquareText className="w-3 h-3" />
                          답변
                        </div>
                        <div className="whitespace-pre-wrap text-sm bg-muted/30 p-4 rounded-lg border border-dashed">
                          {row.answer}
                        </div>
                      </div>

                      {/* 메타 정보 */}
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">카테고리</div>
                          <div className="text-sm font-medium">{row.category || '미분류'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">정렬순서</div>
                          <div className="text-sm font-medium">{row.sort_order ?? 0}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">등록일</div>
                          <div className="text-sm font-medium">{new Date(row.created_at).toLocaleDateString('ko-KR')}</div>
                        </div>
                      </div>

                      {/* 액션 */}
                      <div className="flex items-center gap-2 pt-2 border-t border-dashed">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>
                          <Pencil className="w-3.5 h-3.5" />
                          수정
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={(e) => { e.stopPropagation(); toggleActive(row) }}
                        >
                          {row.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {row.is_active ? '비활성화' : '활성화'}
                        </Button>
                        <div className="flex-1" />
                        {deleteConfirm === row.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-destructive mr-1">삭제할까요?</span>
                            <Button variant="destructive" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); remove(row.id) }}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row.id) }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            삭제
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* FAQ 추가/수정 모달 */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'FAQ 수정' : '새 FAQ 추가'}</DialogTitle>
            <DialogDescription>
              {editId ? 'FAQ를 수정합니다' : '자주 묻는 질문과 답변을 추가합니다'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>카테고리</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="예: 결제, 회원"
                />
              </div>
              <div className="space-y-1.5">
                <Label>정렬순서</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <div className="p-3 rounded-lg border bg-muted/30 flex items-center gap-3 w-full">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                  <Label className="text-sm">활성</Label>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>질문 <span className="text-destructive">*</span></Label>
              <Input
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder="자주 묻는 질문을 입력하세요"
              />
            </div>

            <div className="space-y-1.5">
              <Label>답변 <span className="text-destructive">*</span></Label>
              <Textarea
                rows={6}
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                placeholder="답변 내용을 입력하세요"
                className="resize-none"
              />
              <div className="text-[11px] text-muted-foreground text-right">{form.answer.length}자</div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={resetForm}>취소</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />저장 중...</> : (editId ? '수정 완료' : 'FAQ 추가')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
