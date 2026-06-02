'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminPagination } from '@/components/admin/pagination'
import { useAdminTable } from '@/hooks/use-admin-table'
import { cn } from '@/lib/utils'
import { toast } from "sonner"
import {
  MessageSquare, Save, X, ChevronDown, ChevronUp,
  Search, Clock, CheckCircle2, XCircle, Loader2,
  User, Mail, Phone, Tag, CalendarDays, Send,
  MessageCircle, AlertCircle, Inbox,
} from 'lucide-react'

type Inquiry = {
  id: string
  user_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  category: string | null
  subject: string
  message: string
  status: string
  answer: string | null
  answered_by: string | null
  answered_at: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, {
  label: string
  icon: typeof Clock
  color: string
  bgColor: string
  dotColor: string
}> = {
  open: {
    label: '접수',
    icon: AlertCircle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    dotColor: 'bg-amber-500',
  },
  answered: {
    label: '답변완료',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    dotColor: 'bg-emerald-500',
  },
  closed: {
    label: '종료',
    icon: XCircle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    dotColor: 'bg-gray-400',
  },
}

export default function InquiryAdminPage() {
  const supabase = createClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [saving, setSaving] = useState(false)

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
  } = useAdminTable<Inquiry>({
    table: 'support_inquiries',
    searchColumns: ['subject', 'message', 'name', 'email', 'category'],
    pageSize: 50,
    orderBy: { column: 'created_at', ascending: false },
    applyFilter: (q) => (statusFilter === 'all' ? q : q.eq('status', statusFilter)),
    filterDeps: [statusFilter],
  })

  // 통계
  const stats = useMemo(() => {
    // Note: these are based on currently loaded page only
    const open = items.filter(i => i.status === 'open').length
    const answered = items.filter(i => i.status === 'answered').length
    const closed = items.filter(i => i.status === 'closed').length
    return { open, answered, closed }
  }, [items])

  const expand = (row: Inquiry) => {
    if (expandedId === row.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(row.id)
    setAnswerText(row.answer || '')
  }

  const saveAnswer = async (row: Inquiry) => {
    if (!answerText.trim()) return toast('답변 내용을 입력하세요.')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('support_inquiries')
        .update({
          answer: answerText,
          status: 'answered',
          answered_by: user?.id || null,
          answered_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (error) return toast.error('저장 실패: ' + error.message)
      setExpandedId(null)
      setAnswerText('')
      load()
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (row: Inquiry, s: string) => {
    const { error } = await supabase.from('support_inquiries').update({ status: s }).eq('id', row.id)
    if (error) return toast.error('변경 실패: ' + error.message)
    load()
  }

  const getTimeSince = (date: string) => {
    const now = new Date().getTime()
    const then = new Date(date).getTime()
    const diff = now - then
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 1) return '방금 전'
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}일 전`
    return `${Math.floor(days / 30)}개월 전`
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="1:1 문의 관리"
        description="사용자 문의를 확인하고 답변합니다"
        icon={<MessageSquare className="w-6 h-6" />}
        badge={
          stats.open > 0 ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 animate-pulse">
              {stats.open}건 미답변
            </span>
          ) : null
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.open}</div>
          <div className="text-xs text-muted-foreground mt-0.5">미답변</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.answered}</div>
          <div className="text-xs text-muted-foreground mt-0.5">답변완료</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-gray-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-400">{stats.closed}</div>
          <div className="text-xs text-muted-foreground mt-0.5">종료</div>
        </div>
      </div>

      {/* 안내 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">접수</span>
          </div>
          <p className="text-xs text-amber-600/80 dark:text-amber-400/60">아직 답변이 작성되지 않은 문의</p>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">답변완료</span>
          </div>
          <p className="text-xs text-emerald-600/80 dark:text-emerald-400/60">답변이 작성되어 사용자에게 전달됨</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">종료</span>
          </div>
          <p className="text-xs text-gray-500/80 dark:text-gray-400/60">처리 완료되어 더 이상 응대 불필요</p>
        </div>
      </div>

      {/* 필터 + 검색 */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="제목·내용·이름·이메일·카테고리 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(0)
          }}
        >
          <option value="all">모든 상태</option>
          <option value="open">접수(미답변)</option>
          <option value="answered">답변완료</option>
          <option value="closed">종료</option>
        </select>
      </div>

      {/* 페이지네이션 */}
      <AdminPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        setPage={setPage}
      />

      {/* 문의 목록 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">문의 목록을 불러오는 중...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Inbox className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">문의가 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">새로운 문의가 들어오면 여기에 표시됩니다</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-2">
            {items.map((row) => {
              const config = STATUS_CONFIG[row.status] || STATUS_CONFIG.open
              const StatusIcon = config.icon
              const isExpanded = expandedId === row.id

              return (
                <div
                  key={row.id}
                  className={cn(
                    "rounded-xl border bg-card transition-all hover:shadow-sm",
                    row.status === 'open' && "border-amber-200/60 dark:border-amber-900/30",
                  )}
                >
                  {/* 메인 행 */}
                  <button
                    type="button"
                    onClick={() => expand(row)}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      config.bgColor,
                    )}>
                      <StatusIcon className={cn("w-5 h-5", config.color)} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-sm truncate">{row.subject}</span>
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                          config.bgColor, config.color,
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
                          {config.label}
                        </span>
                        {row.category && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
                            {row.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {row.name || '익명'}
                        </span>
                        {row.email && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                            <span className="truncate">{row.email}</span>
                          </>
                        )}
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span>{getTimeSince(row.created_at)}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {/* 확장: 문의 내용 + 답변 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t mx-4 mb-2 mt-0 border-dashed space-y-4">
                      {/* 문의 정보 */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">문의자</div>
                          <div className="text-sm font-medium">{row.name || '익명'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">이메일</div>
                          <div className="text-sm font-medium truncate">{row.email || '-'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">전화번호</div>
                          <div className="text-sm font-medium">{row.phone || '-'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">접수일</div>
                          <div className="text-sm font-medium">
                            {new Date(row.created_at).toLocaleString('ko-KR')}
                          </div>
                        </div>
                      </div>

                      {/* 문의 내용 */}
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          문의 내용
                        </div>
                        <div className="whitespace-pre-wrap text-sm bg-muted/30 p-4 rounded-lg border border-dashed">
                          {row.message}
                        </div>
                      </div>

                      {/* 답변 작성 */}
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          답변
                        </div>
                        <Textarea
                          rows={5}
                          value={answerText}
                          onChange={(e) => setAnswerText(e.target.value)}
                          placeholder="답변을 입력하세요..."
                          className="resize-none"
                        />
                        <div className="text-[11px] text-muted-foreground text-right mt-1">
                          {answerText.length}자
                        </div>
                      </div>

                      {/* 액션 */}
                      <div className="flex items-center gap-2 pt-2 border-t border-dashed">
                        <Button size="sm" onClick={() => saveAnswer(row)} disabled={saving} className="gap-1.5">
                          {saving
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Save className="w-3.5 h-3.5" />}
                          답변 저장
                        </Button>
                        {row.status !== 'closed' && (
                          <Button variant="outline" size="sm" onClick={() => setStatus(row, 'closed')} className="gap-1.5">
                            <XCircle className="w-3.5 h-3.5" />
                            종료
                          </Button>
                        )}
                        {row.status !== 'open' && (
                          <Button variant="outline" size="sm" onClick={() => setStatus(row, 'open')} className="gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            다시 열기
                          </Button>
                        )}
                        {row.answered_at && (
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            답변일: {new Date(row.answered_at).toLocaleString('ko-KR')}
                          </span>
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
    </div>
  )
}
