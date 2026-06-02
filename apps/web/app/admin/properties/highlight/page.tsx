'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminDataTable, AdminColumn } from '@/components/admin/data-table'
import { Star, Trash2, Plus, Search } from 'lucide-react'
import { toast } from "sonner"

type Highlight = {
  id: string
  property_id: string
  badge: string | null
  sort_order: number | null
  start_at: string | null
  end_at: string | null
  created_at: string
  property_title?: string
}

const BADGES = ['premium', 'hot', 'new', 'recommended']

export default function HighlightPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Highlight[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    property_id: '',
    badge: 'premium',
    sort_order: 0,
    start_at: '',
    end_at: '',
  })
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; title: string }[]>([])

  const load = async () => {
    setLoading(true)
    const plaza = getCurrentPlazaClient()
    let q: any = supabase
      .from('property_highlights')
      .select('*')
      .order('sort_order', { ascending: true })
    if (plaza) q = q.eq('plaza_id', plaza)
    const { data, error } = await q
    if (error) {
      toast.error(error.message)
      setRows([])
      setLoading(false)
      return
    }
    const list = (data as Highlight[]) || []
    const ids = Array.from(new Set(list.map((l) => l.property_id))).filter(Boolean)
    let titleMap: Record<string, string> = {}
    if (ids.length) {
      const { data: props } = await supabase.from('properties').select('id,title').in('id', ids)
      titleMap = (props || []).reduce<Record<string, string>>((acc, p: any) => {
        acc[p.id] = p.title
        return acc
      }, {})
    }
    setRows(list.map((l) => ({ ...l, property_title: titleMap[l.property_id] || '(삭제됨)' })))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const searchProperty = async () => {
    if (!searchQ.trim()) {
      setSearchResults([])
      return
    }
    const { data } = await supabase
      .from('properties')
      .select('id,title')
      .ilike('title', `%${searchQ.trim()}%`)
      .limit(10)
    setSearchResults((data as any) || [])
  }

  const create = async () => {
    if (!form.property_id.trim()) return toast('매물 ID를 선택/입력하세요')
    const { data: userData } = await supabase.auth.getUser()
    const plaza = getCurrentPlazaClient()
    const { error } = await supabase.from('property_highlights').insert({
      property_id: form.property_id,
      badge: form.badge,
      sort_order: Number(form.sort_order) || 0,
      start_at: form.start_at || null,
      end_at: form.end_at || null,
      created_by: userData.user?.id || null,
      ...(plaza ? { plaza_id: plaza } : {}),
    })
    if (error) return toast.error(error.message)
    setForm({ property_id: '', badge: 'premium', sort_order: 0, start_at: '', end_at: '' })
    setSearchResults([])
    setSearchQ('')
    load()
  }

  const remove = async (r: Highlight) => {
    if (!confirm('하이라이트를 제거하시겠습니까?')) return
    const { error } = await supabase.from('property_highlights').delete().eq('id', r.id)
    if (error) return toast.error(error.message)
    load()
  }

  const columns: AdminColumn<Highlight>[] = [
    { key: 'property_title', label: '매물', render: (r) => <span className="font-medium">{r.property_title}</span> },
    {
      key: 'property_id',
      label: '매물 ID',
      hideOn: 'md',
      render: (r) => <span className="font-mono text-xs">{r.property_id.slice(0, 8)}</span>,
    },
    {
      key: 'badge',
      label: '배지',
      render: (r) => <Badge variant="outline">{r.badge || '-'}</Badge>,
    },
    { key: 'sort_order', label: '순서', hideOn: 'md' },
    {
      key: 'start_at',
      label: '시작',
      hideOn: 'lg',
      render: (r) => (r.start_at ? new Date(r.start_at).toLocaleDateString('ko-KR') : '-'),
    },
    {
      key: 'end_at',
      label: '종료',
      hideOn: 'lg',
      render: (r) => (r.end_at ? new Date(r.end_at).toLocaleDateString('ko-KR') : '-'),
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title="하이라이트 관리"
        description="주요 매물 배지 및 노출 관리"
        icon={<Star className="w-6 h-6 text-primary" />}
      />

      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> 하이라이트 추가
        </h2>

        <div className="flex gap-2 mb-3">
          <Input
            placeholder="매물 제목 검색"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchProperty()}
          />
          <Button variant="outline" onClick={searchProperty}>
            <Search className="w-4 h-4" />
          </Button>
        </div>
        {searchResults.length > 0 && (
          <div className="mb-3 border border-border rounded-md divide-y divide-border max-h-48 overflow-y-auto">
            {searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setForm({ ...form, property_id: p.id })
                  setSearchResults([])
                }}
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
              >
                <span className="font-medium">{p.title}</span>{' '}
                <span className="font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2">
            <Label className="text-xs">매물 ID (UUID)</Label>
            <Input value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">배지</Label>
            <select
              value={form.badge}
              onChange={(e) => setForm({ ...form, badge: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {BADGES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">순서</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs">시작</Label>
            <Input type="date" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">종료</Label>
            <Input type="date" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={create}>추가</Button>
        </div>
      </div>

      <AdminDataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyText="하이라이트가 없습니다"
        actions={(r) => (
          <Button size="sm" variant="outline" onClick={() => remove(r)}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        )}
      />
    </div>
  )
}
