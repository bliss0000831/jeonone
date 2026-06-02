'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminDataTable, AdminColumn } from '@/components/admin/data-table'
import { Menu, Plus, Trash2, Pencil, Save, X } from 'lucide-react'
import { toast } from "sonner"

interface MenuItem {
  id: string
  label: string
  href: string
  icon: string | null
  sort_order: number
  is_active: boolean
  parent_id: string | null
  created_at: string
}

interface FormState {
  label: string
  href: string
  icon: string
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  label: '',
  href: '',
  icon: '',
  sort_order: 0,
  is_active: true,
}

export default function ThemeMenuPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)

  const load = async () => {
    setLoading(true)
    const plaza = getCurrentPlazaClient()
    let q: any = supabase
      .from('homepage_menu')
      .select('*')
      .order('sort_order', { ascending: true })
    if (plaza) q = q.eq('plaza_id', plaza)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setRows((data as MenuItem[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    if (!form.label || !form.href) {
      toast('라벨과 링크는 필수입니다')
      return
    }
    const plaza = getCurrentPlazaClient()
    const { error } = await supabase.from('homepage_menu').insert({
      label: form.label,
      href: form.href,
      icon: form.icon || null,
      sort_order: form.sort_order,
      is_active: form.is_active,
      ...(plaza ? { plaza_id: plaza } : {}),
    })
    if (error) {
      toast.error(error.message)
      return
    }
    setForm(EMPTY_FORM)
    load()
  }

  const startEdit = (row: MenuItem) => {
    setEditingId(row.id)
    setEditForm({
      label: row.label,
      href: row.href,
      icon: row.icon || '',
      sort_order: row.sort_order,
      is_active: row.is_active,
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    const { error } = await supabase
      .from('homepage_menu')
      .update({
        label: editForm.label,
        href: editForm.href,
        icon: editForm.icon || null,
        sort_order: editForm.sort_order,
        is_active: editForm.is_active,
      })
      .eq('id', editingId)
    if (error) {
      toast.error(error.message)
      return
    }
    setEditingId(null)
    load()
  }

  const toggleActive = async (row: MenuItem, next: boolean) => {
    const { error } = await supabase
      .from('homepage_menu')
      .update({ is_active: next })
      .eq('id', row.id)
    if (error) toast.error(error.message)
    else load()
  }

  const remove = async (row: MenuItem) => {
    if (!confirm(`"${row.label}" 메뉴를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('homepage_menu').delete().eq('id', row.id)
    if (error) toast.error(error.message)
    else load()
  }

  const columns: AdminColumn<MenuItem>[] = [
    {
      key: 'label',
      label: '라벨',
      render: (r) =>
        editingId === r.id ? (
          <Input
            value={editForm.label}
            onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
            className="h-8"
          />
        ) : (
          r.label
        ),
    },
    {
      key: 'href',
      label: '링크',
      render: (r) =>
        editingId === r.id ? (
          <Input
            value={editForm.href}
            onChange={(e) => setEditForm({ ...editForm, href: e.target.value })}
            className="h-8"
          />
        ) : (
          <span className="font-mono text-xs">{r.href}</span>
        ),
    },
    {
      key: 'icon',
      label: '아이콘',
      hideOn: 'sm',
      render: (r) =>
        editingId === r.id ? (
          <Input
            value={editForm.icon}
            onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
            className="h-8"
          />
        ) : (
          r.icon || '-'
        ),
    },
    {
      key: 'sort_order',
      label: '순서',
      hideOn: 'sm',
      render: (r) =>
        editingId === r.id ? (
          <Input
            type="number"
            value={editForm.sort_order}
            onChange={(e) =>
              setEditForm({ ...editForm, sort_order: Number(e.target.value) })
            }
            className="h-8 w-20"
          />
        ) : (
          r.sort_order
        ),
    },
    {
      key: 'is_active',
      label: '활성',
      render: (r) =>
        editingId === r.id ? (
          <Switch
            checked={editForm.is_active}
            onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })}
          />
        ) : (
          <Switch
            checked={r.is_active}
            onCheckedChange={(v) => toggleActive(r, v)}
          />
        ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        title="메뉴설정"
        description="홈페이지 상단 메뉴 관리"
        icon={<Menu className="w-6 h-6" />}
      />

      <AdminDataTable<MenuItem>
        columns={columns}
        rows={rows}
        loading={loading}
        actions={(r) =>
          editingId === r.id ? (
            <div className="flex gap-1 justify-end">
              <Button size="sm" variant="outline" onClick={saveEdit}>
                <Save className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-1 justify-end">
              <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove(r)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )
        }
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold">새 메뉴 추가</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label>라벨</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="홈"
              />
            </div>
            <div className="space-y-1">
              <Label>링크</Label>
              <Input
                value={form.href}
                onChange={(e) => setForm({ ...form, href: e.target.value })}
                placeholder="/"
              />
            </div>
            <div className="space-y-1">
              <Label>아이콘</Label>
              <Input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="home"
              />
            </div>
            <div className="space-y-1">
              <Label>순서</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm({ ...form, sort_order: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>활성</Label>
              <div className="h-10 flex items-center">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={add}>
              <Plus className="w-4 h-4 mr-1" /> 추가
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
