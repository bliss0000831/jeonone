'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Map, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react'
import { toast } from "sonner"

interface SitemapCfg {
  include: string[]
  exclude: string[]
}

const DEFAULT: SitemapCfg = { include: [], exclude: [] }

export default function SitemapPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState<SitemapCfg>(DEFAULT)
  const [newInclude, setNewInclude] = useState('')
  const [newExclude, setNewExclude] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'seo_sitemap')
        .maybeSingle()
      const parsed = data?.value
        ? typeof data.value === 'string'
          ? JSON.parse(data.value)
          : data.value
        : {}
      setCfg({ ...DEFAULT, ...parsed })
      setLoading(false)
    }
    load()
  }, [])

  const save = async (next: SitemapCfg) => {
    setSaving(true)
    const { error } = await supabase.from('site_settings').upsert(
      {
        key: 'seo_sitemap',
        value: JSON.stringify(next),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('저장되었습니다')
  }

  const addInclude = () => {
    if (!newInclude.trim()) return
    setCfg({ ...cfg, include: [...cfg.include, newInclude.trim()] })
    setNewInclude('')
  }
  const removeInclude = (i: number) =>
    setCfg({ ...cfg, include: cfg.include.filter((_, idx) => idx !== i) })
  const addExclude = () => {
    if (!newExclude.trim()) return
    setCfg({ ...cfg, exclude: [...cfg.exclude, newExclude.trim()] })
    setNewExclude('')
  }
  const removeExclude = (i: number) =>
    setCfg({ ...cfg, exclude: cfg.exclude.filter((_, idx) => idx !== i) })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <AdminPageHeader
        title="사이트맵 관리"
        description="검색엔진용 사이트맵 경로 설정"
        icon={<Map className="w-6 h-6" />}
      />

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground flex items-center justify-between gap-4 flex-wrap">
          <span>사이트맵은 /sitemap.xml 자동 생성됩니다</span>
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="w-4 h-4" /> sitemap.xml 열기
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">포함 경로</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newInclude}
              onChange={(e) => setNewInclude(e.target.value)}
              placeholder="/custom/path"
              onKeyDown={(e) => e.key === 'Enter' && addInclude()}
            />
            <Button onClick={addInclude} variant="outline">
              <Plus className="w-4 h-4 mr-1" /> 추가
            </Button>
          </div>
          {cfg.include.length === 0 ? (
            <p className="text-sm text-muted-foreground">추가된 경로 없음</p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-md">
              {cfg.include.map((p, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-mono">{p}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeInclude(i)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">제외 경로</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newExclude}
              onChange={(e) => setNewExclude(e.target.value)}
              placeholder="/private/path"
              onKeyDown={(e) => e.key === 'Enter' && addExclude()}
            />
            <Button onClick={addExclude} variant="outline">
              <Plus className="w-4 h-4 mr-1" /> 추가
            </Button>
          </div>
          {cfg.exclude.length === 0 ? (
            <p className="text-sm text-muted-foreground">추가된 경로 없음</p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-md">
              {cfg.exclude.map((p, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-mono">{p}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeExclude(i)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save(cfg)} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
