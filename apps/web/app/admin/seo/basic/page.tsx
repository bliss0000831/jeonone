'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Settings, Loader2 } from 'lucide-react'
import { toast } from "sonner"

interface SeoBasic {
  title_suffix: string
  default_description: string
  default_keywords: string
  robots: string
  og_image: string
}

const DEFAULT: SeoBasic = {
  title_suffix: '',
  default_description: '',
  default_keywords: '',
  robots: 'index,follow',
  og_image: '',
}

export default function SeoBasicPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<SeoBasic>(DEFAULT)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'seo_basic')
        .maybeSingle()
      const parsed = data?.value
        ? typeof data.value === 'string'
          ? JSON.parse(data.value)
          : data.value
        : {}
      setForm({ ...DEFAULT, ...parsed })
      setLoading(false)
    }
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('site_settings').upsert(
      {
        key: 'seo_basic',
        value: JSON.stringify(form),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('저장되었습니다')
  }

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
        title="기본 SEO 설정"
        description="사이트 전역 SEO 메타 기본값"
        icon={<Settings className="w-6 h-6" />}
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title_suffix">제목 접미사</Label>
            <Input
              id="title_suffix"
              value={form.title_suffix}
              onChange={(e) => setForm({ ...form, title_suffix: e.target.value })}
              placeholder="| 춘천광장"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_description">기본 설명</Label>
            <Textarea
              id="default_description"
              rows={3}
              value={form.default_description}
              onChange={(e) =>
                setForm({ ...form, default_description: e.target.value })
              }
              placeholder="사이트 기본 메타 설명"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_keywords">기본 키워드</Label>
            <Input
              id="default_keywords"
              value={form.default_keywords}
              onChange={(e) =>
                setForm({ ...form, default_keywords: e.target.value })
              }
              placeholder="춘천, 부동산, 매물"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="robots">Robots</Label>
            <select
              id="robots"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.robots}
              onChange={(e) => setForm({ ...form, robots: e.target.value })}
            >
              <option value="index,follow">index, follow</option>
              <option value="noindex,nofollow">noindex, nofollow</option>
              <option value="index,nofollow">index, nofollow</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="og_image">OG 이미지 URL</Label>
            <Input
              id="og_image"
              value={form.og_image}
              onChange={(e) => setForm({ ...form, og_image: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
