'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminPagination } from '@/components/admin/pagination'
import { useAdminTable } from '@/hooks/use-admin-table'
import { cn } from '@/lib/utils'
import { toast } from "sonner"
import {
  Megaphone, Plus, Save, Trash2, Pencil, X,
  Loader2, Search, Pin, PinOff, Eye, EyeOff,
  ChevronDown, ChevronUp, FileText, Clock,
  CheckCircle2, AlertTriangle, Newspaper,
} from 'lucide-react'

type Notice = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  is_published: boolean
  author_id: string | null
  view_count: number | null
  created_at: string
  updated_at: string | null
}

export default function NoticeAdminPage() {
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    is_pinned: false,
    is_published: true,
  })

  const {
    rows: items,
    loading,
    page,
    setPage,
    pageSize,
    totalCount,
    totalPages,
    search,
    setSearch,
    reload: load,
  } = useAdminTable<Notice>({
    table: 'notices',
    searchColumns: ['title', 'content'],
    pageSize: 50,
    orderBy: { column: 'is_pinned', ascending: false },
    applyFilter: (q) => q.order('created_at', { ascending: false }),
  })

  // 통계
  const stats = useMemo(() => {
    const pinned = items.filter(n => n.is_pinned).length
    const published = items.filter(n => n.is_published).length
    const draft = items.filter(n => !n.is_published).length
    const totalViews = items.reduce((sum, n) => sum + (n.view_count || 0), 0)
    return { total: totalCount, pinned, published, draft, totalViews }
  }, [items, totalCount])

  const resetForm = () => {
    setForm({ title: '', content: '', is_pinned: false, is_published: true })
    setShowForm(false)
    setEditId(null)
  }

  const openCreate = () => {
    setEditId(null)
    setForm({ title: '', content: '', is_pinned: false, is_published: true })
    setShowForm(true)
  }

  const openEdit = (row: Notice) => {
    setEditId(row.id)
    setForm({
      title: row.title,
      content: row.content,
      is_pinned: row.is_pinned,
      is_published: row.is_published,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.title || !form.content) return toast('제목과 내용은 필수입니다.')
    setSaving(true)
    try {
      if (editId) {
        const { error } = await supabase
          .from('notices')
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq('id', editId)
        if (error) return toast.error('수정 실패: ' + error.message)
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const plaza = getCurrentPlazaClient()
        const { error } = await supabase.from('notices').insert({
          ...form,
          author_id: user?.id || null,
          ...(plaza ? { plaza_id: plaza } : {}),
        })
        if (error) return toast.error('추가 실패: ' + error.message)
      }
      resetForm()
      load()
    } finally {
      setSaving(false)
    }
  }

  const togglePin = async (row: Notice) => {
    const plaza = getCurrentPlazaClient()
    let q = supabase.from('notices').update({ is_pinned: !row.is_pinned }).eq('id', row.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error('변경 실패: ' + error.message)
    load()
  }

  const togglePublished = async (row: Notice) => {
    const plaza = getCurrentPlazaClient()
    let q = supabase.from('notices').update({ is_published: !row.is_published }).eq('id', row.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error('변경 실패: ' + error.message)
    load()
  }

  const remove = async (id: string) => {
    const plaza = getCurrentPlazaClient()
    let q = supabase.from('notices').delete().eq('id', id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error('삭제 실패: ' + error.message)
    setDeleteConfirm(null)
    load()
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="공지사항 관리"
        description="사용자에게 전달할 공지사항을 작성하고 관리합니다"
        icon={<Megaphone className="w-6 h-6" />}
        badge={
          stats.pinned > 0 ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              {stats.pinned}건 고정
            </span>
          ) : null
        }
        actions={
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            공지 추가
          </Button>
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-0.5">전체 공지</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Eye className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.published}</div>
          <div className="text-xs text-muted-foreground mt-0.5">게시중</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Pin className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.pinned}</div>
          <div className="text-xs text-muted-foreground mt-0.5">상단 고정</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <EyeOff className="w-4 h-4 text-gray-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-400">{stats.draft}</div>
          <div className="text-xs text-muted-foreground mt-0.5">비공개</div>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="제목·내용 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 페이지네이션 */}
      <AdminPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        setPage={setPage}
      />

      {/* 공지사항 목록 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">공지사항을 불러오는 중...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Megaphone className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">공지사항이 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">첫 공지사항을 작성해보세요</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5 mt-2">
            <Plus className="w-3.5 h-3.5" />
            첫 공지 작성
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-2">
            {items.map((row) => {
              const isExpanded = expandedId === row.id
              return (
                <div
                  key={row.id}
                  className={cn(
                    "rounded-xl border bg-card transition-all hover:shadow-sm",
                    row.is_pinned && "border-amber-200/60 dark:border-amber-900/30",
                    !row.is_published && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    {/* 아이콘 */}
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      row.is_pinned
                        ? "bg-amber-50 dark:bg-amber-950/30"
                        : "bg-muted",
                    )}>
                      {row.is_pinned
                        ? <Pin className="w-5 h-5 text-amber-600" />
                        : <FileText className="w-5 h-5 text-muted-foreground" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-sm truncate">{row.title}</span>
                        {row.is_pinned && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                            고정
                          </span>
                        )}
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                          row.is_published
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                            : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            row.is_published ? "bg-emerald-500" : "bg-gray-400"
                          )} />
                          {row.is_published ? '게시중' : '비공개'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(row.created_at).toLocaleDateString('ko-KR')}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          조회 {row.view_count || 0}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t mx-4 mb-2 mt-0 border-dashed space-y-3">
                      {/* 본문 미리보기 */}
                      <div className="pt-3">
                        <div className="whitespace-pre-wrap text-sm bg-muted/30 p-4 rounded-lg border border-dashed max-h-48 overflow-y-auto">
                          {row.content}
                        </div>
                      </div>

                      {row.updated_at && (
                        <div className="text-[11px] text-muted-foreground">
                          마지막 수정: {new Date(row.updated_at).toLocaleString('ko-KR')}
                        </div>
                      )}

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
                          onClick={(e) => { e.stopPropagation(); togglePin(row) }}
                        >
                          {row.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          {row.is_pinned ? '고정해제' : '고정'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={(e) => { e.stopPropagation(); togglePublished(row) }}
                        >
                          {row.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {row.is_published ? '비공개' : '게시'}
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

      {/* 공지 추가/수정 모달 */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? '공지 수정' : '새 공지 작성'}</DialogTitle>
            <DialogDescription>
              {editId ? '공지사항을 수정합니다' : '새로운 공지사항을 작성합니다'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>제목 <span className="text-destructive">*</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="공지사항 제목"
              />
            </div>
            <div className="space-y-1.5">
              <Label>내용 <span className="text-destructive">*</span></Label>
              <Textarea
                rows={10}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="공지사항 내용을 입력하세요"
                className="resize-none"
              />
              <div className="text-[11px] text-muted-foreground text-right">{form.content.length}자</div>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">상단 고정</p>
                  <p className="text-xs text-muted-foreground mt-0.5">목록 최상단에 고정 표시합니다</p>
                </div>
                <Switch
                  checked={form.is_pinned}
                  onCheckedChange={(v) => setForm({ ...form, is_pinned: v })}
                />
              </div>
              <div className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">즉시 게시</p>
                  <p className="text-xs text-muted-foreground mt-0.5">비활성 시 비공개로 저장됩니다</p>
                </div>
                <Switch
                  checked={form.is_published}
                  onCheckedChange={(v) => setForm({ ...form, is_published: v })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={resetForm}>취소</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />저장 중...</> : (editId ? '수정 완료' : '공지 등록')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
