'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Tags, Loader2 } from 'lucide-react'
import { toast } from "sonner"

interface MetaTags {
  google: string
  naver: string
  kakao_app_id: string
}

const DEFAULT: MetaTags = {
  google: '',
  naver: '',
  kakao_app_id: '',
}

export default function SeoMetaPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<MetaTags>(DEFAULT)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'seo_meta_tags')
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
        key: 'seo_meta_tags',
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
        title="메타태그 관리"
        description="사이트 인증 및 외부 서비스 키"
        icon={<Tags className="w-6 h-6" />}
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="google">구글 사이트 인증 (google-site-verification)</Label>
            <Input
              id="google"
              value={form.google}
              onChange={(e) =>
                setForm({ ...form, google: e.target.value })
              }
              placeholder="google-site-verification 토큰"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="naver">네이버 사이트 인증 (naver-site-verification)</Label>
            <Input
              id="naver"
              value={form.naver}
              onChange={(e) =>
                setForm({ ...form, naver: e.target.value })
              }
              placeholder="naver-site-verification 토큰"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kakao">카카오 앱 ID</Label>
            <Input
              id="kakao"
              value={form.kakao_app_id}
              onChange={(e) => setForm({ ...form, kakao_app_id: e.target.value })}
              placeholder="Kakao App ID"
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
