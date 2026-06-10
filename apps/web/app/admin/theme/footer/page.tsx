'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Layout, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from "sonner"

interface FooterLink {
  label: string
  href: string
}

interface FooterSettings {
  copyright: string
  show_sns: boolean
  sns: {
    instagram: string
    youtube: string
    blog: string
  }
  links: FooterLink[]
}

const DEFAULT: FooterSettings = {
  copyright: '',
  show_sns: true,
  sns: { instagram: '', youtube: '', blog: '' },
  links: [],
}

export default function ThemeFooterPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FooterSettings>(DEFAULT)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'theme_footer')
        .maybeSingle()
      const parsed = data?.value
        ? typeof data.value === 'string'
          ? JSON.parse(data.value)
          : data.value
        : {}
      setForm({
        ...DEFAULT,
        ...parsed,
        sns: { ...DEFAULT.sns, ...(parsed?.sns || {}) },
        links: Array.isArray(parsed?.links) ? parsed.links : [],
      })
      setLoading(false)
    }
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('site_settings').upsert(
      {
        key: 'theme_footer',
        value: JSON.stringify(form),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('저장되었습니다')
  }

  const addLink = () =>
    setForm({ ...form, links: [...form.links, { label: '', href: '' }] })

  const removeLink = (idx: number) =>
    setForm({ ...form, links: form.links.filter((_, i) => i !== idx) })

  const updateLink = (idx: number, patch: Partial<FooterLink>) =>
    setForm({
      ...form,
      links: form.links.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <AdminPageHeader
        title="푸터설정"
        description="사이트 하단 영역 설정"
        icon={<Layout className="w-6 h-6" />}
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="copyright">저작권 문구</Label>
            <Input
              id="copyright"
              value={form.copyright}
              onChange={(e) => setForm({ ...form, copyright: e.target.value })}
              placeholder="© 2026 전원일기. All rights reserved."
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-input p-3">
            <Label htmlFor="show_sns">SNS 아이콘 표시</Label>
            <Switch
              id="show_sns"
              checked={form.show_sns}
              onCheckedChange={(v) => setForm({ ...form, show_sns: v })}
            />
          </div>

          <div className="space-y-2">
            <Label>인스타그램 URL</Label>
            <Input
              value={form.sns.instagram}
              onChange={(e) =>
                setForm({ ...form, sns: { ...form.sns, instagram: e.target.value } })
              }
              placeholder="https://instagram.com/..."
            />
          </div>
          <div className="space-y-2">
            <Label>유튜브 URL</Label>
            <Input
              value={form.sns.youtube}
              onChange={(e) =>
                setForm({ ...form, sns: { ...form.sns, youtube: e.target.value } })
              }
              placeholder="https://youtube.com/..."
            />
          </div>
          <div className="space-y-2">
            <Label>블로그 URL</Label>
            <Input
              value={form.sns.blog}
              onChange={(e) =>
                setForm({ ...form, sns: { ...form.sns, blog: e.target.value } })
              }
              placeholder="https://blog.naver.com/..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">하단 링크 목록</h2>
            <Button size="sm" variant="outline" onClick={addLink}>
              <Plus className="w-4 h-4 mr-1" /> 추가
            </Button>
          </div>
          {form.links.length === 0 && (
            <p className="text-sm text-muted-foreground">등록된 링크가 없습니다.</p>
          )}
          <div className="space-y-2">
            {form.links.map((link, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <Input
                  placeholder="라벨"
                  value={link.label}
                  onChange={(e) => updateLink(idx, { label: e.target.value })}
                />
                <Input
                  placeholder="/privacy"
                  value={link.href}
                  onChange={(e) => updateLink(idx, { href: e.target.value })}
                />
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={() => removeLink(idx)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
