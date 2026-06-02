'use client'

/**
 * 커뮤니티 게시글 관리 — 동적 라우트.
 * sharing/clubs/group-buying/local-food/new-store 5개 타입 통합.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminDataTable, AdminColumn } from '@/components/admin/data-table'
import { AdminPagination } from '@/components/admin/pagination'
import { useAdminTable } from '@/hooks/use-admin-table'
import {
  Gift, Users, ShoppingCart, Leaf, Store as StoreIcon,
  Eye, EyeOff, Trash2, Clock, BarChart3, Building2,
  MapPin, Calendar, UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from "sonner"

type CommunityType = 'sharing' | 'clubs' | 'group-buying' | 'local-food' | 'new-store'

interface TypeMeta {
  table: string
  title: string
  Icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  searchColumns: string[]
  searchPlaceholder: string
  hasCategoryFilter?: boolean
  extraLoader?: (supabase: ReturnType<typeof createClient>, rows: any[]) => Promise<Record<string, any>>
  columns: (ctx: any) => AdminColumn<any>[]
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '공개', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  approved: { label: '승인', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  hidden: { label: '숨김', color: 'bg-gray-500/15 text-gray-500 border-gray-500/30' },
  closed: { label: '마감', color: 'bg-gray-500/15 text-gray-500 border-gray-500/30' },
  pending: { label: '대기', color: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  open: { label: '모집중', color: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  rejected: { label: '반려', color: 'bg-red-500/15 text-red-600 border-red-500/30' },
}

const StatusBadge = ({ s }: { s: string }) => {
  const m = STATUS_MAP[s] || { label: s, color: 'bg-gray-100 text-gray-500' }
  return <Badge variant="outline" className={m.color}>{m.label}</Badge>
}

function timeAgo(dateStr?: string | null) {
  if (!dateStr) return '-'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

const thumbnailCol = (FallbackIcon: React.ComponentType<{ className?: string }>, color: string): AdminColumn<any> => ({
  key: 'thumbnail',
  label: '',
  className: 'w-[52px] pr-0',
  render: (r: any) => {
    const img = r.images?.[0]
    return (
      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-muted/50 flex-shrink-0">
        {img ? (
          <Image src={img} alt="" fill className="object-cover" unoptimized />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center opacity-30", color)}>
            <FallbackIcon className="w-4 h-4" />
          </div>
        )}
      </div>
    )
  },
})

const META: Record<CommunityType, TypeMeta> = {
  sharing: {
    table: 'sharing_posts',
    title: '나눔',
    Icon: Gift,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    searchColumns: ['title', 'location'],
    searchPlaceholder: '제목·위치 검색',
    columns: () => [
      thumbnailCol(Gift, 'text-pink-600'),
      {
        key: 'title', label: '게시글',
        render: (r: any) => (
          <div className="min-w-0">
            <span className="font-medium text-[13px] truncate block">{r.title}</span>
            {r.location && (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{r.location}</span>
              </div>
            )}
          </div>
        ),
      },
      { key: 'status', label: '상태', render: (r: any) => <StatusBadge s={r.status} /> },
      {
        key: 'created_at', label: '등록', hideOn: 'md' as const,
        render: (r: any) => (
          <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Clock className="w-3 h-3" />{timeAgo(r.created_at)}
          </div>
        ),
      },
    ],
  },
  clubs: {
    table: 'clubs',
    title: '모임',
    Icon: Users,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    searchColumns: ['title', 'category', 'sport_type', 'location'],
    searchPlaceholder: '모임명·카테고리·종목 검색',
    columns: () => [
      thumbnailCol(Users, 'text-indigo-600'),
      {
        key: 'title', label: '모임',
        render: (r: any) => (
          <div className="min-w-0">
            <span className="font-medium text-[13px] truncate block">{r.title}</span>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              {r.category && <span className="px-1.5 py-0 rounded bg-muted text-[10px]">{r.category}</span>}
              {r.sport_type && <span>{r.sport_type}</span>}
            </div>
          </div>
        ),
      },
      {
        key: 'location', label: '지역', hideOn: 'md' as const,
        render: (r: any) => (
          <span className="text-[12px] text-muted-foreground">
            {[r.district, r.location].filter(Boolean).join(' · ') || '-'}
          </span>
        ),
      },
      {
        key: 'members', label: '인원',
        render: (r: any) => (
          <div className="flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-[13px] font-semibold tabular-nums">{r.current_members ?? 0}</span>
            <span className="text-[11px] text-muted-foreground">/ {r.max_members ?? '∞'}</span>
          </div>
        ),
      },
      {
        key: 'meeting_date', label: '모임일', hideOn: 'md' as const,
        render: (r: any) => r.meeting_date ? (
          <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {new Date(r.meeting_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
          </div>
        ) : <span className="text-[11px] text-muted-foreground">-</span>,
      },
      { key: 'status', label: '상태', render: (r: any) => <StatusBadge s={r.status} /> },
    ],
  },
  'group-buying': {
    table: 'group_buying_posts',
    title: '공동구매',
    Icon: ShoppingCart,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    searchColumns: ['title', 'product_name'],
    searchPlaceholder: '제목·상품명 검색',
    columns: (ctx) => [
      thumbnailCol(ShoppingCart, 'text-teal-600'),
      {
        key: 'title', label: '상품',
        render: (r: any) => (
          <div className="min-w-0">
            <span className="font-medium text-[13px] truncate block">{r.title}</span>
            {r.product_name && (
              <span className="text-[11px] text-muted-foreground">{r.product_name}</span>
            )}
          </div>
        ),
      },
      {
        key: 'group_price', label: '공구가',
        render: (r: any) => (
          <span className="font-semibold text-[13px] tabular-nums">
            {(r.group_price || 0).toLocaleString()}원
          </span>
        ),
      },
      {
        key: 'participants', label: '참여',
        render: (r: any) => (
          <div className="flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-[13px] font-semibold tabular-nums">{ctx?.counts?.[r.id] ?? 0}</span>
            <span className="text-[11px] text-muted-foreground">/ {r.max_participants ?? '∞'}</span>
          </div>
        ),
      },
      {
        key: 'deadline', label: '마감', hideOn: 'md' as const,
        render: (r: any) => r.deadline ? (
          <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            {new Date(r.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
          </div>
        ) : <span className="text-[11px] text-muted-foreground">-</span>,
      },
      { key: 'status', label: '상태', render: (r: any) => <StatusBadge s={r.status} /> },
    ],
    extraLoader: async (supabase, rows) => {
      const postIds = rows.map((r: any) => r.id).filter(Boolean)
      const counts: Record<string, number> = {}
      if (postIds.length > 0) {
        const { data: parts } = await supabase
          .from('group_buying_participants')
          .select('post_id')
          .in('post_id', postIds)
        parts?.forEach((p: any) => {
          counts[p.post_id] = (counts[p.post_id] || 0) + 1
        })
      }
      return { counts }
    },
  },
  'local-food': {
    table: 'local_food',
    title: '로컬푸드',
    Icon: Leaf,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    searchColumns: ['title', 'category'],
    searchPlaceholder: '제목·카테고리 검색',
    hasCategoryFilter: true,
    columns: () => [
      thumbnailCol(Leaf, 'text-green-600'),
      {
        key: 'title', label: '상품',
        render: (r: any) => (
          <div className="min-w-0">
            <span className="font-medium text-[13px] truncate block">{r.title}</span>
            {r.category && (
              <span className="px-1.5 py-0 rounded bg-green-50 text-green-700 text-[10px]">{r.category}</span>
            )}
          </div>
        ),
      },
      {
        key: 'price', label: '가격',
        render: (r: any) => (
          <span className="font-semibold text-[13px] tabular-nums">
            {(r.price || 0).toLocaleString()}원{r.unit ? ` / ${r.unit}` : ''}
          </span>
        ),
      },
      {
        key: 'view_count', label: '조회', hideOn: 'md' as const,
        render: (r: any) => <span className="text-[12px] tabular-nums text-muted-foreground">{r.view_count || 0}</span>,
      },
      { key: 'status', label: '상태', render: (r: any) => <StatusBadge s={r.status} /> },
      {
        key: 'created_at', label: '등록', hideOn: 'md' as const,
        render: (r: any) => (
          <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Clock className="w-3 h-3" />{timeAgo(r.created_at)}
          </div>
        ),
      },
    ],
  },
  'new-store': {
    table: 'new_store_posts',
    title: '신장개업',
    Icon: StoreIcon,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    searchColumns: ['store_name', 'category', 'location'],
    searchPlaceholder: '상호·카테고리·위치 검색',
    columns: () => [
      thumbnailCol(StoreIcon, 'text-orange-600'),
      {
        key: 'store_name', label: '매장',
        render: (r: any) => (
          <div className="min-w-0">
            <span className="font-medium text-[13px] truncate block">{r.store_name}</span>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              {r.category && <span className="px-1.5 py-0 rounded bg-orange-50 text-orange-700 text-[10px]">{r.category}</span>}
              {r.location && (
                <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{r.location}</span>
              )}
            </div>
          </div>
        ),
      },
      { key: 'status', label: '상태', render: (r: any) => <StatusBadge s={r.status} /> },
      {
        key: 'created_at', label: '등록', hideOn: 'md' as const,
        render: (r: any) => (
          <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Clock className="w-3 h-3" />{timeAgo(r.created_at)}
          </div>
        ),
      },
    ],
  },
}

const TYPE_ORDER: CommunityType[] = ['sharing', 'clubs', 'group-buying', 'local-food', 'new-store']

export default function CommunityAdminPage() {
  const params = useParams<{ type: string }>()
  const type = params?.type as CommunityType | undefined
  if (!type || !(type in META)) notFound()
  const meta = META[type as CommunityType]
  const supabase = createClient()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [extraCtx, setExtraCtx] = useState<Record<string, any>>({})
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])

  useEffect(() => {
    setStatusFilter('all')
    setCatFilter('all')
    setExtraCtx({})
    setCategoryOptions([])
  }, [meta.table])

  const {
    rows, loading, page, setPage, pageSize, totalCount, totalPages, search, setSearch, reload,
  } = useAdminTable<any>({
    table: meta.table,
    searchColumns: meta.searchColumns,
    pageSize: 50,
    orderBy: { column: 'created_at', ascending: false },
    applyFilter: (q) => {
      let qq = q
      if (statusFilter !== 'all') qq = qq.eq('status', statusFilter)
      if (meta.hasCategoryFilter && catFilter !== 'all') qq = qq.eq('category', catFilter)
      return qq
    },
    filterDeps: [statusFilter, catFilter, meta.hasCategoryFilter],
  })

  // 통계
  const stats = useMemo(() => {
    const active = rows.filter((r: any) => r.status === 'active' || r.status === 'open' || r.status === 'approved').length
    const hidden = rows.filter((r: any) => r.status === 'hidden' || r.status === 'closed').length
    const pending = rows.filter((r: any) => r.status === 'pending').length
    return { total: totalCount, active, hidden, pending }
  }, [rows, totalCount])

  useEffect(() => {
    if (!meta.extraLoader || rows.length === 0) { setExtraCtx({}); return }
    let cancelled = false
    meta.extraLoader(supabase, rows).then((ctx) => { if (!cancelled) setExtraCtx(ctx) })
    return () => { cancelled = true }
  }, [rows, meta.table])

  useEffect(() => {
    if (!meta.hasCategoryFilter) return
    let cancelled = false
    ;(async () => {
      const { data } = await (supabase as any).from(meta.table).select('category').limit(1000)
      if (cancelled) return
      const set = new Set<string>()
      ;(data as any[])?.forEach((r) => { if (r.category) set.add(r.category) })
      setCategoryOptions(Array.from(set).sort())
    })()
    return () => { cancelled = true }
  }, [meta.table])

  const toggleStatus = async (row: any) => {
    const next = row.status === 'active' || row.status === 'open' ? 'hidden' : 'active'
    const plaza = getCurrentPlazaClient()
    let q = (supabase as any).from(meta.table).update({ status: next }).eq('id', row.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error('변경 실패: ' + error.message)
    reload()
  }

  const remove = async (row: any) => {
    if (!confirm('정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return
    const plaza = getCurrentPlazaClient()
    let q = (supabase as any).from(meta.table).delete().eq('id', row.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error('삭제 실패: ' + error.message)
    reload()
  }

  const Icon = meta.Icon

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="커뮤니티 관리"
        description="나눔 · 모임 · 공동구매 · 로컬푸드 · 신장개업 게시글 관리"
        icon={Icon}
      />

      {/* 탭 — 세그먼트 컨트롤 */}
      <div className="flex gap-1 bg-muted/30 p-1 rounded-xl border border-border/50 overflow-x-auto">
        {TYPE_ORDER.map((t) => {
          const TI = META[t].Icon
          const active = t === type
          return (
            <Link
              key={t}
              href={`/admin/community/${t}`}
              className={cn(
                "flex-1 min-w-0 px-3 py-2.5 text-[13px] font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap",
                active
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              <TI className={cn("w-4 h-4 flex-shrink-0", active ? META[t].color : "opacity-50")} />
              {META[t].title}
            </Link>
          )
        })}
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '전체', value: stats.total, icon: Building2, color: 'text-foreground', bg: 'bg-muted/50' },
          { label: '공개 중', value: stats.active, icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '대기', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: '숨김/마감', value: stats.hidden, icon: EyeOff, color: 'text-gray-400', bg: 'bg-gray-50' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/50 bg-card p-3.5 flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", s.bg, s.color)}>
              <s.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
              <p className={cn("text-lg font-bold tabular-nums", s.color)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border/50 bg-muted/20">
        <select
          className="h-8 rounded-lg border border-border/50 bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary/30"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
        >
          <option value="all">전체 상태</option>
          <option value="active">공개</option>
          <option value="hidden">숨김</option>
          <option value="pending">대기</option>
        </select>
        {meta.hasCategoryFilter && (
          <select
            className="h-8 rounded-lg border border-border/50 bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary/30"
            value={catFilter}
            onChange={(e) => { setCatFilter(e.target.value); setPage(0) }}
          >
            <option value="all">전체 카테고리</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="flex-1 min-w-[180px]">
          <Input
            placeholder={meta.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-[13px] bg-background border-border/50"
          />
        </div>
        <span className="text-[12px] text-muted-foreground ml-auto tabular-nums">
          {totalCount}건
        </span>
      </div>

      {/* 테이블 */}
      <AdminDataTable
        loading={loading}
        data={rows}
        columns={meta.columns(extraCtx)}
        actions={(r: any) => (
          <div className="flex justify-end gap-0.5">
            <button
              onClick={() => toggleStatus(r)}
              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              title={r.status === 'active' || r.status === 'open' ? '숨기기' : '공개'}
            >
              {r.status === 'active' || r.status === 'open'
                ? <EyeOff className="w-3.5 h-3.5" />
                : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => remove(r)}
              className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors dark:hover:bg-red-950/30"
              title="삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      />

      {totalPages > 1 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          setPage={setPage}
        />
      )}
    </div>
  )
}
