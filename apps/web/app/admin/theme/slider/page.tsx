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
import { Images, Plus, Trash2, Pencil, Save, X } from 'lucide-react'
import { toast } from "sonner"

interface SliderItem {
  id: string
  title: string
  image_url: string
  link_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

interface FormState {
  title: string
  image_url: string
  link_url: string
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  title: '',
  image_url: '',
  link_url: '',
  sort_order: 0,
  is_active: true,
}

export default function ThemeSliderPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<SliderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)

  const load = async () => {
    setLoading(true)
    const plaza = getCurrentPlazaClient()
    let q: any = supabase
      .from('homepage_slider')
      .select('*')
      .order('sort_order', { ascending: true })
    if (plaza) q = q.eq('plaza_id', plaza)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setRows((data as SliderItem[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    if (!form.title || !form.image_url) {
      toast('제목과 이미지 URL은 필수입니다')
      return
    }
    const plaza = getCurrentPlazaClient()
    const { error } = await supabase.from('homepage_slider').insert({
      title: form.title,
      image_url: form.image_url,
      link_url: form.link_url || null,
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

  const startEdit = (row: SliderItem) => {
    setEditingId(row.id)
    setEditForm({
      title: row.title,
      image_url: row.image_url,
      link_url: row.link_url || '',
      sort_order: row.sort_order,
      is_active: row.is_active,
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    const { error } = await supabase
      .from('homepage_slider')
      .update({
        title: editForm.title,
        image_url: editForm.image_url,
        link_url: editForm.link_url || null,
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

  const toggleActive = async (row: SliderItem, next: boolean) => {
    const { error } = await supabase
      .from('homepage_slider')
      .update({ is_active: next })
      .eq('id', row.id)
    if (error) toast.error(error.message)
    else load()
  }

  const remove = async (row: SliderItem) => {
    if (!confirm(`"${row.title}" 슬라이드를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('homepage_slider').delete().eq('id', row.id)
    if (error) toast.error(error.message)
    else load()
  }

  const columns: AdminColumn<SliderItem>[] = [
    {
      key: 'image_url',
      label: '이미지',
      render: (r) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={editingId === r.id ? editForm.image_url : r.image_url}
          alt={r.title}
          className="w-20 h-12 object-cover rounded border border-border"
        />
      ),
    },
    {
      key: 'title',
      label: '제목',
      render: (r) =>
        editingId === r.id ? (
          <Input
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            className="h-8"
          />
        ) : (
          r.title
        ),
    },
    {
      key: 'link_url',
      label: '링크',
      hideOn: 'sm',
      render: (r) =>
        editingId === r.id ? (
          <Input
            value={editForm.link_url}
            onChange={(e) => setEditForm({ ...editForm, link_url: e.target.value })}
            className="h-8"
          />
        ) : (
          <span className="font-mono text-xs">{r.link_url || '-'}</span>
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
          <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} />
        ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        title="슬라이더관리"
        description="메인 슬라이더 이미지 관리"
        icon={<Images className="w-6 h-6" />}
      />

      <AdminDataTable<SliderItem>
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
          <h2 className="font-semibold">새 슬라이드 추가</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>제목</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>이미지 URL</Label>
              <Input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1">
              <Label>링크 URL</Label>
              <Input
                value={form.link_url}
                onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                placeholder="/notice/123"
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
            {form.image_url && (
              <div className="space-y-1">
                <Label>미리보기</Label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.image_url}
                  alt="preview"
                  className="w-40 h-24 object-cover rounded border border-border"
                />
              </div>
            )}
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
