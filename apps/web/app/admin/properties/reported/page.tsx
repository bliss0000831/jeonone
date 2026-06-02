'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminDataTable, AdminColumn } from '@/components/admin/data-table'
import { AdminPagination } from '@/components/admin/pagination'
import { useAdminTable } from '@/hooks/use-admin-table'
import { Flag, Check, X, Eye } from 'lucide-react'
import { toast } from "sonner"

type Report = {
  id: string
  property_id: string
  reporter_id: string | null
  reason: string | null
  detail: string | null
  status: string | null
  admin_note: string | null
  created_at: string
  property_title?: string
}

const statusColor = (s: string | null) => {
  if (s === 'resolved') return 'bg-green-500/15 text-green-600 border-green-500/30'
  if (s === 'reviewed') return 'bg-blue-500/15 text-blue-600 border-blue-500/30'
  if (s === 'rejected') return 'bg-gray-500/15 text-gray-600 border-gray-500/30'
  return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'
}

export default function ReportedPropertiesPage() {
  const supabase = createClient()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [titleMap, setTitleMap] = useState<Record<string, string>>({})

  // 페이지네이션 + DB 검색 (2026-04 audit, #8)
  const {
    rows: rawRows,
    loading,
    page,
    setPage,
    pageSize,
    totalCount,
    totalPages,
    search,
    setSearch,
    reload: load,
  } = useAdminTable<Report>({
    table: 'property_reports',
    searchColumns: ['reason', 'detail'],
    pageSize: 50,
    orderBy: { column: 'created_at', ascending: false },
  })

  // 매물 제목 — 현재 페이지 row 의 property_id 만 .in() 조회.
  useEffect(() => {
    const ids = Array.from(new Set(rawRows.map((r) => r.property_id))).filter(Boolean)
    if (ids.length === 0) {
      setTitleMap({})
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: props } = await supabase.from('properties').select('id,title').in('id', ids)
      if (cancelled) return
      const map = (props || []).reduce<Record<string, string>>((acc, p: any) => {
        acc[p.id] = p.title
        return acc
      }, {})
      setTitleMap(map)
    })()
    return () => {
      cancelled = true
    }
  }, [rawRows, supabase])

  const rows = useMemo(
    () => rawRows.map((r) => ({ ...r, property_title: titleMap[r.property_id] || '(삭제됨)' })),
    [rawRows, titleMap],
  )

  const updateStatus = async (r: Report, status: 'reviewed' | 'resolved' | 'rejected') => {
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('property_reports')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userData.user?.id || null,
        admin_note: notes[r.id] ?? r.admin_note ?? null,
      })
      .eq('id', r.id)
    if (error) return toast.error(error.message)
    load()
  }

  const columns: AdminColumn<Report>[] = [
    { key: 'id', label: 'ID', render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> },
    {
      key: 'property_title',
      label: '매물',
      render: (r) => <span className="font-medium">{r.property_title}</span>,
    },
    { key: 'reason', label: '사유' },
    {
      key: 'detail',
      label: '상세',
      hideOn: 'md',
      render: (r) => <span className="text-xs text-muted-foreground line-clamp-2">{r.detail || '-'}</span>,
    },
    {
      key: 'status',
      label: '상태',
      render: (r) => <Badge variant="outline" className={statusColor(r.status)}>{r.status || 'pending'}</Badge>,
    },
    {
      key: 'admin_note',
      label: '관리자 메모',
      hideOn: 'lg',
      render: (r) => (
        <Textarea
          className="min-h-[60px] w-48"
          defaultValue={r.admin_note || ''}
          onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
          placeholder="메모..."
        />
      ),
    },
    {
      key: 'created_at',
      label: '신고일',
      hideOn: 'md',
      render: (r) => new Date(r.created_at).toLocaleDateString('ko-KR'),
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title="신고된 매물"
        description="사용자로부터 신고된 매물을 검토합니다"
        icon={<Flag className="w-6 h-6 text-primary" />}
      />
      <AdminPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        setPage={setPage}
        search={search}
        setSearch={setSearch}
        searchPlaceholder="사유·상세 검색"
      />
      <AdminDataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="신고된 매물이 없습니다"
        actions={(r) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => updateStatus(r, 'reviewed')}>
              <Eye className="w-4 h-4" /> 검토
            </Button>
            <Button size="sm" variant="outline" onClick={() => updateStatus(r, 'resolved')}>
              <Check className="w-4 h-4 text-green-600" /> 해결
            </Button>
            <Button size="sm" variant="outline" onClick={() => updateStatus(r, 'rejected')}>
              <X className="w-4 h-4 text-red-500" /> 기각
            </Button>
          </div>
        )}
      />
    </div>
  )
}
