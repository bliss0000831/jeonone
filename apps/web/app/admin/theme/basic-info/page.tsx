'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Building2, Loader2, Upload, X, ImageIcon } from 'lucide-react'
import { toast } from "sonner"

interface BasicInfo {
  company_name: string
  address: string
  phone: string
  email: string
  business_number: string
}

const DEFAULT: BasicInfo = {
  company_name: '',
  address: '',
  phone: '',
  email: '',
  business_number: '',
}

const DEFAULT_LOGO = '/logo.png?v=3'

export default function ThemeBasicInfoPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<BasicInfo>(DEFAULT)

  // 로고 — site_settings.site_logo 에 별개 키로 저장
  const [logoUrl, setLogoUrl] = useState<string>(DEFAULT_LOGO)
  const [siteName, setSiteName] = useState<string>('전원일기')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      const plaza = getCurrentPlazaClient()
      if (plaza) {
        // 광장별 — plazas.theme 에서 로고/이름 조회 + theme_basic_info 는 광장 단위
        const [{ data: plazaRow }, { data: settingsData }] = await Promise.all([
          supabase.from('plazas').select('name, theme').eq('id', plaza).maybeSingle(),
          // theme_basic_info 는 일단 site_settings 글로벌 — Phase 3 에서 광장별 분리 검토
          supabase.from('site_settings').select('key, value').in('key', ['theme_basic_info']),
        ])
        if (plazaRow?.name) setSiteName(plazaRow.name)
        const t = (plazaRow?.theme || {}) as any
        const logo = t.logoUrl || t.logo_url
        if (typeof logo === 'string' && logo) setLogoUrl(logo)
        settingsData?.forEach((row: { key: string; value: any }) => {
          const parsed = typeof row.value === 'string'
            ? (() => { try { return JSON.parse(row.value) } catch { return row.value } })()
            : row.value
          if (row.key === 'theme_basic_info' && parsed && typeof parsed === 'object') {
            setForm({ ...DEFAULT, ...parsed })
          }
        })
      } else {
        // 허브 — 글로벌 site_settings (super admin 전용 hub_logo / hub_site_name)
        const { data } = await supabase
          .from('site_settings')
          .select('key, value')
          .in('key', ['theme_basic_info', 'hub_logo', 'hub_site_name'])
        data?.forEach((row: { key: string; value: any }) => {
          const parsed = typeof row.value === 'string'
            ? (() => { try { return JSON.parse(row.value) } catch { return row.value } })()
            : row.value
          if (row.key === 'theme_basic_info' && parsed && typeof parsed === 'object') {
            setForm({ ...DEFAULT, ...parsed })
          } else if (row.key === 'hub_logo' && typeof parsed === 'string') {
            setLogoUrl(parsed || DEFAULT_LOGO)
          } else if (row.key === 'hub_site_name' && typeof parsed === 'string') {
            setSiteName(parsed)
          }
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  const uploadLogo = async (file: File) => {
    // 클라이언트 검증 — 타입/크기
    if (!file.type.startsWith('image/')) {
      toast('이미지 파일만 업로드할 수 있습니다')
      return
    }
    // SVG 는 XSS 벡터라 허용하지 않음 (PNG/JPG/WEBP 권장)
    if (file.type === 'image/svg+xml') {
      toast('보안상 SVG 는 지원하지 않습니다. PNG 또는 JPG 파일을 올려주세요.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('로고 파일은 5MB 이하여야 합니다')
      return
    }

    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'site-logo')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error || '업로드 실패')
        return
      }
      const url: string | undefined = json?.url || json?.publicUrl || json?.data?.url
      if (!url) {
        toast('업로드는 되었지만 URL 을 받지 못했습니다')
        return
      }
      setLogoUrl(url)
    } catch (err: any) {
      toast.error(err?.message || '업로드 실패')
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const resetLogo = () => {
    if (!confirm('로고를 기본값(/logo.png)으로 되돌릴까요?')) return
    setLogoUrl(DEFAULT_LOGO)
  }

  const save = async () => {
    setSaving(true)
    try {
      const plaza = getCurrentPlazaClient()

      if (plaza) {
        // 광장별 — plazas.theme.logoUrl + plazas.name + theme_basic_info (글로벌)
        // RLS 가 막으면 silent 0-row 가 나서 옛 로고가 그대로 보였던 버그 →
        // .select() 로 실제 update 된 row 를 받아서 검증한다.
        const { data: cur } = await supabase.from('plazas').select('theme').eq('id', plaza).maybeSingle()
        const mergedTheme = { ...((cur?.theme as Record<string, any>) || {}), logoUrl, logo_url: logoUrl }
        const updatePlaza = supabase
          .from('plazas')
          .update({ theme: mergedTheme, name: siteName, updated_at: new Date().toISOString() })
          .eq('id', plaza)
          .select('id, theme, name')
        const updateSettings = fetch('/api/site-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: [{ key: 'theme_basic_info', value: form }],
          }),
        })
        const [plazaRes] = await Promise.all([updatePlaza, updateSettings])
        if (plazaRes.error) {
          toast.error('광장 정보 저장 실패: ' + plazaRes.error.message)
          return
        }
        const updated = plazaRes.data?.[0]
        if (!updated) {
          toast.error(
            '⚠️ 권한이 없어 저장되지 않았습니다.\n\n' +
              '이 광장(' + plaza + ')에 대한 어드민 권한이 없습니다.\n' +
              '슈퍼관리자에게 문의하세요.'
          )
          return
        }
        const savedLogo = (updated.theme as any)?.logoUrl
        if (savedLogo !== logoUrl) {
          toast.error(
            '⚠️ DB 저장 값이 다릅니다!\n\n보낸 값: ' + logoUrl + '\n저장된 값: ' + savedLogo
          )
          return
        }
        try { sessionStorage.removeItem('siteBranding') } catch {}
        toast.success('저장되었습니다 (광장: ' + updated.name + '). 새로고침합니다.')
        // 캐시 무효화 후 hard reload
        try {
          await fetch('/api/site-settings', { method: 'PUT', cache: 'no-store' })
        } catch {}
        window.location.href = window.location.pathname + '?_t=' + Date.now()
        return
      }

      // 허브 (super admin) — site_settings.hub_* 키로 저장
      const res = await fetch('/api/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [
            { key: 'theme_basic_info', value: form },
            { key: 'hub_logo', value: logoUrl },
            { key: 'hub_site_name', value: siteName },
          ],
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        console.error('[basic-info] 저장 실패 응답:', json)
        toast.error(
          (json?.error || '저장 실패') +
            (json?.requested && json?.written
              ? `\n\nrequested: ${JSON.stringify(json.requested)}\nwritten: ${JSON.stringify(json.written)}\nwriteMode: ${json.writeMode}`
              : ''),
        )
        return
      }
      // [basic-info] 저장 성공 — 디버그 로그 제거됨
      // DB 에 실제로 반영된 값 확인 (verify.hub_logo 가 우리가 보낸 URL 과 일치해야 함)
      const savedLogo = json?.verify?.hub_logo
      if (typeof savedLogo === 'string' && savedLogo !== logoUrl) {
        toast.error(
          `⚠️ DB 저장 값이 보낸 값과 다릅니다!\n\n보낸 값: ${logoUrl}\n저장된 값: ${savedLogo}\n\n콘솔을 확인해 주세요.`,
        )
        return
      }
      // 헤더 sessionStorage 캐시도 털기
      try { sessionStorage.removeItem('siteBranding') } catch {}
      toast.success(
        `저장되었습니다 (${json?.writeMode || '?'} 모드).\nsite_logo = ${savedLogo}\n\n사이트 전반에 반영됩니다.`,
      )
      window.location.reload()
    } catch (err: any) {
      toast.error(err?.message || '저장 실패')
    } finally {
      setSaving(false)
    }
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
        title="기본정보"
        description="사이트 로고 · 사이트명 · 회사 정보"
        icon={<Building2 className="w-6 h-6" />}
      />

      {/* 로고 + 사이트명 — 브랜드 카드 */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-base">브랜드</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              헤더·파비콘·OG 이미지(카카오톡 공유 썸네일 등)에 모두 사용됩니다
            </p>
          </div>

          {/* 로고 업로드 */}
          <div className="space-y-2">
            <Label>사이트 로고</Label>
            <div className="flex items-start gap-4">
              {/* 미리보기 */}
              <div className="w-20 h-20 rounded-xl border border-border bg-muted/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  // 외부 URL 일 수 있으므로 <img> 사용
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="로고 미리보기"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                )}
              </div>

              {/* 업로드 액션 */}
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadLogo(f)
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="gap-1.5"
                  >
                    {uploadingLogo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {uploadingLogo ? '업로드 중...' : '이미지 선택'}
                  </Button>
                  {logoUrl && logoUrl !== DEFAULT_LOGO && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={resetLogo}
                      className="gap-1.5 text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                      기본값으로
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  권장: <strong>512×512 정사각형 PNG(투명 배경)</strong> · 최대 5MB ·
                  PNG/JPG/WEBP 만 허용 (SVG 는 보안상 불가)
                </p>
                {/* URL 직접 입력도 허용 — 외부 CDN 에 이미 올려둔 경우 */}
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="또는 이미지 URL 직접 입력"
                  className="text-xs font-mono h-8"
                />
              </div>
            </div>
          </div>

          {/* 사이트명 */}
          <div className="space-y-2">
            <Label htmlFor="site_name">사이트명</Label>
            <Input
              id="site_name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="전원일기"
            />
            <p className="text-[11px] text-muted-foreground">
              헤더·탭 제목·OG 미리보기에 노출되는 사이트 이름
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 회사 정보 */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-semibold text-base">회사 정보</h2>
          <div className="space-y-2">
            <Label htmlFor="company_name">회사명</Label>
            <Input
              id="company_name"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="(주)전원일기"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">주소</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="강원도 춘천시 ..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">연락처</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="033-000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="contact@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_number">사업자번호</Label>
            <Input
              id="business_number"
              value={form.business_number}
              onChange={(e) => setForm({ ...form, business_number: e.target.value })}
              placeholder="000-00-00000"
            />
          </div>
        </CardContent>
      </Card>

      {/* 저장 */}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              저장 중...
            </>
          ) : (
            '저장'
          )}
        </Button>
      </div>
    </div>
  )
}
