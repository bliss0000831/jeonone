'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminDataTable, AdminColumn } from '@/components/admin/data-table'
import { toast } from "sonner"
import {
  Home,
  Trash2,
  Eye,
  EyeOff,
  TrendingUp,
  Building2,
  MapPin,
  Clock,
  BarChart3,
  ExternalLink,
} from 'lucide-react'

type Row = {
  id: string
  title: string
  property_type: string | null
  transaction_type: string | null
  price: number | null
  monthly_rent: number | null
  status: string | null
  views: number | null
  images: string[] | null
  address: string | null
  created_at: string
  user_id: string | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '공개', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  sold: { label: '거래완료', color: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  hidden: { label: '숨김', color: 'bg-gray-500/15 text-gray-500 border-gray-500/30' },
  pending: { label: '대기', color: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
}

const PROPERTY_TYPE_MAP: Record<string, string> = {
  아파트: '🏢',
  빌라: '🏘️',
  오피스텔: '🏙️',
  원룸: '🚪',
  투룸: '🚪',
  사무실: '🏛️',
  상가: '🏪',
  토지: '🌳',
  펜션: '🏡',
  단독주택: '🏠',
}

function formatPrice(r: Row) {
  const p = r.price || 0
  const rent = r.monthly_rent || 0

  if (r.transaction_type === '월세') {
    const depStr = p >= 10000 ? `${(p / 10000).toFixed(p % 10000 === 0 ? 0 : 1)}억` : `${p.toLocaleString()}`
    return `${depStr} / ${rent.toLocaleString()}만`
  }
  if (p >= 10000) return `${(p / 10000).toFixed(p % 10000 === 0 ? 0 : 1)}억`
  if (p > 0) return `${p.toLocaleString()}만`
  return '-'
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

export default function AdminPropertiesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [tx, setTx] = useState('all')
  const [propertyType, setPropertyType] = useState('all')
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 250)

  const load = async () => {
    setLoading(true)
    const plaza = getCurrentPlazaClient()
    let query = supabase
      .from('properties')
      .select('id, title, property_type, transaction_type, price, monthly_rent, status, views, images, address, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(200)
    if (plaza) query = query.eq('plaza_id', plaza)
    if (status !== 'all') query = query.eq('status', status)
    if (tx !== 'all') query = query.eq('transaction_type', tx)
    if (propertyType !== 'all') query = query.eq('property_type', propertyType)
    if (debouncedQ.trim()) query = query.ilike('title', `%${debouncedQ.trim()}%`)
    const { data, error } = await query
    if (error) toast.error(error.message)
    setRows((data as unknown as Row[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tx, propertyType, debouncedQ])

  // 통계
  const stats = useMemo(() => {
    const active = rows.filter(r => r.status === 'active').length
    const sold = rows.filter(r => r.status === 'sold').length
    const hidden = rows.filter(r => r.status === 'hidden').length
    const totalViews = rows.reduce((a, r) => a + (r.views || 0), 0)
    return { total: rows.length, active, sold, hidden, totalViews }
  }, [rows])

  const toggleHidden = async (r: Row) => {
    const next = r.status === 'hidden' ? 'active' : 'hidden'
    const plaza = getCurrentPlazaClient()
    let q = supabase.from('properties').update({ status: next }).eq('id', r.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error(error.message)
    load()
  }

  const remove = async (r: Row) => {
    if (!confirm(`"${r.title}" 매물을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    const plaza = getCurrentPlazaClient()
    let q = supabase.from('properties').delete().eq('id', r.id)
    if (plaza) q = q.eq('plaza_id', plaza)
    const { error } = await q
    if (error) return toast.error(error.message)
    load()
  }

  const goToProperty = (r: Row) => {
    window.open(`/property/${r.id}`, '_blank')
  }

  // 유형별 고유값 추출 (필터용)
  const propertyTypes = useMemo(() => {
    const types = new Set(rows.map(r => r.property_type).filter(Boolean))
    return Array.from(types) as string[]
  }, [rows])

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
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                <Building2 className="w-4 h-4" />
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'title',
      label: '매물 정보',
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[13px] truncate">{r.title}</span>
          </div>
          {r.address && (
            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{r.address}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'transaction_type',
      label: '거래',
      hideOn: 'md',
      render: (r) => {
        const colors: Record<string, string> = {
          매매: 'text-rose-600 bg-rose-50',
          전세: 'text-violet-600 bg-violet-50',
          월세: 'text-sky-600 bg-sky-50',
        }
        return (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors[r.transaction_type || ''] || 'text-gray-600 bg-gray-50'}`}>
            {r.transaction_type || '-'}
          </span>
        )
      },
    },
    {
      key: 'price',
      label: '가격',
      render: (r) => (
        <span className="font-semibold text-[13px] tabular-nums">
          {formatPrice(r)}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      render: (r) => {
        const s = STATUS_MAP[r.status || ''] || { label: r.status || '-', color: 'bg-gray-100 text-gray-500' }
        return <Badge className={s.color} variant="outline">{s.label}</Badge>
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="전체 매물 관리"
        description="등록된 모든 매물을 관리합니다 · 더블클릭하면 매물 페이지로 이동"
        icon={Home}
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '전체', value: stats.total, icon: Building2, color: 'text-foreground' },
          { label: '공개 중', value: stats.active, icon: Eye, color: 'text-emerald-600' },
          { label: '거래완료', value: stats.sold, icon: TrendingUp, color: 'text-blue-600' },
          { label: '숨김', value: stats.hidden, icon: EyeOff, color: 'text-gray-400' },
          { label: '총 조회수', value: stats.totalViews.toLocaleString(), icon: BarChart3, color: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/50 bg-card p-3.5 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted/50 ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
              <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border/50 bg-muted/20">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-lg border border-border/50 bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option value="all">전체 상태</option>
          <option value="active">공개</option>
          <option value="sold">거래완료</option>
          <option value="hidden">숨김</option>
          <option value="pending">대기</option>
        </select>
        <select
          value={tx}
          onChange={(e) => setTx(e.target.value)}
          className="h-8 rounded-lg border border-border/50 bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option value="all">전체 거래</option>
          <option value="매매">매매</option>
          <option value="전세">전세</option>
          <option value="월세">월세</option>
        </select>
        <select
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
          className="h-8 rounded-lg border border-border/50 bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option value="all">전체 유형</option>
          {propertyTypes.map(t => (
            <option key={t} value={t}>{PROPERTY_TYPE_MAP[t] || ''} {t}</option>
          ))}
        </select>
        <div className="flex-1 min-w-[180px]">
          <Input
            placeholder="매물 제목 검색..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 text-[13px] bg-background border-border/50"
          />
        </div>
        <span className="text-[12px] text-muted-foreground ml-auto">
          {rows.length}건
        </span>
      </div>

      {/* 테이블 */}
      <AdminDataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowDoubleClick={goToProperty}
        actions={(r) => (
          <div className="flex justify-end gap-0.5">
            <button
              onClick={() => goToProperty(r)}
              className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title="매물 페이지 열기"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => toggleHidden(r)}
              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              title={r.status === 'hidden' ? '공개로 전환' : '숨기기'}
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
    </div>
  )
}
