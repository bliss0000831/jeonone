'use client'

/**
 * 서비스 게시글 관리 — 동적 라우트.
 * type param 으로 분기하는 1개 페이지로 통합.
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
  Sparkles,
  Paintbrush,
  Truck,
  Wrench,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Clock,
  TrendingUp,
  Building2,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from "sonner"

type ServiceType = 'cleaning' | 'interior' | 'moving' | 'repair'

const META: Record<ServiceType, {
  table: string
  title: string
  description: string
  Icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}> = {
  interior: { table: 'interior_posts', title: '인테리어', description: '인테리어 서비스 게시글 관리', Icon: Paintbrush, color: 'text-violet-600', bgColor: 'bg-violet-50' },
  moving:   { table: 'moving_posts',   title: '이사',     description: '이사 서비스 게시글 관리',     Icon: Truck,      color: 'text-amber-600',  bgColor: 'bg-amber-50' },
  cleaning: { table: 'cleaning_posts', title: '청소',     description: '청소 서비스 게시글 관리',     Icon: Sparkles,   color: 'text-cyan-600',   bgColor: 'bg-cyan-50' },
  repair:   { table: 'repair_posts',   title: '수리',     description: '수리 서비스 게시글 관리',     Icon: Wrench,     color: 'text-rose-600',   bgColor: 'bg-rose-50' },
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '공개', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  hidden: { label: '숨김', color: 'bg-gray-500/15 text-gray-500 border-gray-500/30' },
  pending: { label: '대기', color: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
}

type Row = {
  id: string
  user_id: string | null
  title: string
  price: number | null
  status: string | null
  views: number | null
  images: string[] | null
  created_at: string
  plaza_id?: string | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function formatPrice(price: number | null) {
  if (!price) return '가격 문의'
  if (price >= 10000) return `${(price / 10000).toFixed(price % 10000 === 0 ? 0 : 1)}만`
  return `${price.toLocaleString()}원`
}

export default function ServiceAdminPage() {
  const params = useParams<{ type: string }>()
  const type = params?.type as ServiceType | undefined
  if (!type || !(type in META)) {
    notFound()
  }
  const meta = META[type as ServiceType]
  const supabase = createClient()

  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    setStatusFilter('all')
  }, [meta.table])

  const {
    rows,
    loading,
    page,
    setPage,
    pageSize,
    totalCount,
    totalPages,
    search,
    setSearch,
    reload,
  } = useAdminTable<Row>({
    table: meta.table,
    searchColumns: ['title'],
    pageSize: 50,
    orderBy: { column: 'created_at', ascending: false },
    applyFilter: (q) => {
      let qq = q
      if (statusFilter !== 'all') qq = qq.eq('status', statusFilter)
      return qq
    },
    filterDeps: [statusFilter],
  })

  // 통계
  const stats = useMemo(() => {
    const active = rows.filter(r => r.status === 'active').length
    const hidden = rows.filter(r => r.status === 'hidden').length
    const totalViews = rows.reduce((a, r) => a + (r.views || 0), 0)
    return { total: totalCount, active, hidden, totalViews }
  }, [rows, totalCount])

  const toggle = async (r: Row) => {
    const next = r.status === 'hidden' ? 'active' : 'hidden'
    const plaza = getCurrentPlazaClient()
    let q = (supabase as any).from(meta.table).update({ status: next }).eq('id', r.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error(error.message)
    reload()
  }

  const remove = async (r: Row) => {
    if (!confirm(`"${r.title}" 게시글을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    const plaza = getCurrentPlazaClient()
    let q = (supabase as any).from(meta.table).delete().eq('id', r.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error(error.message)
    reload()
  }

  const columns: AdminColumn<Row>[] = [
    {
      key: 'thumbnail',
      label: '',
      className: 'w-[52px] pr-0',
      render: (r) => {
        const img = r.images?.[0]
        return (
          <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-muted/50 flex-shrink-0">
            {img ? (
              <Image src={img} alt="" fill className="object-cover" unoptimized />
            ) : (
              <div className={cn("w-full h-full flex items-center justify-center", meta.color, "opacity-30")}>
                <meta.Icon className="w-4 h-4" />
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'title',
      label: '서비스 정보',
      render: (r) => (
        <div className="min-w-0">
          <span className="font-medium text-[13px] truncate block">{r.title}</span>
          <span className="text-[11px] text-muted-foreground">{r.user_id?.slice(0, 8)}</span>
        </div>
      ),
    },
    {
      key: 'price',
      label: '가격',
      render: (r) => (
        <span className={cn("font-semibold text-[13px] tabular-nums", !r.price && "text-muted-foreground text-[12px]")}>
          {formatPrice(r.price)}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      render: (r) => {
        const s = STATUS_MAP[r.status || ''] || { label: r.status || '-', color: 'bg-gray-100 text-gray-500' }
        return <Badge variant="outline" className={s.color}>{s.label}</Badge>
      },
    },
    {
      key: 'views',
      label: '조회',
      hideOn: 'md',
      render: (r) => (
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {(r.views || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: '등록',
      hideOn: 'md',
      render: (r) => (
        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          {timeAgo(r.created_at)}
        </div>
      ),
    },
  ]

  const Icon = meta.Icon
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="홈즈 서비스 관리"
        description="인테리어 · 이사 · 청소 · 수리 게시글 관리"
        icon={Icon}
      />

      {/* 타입 탭 */}
      <div className="flex gap-1 bg-muted/30 p-1 rounded-xl border border-border/50">
        {(Object.keys(META) as ServiceType[]).map((t) => {
          const TI = META[t].Icon
          const active = t === type
          return (
            <Link
              key={t}
              href={`/admin/service/${t}`}
              className={cn(
                "flex-1 px-4 py-2.5 text-[13px] font-medium rounded-lg transition-all flex items-center justify-center gap-2",
                active
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              <TI className={cn("w-4 h-4", active ? META[t].color : "opacity-50")} />
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
          { label: '숨김', value: stats.hidden, icon: EyeOff, color: 'text-gray-400', bg: 'bg-gray-50' },
          { label: '총 조회수', value: stats.totalViews.toLocaleString(), icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50' },
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

      {/* 필터 + 페이지네이션 */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border/50 bg-muted/20">
        <select
          className="h-8 rounded-lg border border-border/50 bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary/30"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(0)
          }}
        >
          <option value="all">전체 상태</option>
          <option value="active">공개</option>
          <option value="hidden">숨김</option>
        </select>
        <div className="flex-1 min-w-[180px]">
          <Input
            placeholder="서비스 제목 검색..."
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
        columns={columns}
        rows={rows}
        loading={loading}
        actions={(r) => (
          <div className="flex justify-end gap-0.5">
            <button
              onClick={() => toggle(r)}
              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              title={r.status === 'hidden' ? '공개' : '숨기기'}
            >
              {r.status === 'hidden' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
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
