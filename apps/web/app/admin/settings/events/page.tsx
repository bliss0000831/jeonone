'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { AdminPageHeader } from '@/components/admin/page-header'
import {
  Plus, Pencil, Trash2, Loader2, Calendar, X, Check,
  Search, MapPin, Link2, Eye, EyeOff, ChevronDown, ChevronUp,
  CalendarDays, CalendarCheck, CalendarX, Filter, Sparkles,
  PartyPopper, Trophy, Palette, Store, TreePine, Users, Tag,
  ExternalLink, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChuncheonEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  event_date: string
  end_date: string | null
  category: string
  color: string
  is_active: boolean
  link_url: string | null
  created_at: string
}

const CATEGORIES = [
  { value: 'festival', label: '축제/행사', icon: PartyPopper, color: 'text-pink-600', bgColor: 'bg-pink-50 dark:bg-pink-950/30' },
  { value: 'sports', label: '스포츠', icon: Trophy, color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950/30' },
  { value: 'culture', label: '문화', icon: Palette, color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-950/30' },
  { value: 'market', label: '시장/장터', icon: Store, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-950/30' },
  { value: 'nature', label: '자연/환경', icon: TreePine, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30' },
  { value: 'community', label: '지역사회', icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
  { value: 'general', label: '일반', icon: Tag, color: 'text-gray-500', bgColor: 'bg-gray-50 dark:bg-gray-900/50' },
]

const COLORS = [
  { value: '#10b981', label: '에메랄드' },
  { value: '#3b82f6', label: '블루' },
  { value: '#f59e0b', label: '앰버' },
  { value: '#ef4444', label: '레드' },
  { value: '#8b5cf6', label: '바이올렛' },
  { value: '#ec4899', label: '핑크' },
  { value: '#14b8a6', label: '틸' },
  { value: '#f97316', label: '오렌지' },
]

const EMPTY_FORM = {
  title: '',
  description: '',
  location: '',
  event_date: '',
  end_date: '',
  category: 'general',
  color: '#10b981',
  is_active: true,
  link_url: '',
}

type StatusType = 'all' | 'upcoming' | 'ongoing' | 'past'

function getEventStatus(ev: ChuncheonEvent): 'upcoming' | 'ongoing' | 'past' {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const start = new Date(ev.event_date)
  start.setHours(0, 0, 0, 0)
  const end = ev.end_date ? new Date(ev.end_date) : new Date(ev.event_date)
  end.setHours(23, 59, 59, 999)

  if (now < start) return 'upcoming'
  if (now > end) return 'past'
  return 'ongoing'
}

const STATUS_CONFIG = {
  upcoming: {
    label: '예정',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    dotColor: 'bg-blue-500',
  },
  ongoing: {
    label: '진행중',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    dotColor: 'bg-emerald-500',
  },
  past: {
    label: '종료',
    color: 'text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    dotColor: 'bg-gray-400',
  },
}

export default function AdminEventsPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<ChuncheonEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusType>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchEvents = async () => {
    const plaza = getCurrentPlazaClient()
    let q: any = supabase
      .from('chuncheon_events')
      .select('*')
      .order('event_date', { ascending: true })
    if (plaza) q = q.eq('plaza_id', plaza)
    const { data, error } = await q
    if (!error) setEvents(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchEvents() }, [])

  // 통계
  const stats = useMemo(() => {
    const active = events.filter(e => e.is_active)
    const upcoming = events.filter(e => getEventStatus(e) === 'upcoming' && e.is_active)
    const ongoing = events.filter(e => getEventStatus(e) === 'ongoing' && e.is_active)
    const past = events.filter(e => getEventStatus(e) === 'past')
    const inactive = events.filter(e => !e.is_active)

    // 카테고리 분포
    const byCat: Record<string, number> = {}
    events.forEach(e => {
      byCat[e.category] = (byCat[e.category] || 0) + 1
    })

    return { total: events.length, active: active.length, upcoming: upcoming.length, ongoing: ongoing.length, past: past.length, inactive: inactive.length, byCat }
  }, [events])

  // 필터링
  const filtered = useMemo(() => {
    let result = events
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter(e => getEventStatus(e) === statusFilter)
    }
    if (categoryFilter !== 'all') {
      result = result.filter(e => e.category === categoryFilter)
    }
    return result
  }, [events, searchQuery, statusFilter, categoryFilter])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  const openEdit = (ev: ChuncheonEvent) => {
    setEditingId(ev.id)
    setForm({
      title: ev.title,
      description: ev.description || '',
      location: ev.location || '',
      event_date: ev.event_date,
      end_date: ev.end_date || '',
      category: ev.category,
      color: ev.color,
      is_active: ev.is_active,
      link_url: ev.link_url || '',
    })
    setError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.event_date) {
      setError('제목과 시작 날짜는 필수입니다')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        event_date: form.event_date,
        end_date: form.end_date || null,
        category: form.category,
        color: form.color,
        is_active: form.is_active,
        link_url: form.link_url.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('chuncheon_events')
          .update(payload)
          .eq('id', editingId)
        if (err) throw err
      } else {
        const plaza = getCurrentPlazaClient()
        const { error: err } = await supabase
          .from('chuncheon_events')
          .insert([plaza ? { ...payload, plaza_id: plaza } : payload])
        if (err) throw err
      }

      setShowForm(false)
      await fetchEvents()
    } catch (err: any) {
      setError(err.message || '저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const { error: err } = await supabase
      .from('chuncheon_events')
      .delete()
      .eq('id', id)
    if (!err) {
      setDeleteConfirm(null)
      await fetchEvents()
    }
  }

  const toggleActive = async (ev: ChuncheonEvent) => {
    await supabase
      .from('chuncheon_events')
      .update({ is_active: !ev.is_active })
      .eq('id', ev.id)
    await fetchEvents()
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
  }

  const getDaysUntil = (d: string) => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const target = new Date(d)
    target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="관광 달력"
        description="홈페이지 달력 탭에 표시되는 지역 행사·축제·이벤트를 관리합니다"
        icon={<CalendarDays className="w-6 h-6" />}
        badge={
          stats.ongoing > 0 ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              {stats.ongoing}건 진행중
            </span>
          ) : null
        }
        actions={
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            새 일정 추가
          </Button>
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-0.5">전체 일정</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.ongoing}</div>
          <div className="text-xs text-muted-foreground mt-0.5">진행중</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <CalendarCheck className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600">{stats.upcoming}</div>
          <div className="text-xs text-muted-foreground mt-0.5">예정</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <CalendarX className="w-4 h-4 text-gray-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-400">{stats.past}</div>
          <div className="text-xs text-muted-foreground mt-0.5">종료</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <EyeOff className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.inactive}</div>
          <div className="text-xs text-muted-foreground mt-0.5">비활성</div>
        </div>
      </div>

      {/* 카테고리 분포 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {CATEGORIES.map((cat) => {
          const CatIcon = cat.icon
          const count = stats.byCat[cat.value] || 0
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(categoryFilter === cat.value ? 'all' : cat.value)}
              className={cn(
                "p-2.5 rounded-lg border text-center transition-all",
                categoryFilter === cat.value
                  ? `${cat.bgColor} border-current ${cat.color} shadow-sm`
                  : "bg-card hover:bg-muted border-border"
              )}
            >
              <CatIcon className={cn("w-4 h-4 mx-auto mb-1", categoryFilter === cat.value ? cat.color : "text-muted-foreground")} />
              <div className="text-[11px] font-medium">{cat.label}</div>
              <div className={cn("text-lg font-bold", categoryFilter === cat.value ? cat.color : "")}>{count}</div>
            </button>
          )
        })}
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="행사명, 장소, 설명 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusType)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">모든 상태</option>
            <option value="ongoing">진행중</option>
            <option value="upcoming">예정</option>
            <option value="past">종료</option>
          </select>
        </div>
      </div>

      {/* 이벤트 목록 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">일정을 불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <CalendarDays className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">
              {events.length === 0 ? '등록된 일정이 없습니다' : '검색 결과가 없습니다'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {events.length === 0
                ? '새 일정을 추가하여 관광 달력을 채워보세요'
                : '검색어나 필터를 변경해보세요'}
            </p>
          </div>
          {events.length === 0 && (
            <Button onClick={openCreate} size="sm" className="gap-1.5 mt-2">
              <Plus className="w-3.5 h-3.5" />
              첫 일정 추가
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length}건</p>
          <div className="space-y-2">
            {filtered.map((ev) => {
              const cat = CATEGORIES.find(c => c.value === ev.category)
              const CatIcon = cat?.icon || Tag
              const status = getEventStatus(ev)
              const sConf = STATUS_CONFIG[status]
              const isExpanded = expandedId === ev.id
              const daysUntil = status === 'upcoming' ? getDaysUntil(ev.event_date) : 0

              return (
                <div
                  key={ev.id}
                  className={cn(
                    "rounded-xl border bg-card transition-all hover:shadow-sm",
                    !ev.is_active && "opacity-50",
                    status === 'ongoing' && ev.is_active && "border-emerald-200/60 dark:border-emerald-900/30",
                  )}
                >
                  {/* 메인 행 */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    {/* 색상 + 카테고리 아이콘 */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: ev.color + '18' }}
                    >
                      <CatIcon className="w-5 h-5" style={{ color: ev.color }} />
                    </div>

                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-sm truncate">{ev.title}</span>
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                          sConf.bgColor, sConf.color,
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", sConf.dotColor)} />
                          {sConf.label}
                        </span>
                        {cat && (
                          <span className={cn(
                            "text-[11px] font-medium px-2 py-0.5 rounded-full",
                            cat.bgColor, cat.color,
                          )}>
                            {cat.label}
                          </span>
                        )}
                        {!ev.is_active && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                            비활성
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {formatDate(ev.event_date)}
                          {ev.end_date && ev.end_date !== ev.event_date && (
                            <> ~ {formatDate(ev.end_date)}</>
                          )}
                        </span>
                        {ev.location && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{ev.location}</span>
                            </span>
                          </>
                        )}
                        {status === 'upcoming' && daysUntil <= 7 && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                            <span className="text-blue-600 font-medium">
                              {daysUntil === 0 ? '내일 시작' : `${daysUntil}일 후`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 색상 도트 + 토글 */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-3 h-3 rounded-full border border-white shadow-sm hidden sm:block" style={{ backgroundColor: ev.color }} />
                      <div className="shrink-0 text-muted-foreground">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {/* 확장 영역 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t mx-4 mb-2 mt-0 border-dashed">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">카테고리</div>
                          <div className="flex items-center gap-1.5">
                            <CatIcon className="w-3.5 h-3.5" style={{ color: ev.color }} />
                            <span className="text-sm font-medium">{cat?.label || ev.category}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">기간</div>
                          <div className="text-sm font-medium">
                            {formatDate(ev.event_date)}
                            {ev.end_date && ev.end_date !== ev.event_date && (
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                ~ {formatDate(ev.end_date)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">장소</div>
                          <div className="text-sm font-medium">{ev.location || '미지정'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-0.5">등록일</div>
                          <div className="text-sm font-medium">{formatDate(ev.created_at)}</div>
                        </div>
                      </div>

                      {ev.description && (
                        <div className="mt-3 pt-3 border-t border-dashed">
                          <div className="text-[11px] text-muted-foreground mb-1">설명</div>
                          <p className="text-sm text-muted-foreground">{ev.description}</p>
                        </div>
                      )}

                      {/* 액션 */}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={(e) => { e.stopPropagation(); openEdit(ev) }}>
                          <Pencil className="w-3.5 h-3.5" />
                          수정
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={(e) => { e.stopPropagation(); toggleActive(ev) }}
                        >
                          {ev.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {ev.is_active ? '비활성화' : '활성화'}
                        </Button>
                        {ev.link_url && (
                          <a
                            href={ev.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 h-8 px-3 text-sm border rounded-md hover:bg-muted transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            링크
                          </a>
                        )}
                        <div className="flex-1" />
                        {deleteConfirm === ev.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-destructive mr-1">삭제할까요?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2"
                              onClick={(e) => { e.stopPropagation(); handleDelete(ev.id) }}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ev.id) }}
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

      {/* 이벤트 추가/수정 모달 */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '일정 수정' : '새 일정 추가'}</DialogTitle>
            <DialogDescription>
              {editingId ? '일정 정보를 수정합니다' : '관광 달력에 표시될 새 일정을 추가합니다'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {error && (
              <div className="px-4 py-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
            )}

            {/* 기본 정보 섹션 */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">기본 정보</h3>
              <div className="space-y-1.5">
                <Label>제목 <span className="text-destructive">*</span></Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="행사·축제 이름"
                  maxLength={100}
                />
                <div className="text-[11px] text-muted-foreground text-right">{form.title.length}/100</div>
              </div>
              <div className="space-y-1.5">
                <Label>설명</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="행사 설명 (선택)"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            {/* 일시·장소 섹션 */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">일시·장소</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>시작일 <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={form.event_date}
                    onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>종료일</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    min={form.event_date}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>장소</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="행사 장소 (선택)"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>관련 링크</Label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={form.link_url}
                    onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                    placeholder="https://..."
                    type="url"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {/* 카테고리·표시 섹션 */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">카테고리·표시</h3>
              <div className="space-y-1.5">
                <Label>카테고리</Label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const CatIcon = cat.icon
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setForm({ ...form, category: cat.value })}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all',
                          form.category === cat.value
                            ? `${cat.bgColor} ${cat.color} border-current font-semibold`
                            : 'border-border hover:border-primary/50 text-muted-foreground'
                        )}
                      >
                        <CatIcon className="w-3 h-3" />
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>달력 색상</Label>
                <div className="flex gap-2.5">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm({ ...form, color: c.value })}
                      className={cn(
                        'w-8 h-8 rounded-full transition-all',
                        form.color === c.value
                          ? 'ring-2 ring-offset-2 ring-offset-background scale-110'
                          : 'hover:scale-105'
                      )}
                      style={{
                        backgroundColor: c.value,
                        ...(form.color === c.value ? { ringColor: c.value } : {}),
                      }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 옵션 */}
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">달력에 표시</p>
                  <p className="text-xs text-muted-foreground mt-0.5">비활성화 시 달력에 표시되지 않습니다</p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowForm(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />저장 중...</> : (editingId ? '수정 완료' : '일정 추가')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
