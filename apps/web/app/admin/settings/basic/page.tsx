'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save, Settings, Globe, Mail, Image, Megaphone } from 'lucide-react'

interface SiteSettings {
  site_name: string
  site_description: string
  admin_email: string
  site_logo: string
  homepage_banner_title: string
  homepage_banner_subtitle: string
  smtp_enabled: boolean
  maintenance_mode: boolean
  announcement_enabled: boolean
  announcement_message: string
  announcement_link: string
  announcement_variant: string
}

export default function BasicSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>({
    site_name: '전원일기',
    site_description: '농기구·로컬푸드 직거래, 농촌 정보, 마을 커뮤니티',
    admin_email: '',
    site_logo: '',
    homepage_banner_title: '전원일기',
    homepage_banner_subtitle: '농업인을 위한 따뜻한 마을 장터',
    smtp_enabled: false,
    maintenance_mode: false,
    announcement_enabled: false,
    announcement_message: '',
    announcement_link: '',
    announcement_variant: 'info',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [plazaId, setPlazaId] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const plaza = getCurrentPlazaClient()
        setPlazaId(plaza)

        // 슈퍼관리자 여부 확인
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const [profileRes, paRes] = await Promise.all([
            supabase.from('profiles').select('role').eq('id', user.id).single(),
            supabase.from('plaza_admins').select('role').eq('user_id', user.id),
          ])
          const isLegacySuper = profileRes.data?.role === 'superadmin'
          const isSuperRole = (paRes.data || []).some((r: any) => r.role === 'super')
          setIsSuperAdmin(isLegacySuper || isSuperRole)
        }

        // 글로벌 site_settings 로드 (기본값)
        const { data } = await supabase
          .from('site_settings')
          .select('key, value')

        if (data) {
          const newSettings: any = { ...settings }
          data.forEach((item) => {
            try {
              const parsed = typeof item.value === 'string' ? JSON.parse(item.value) : item.value
              if (item.key === 'homepage_banner' && typeof parsed === 'object') {
                newSettings.homepage_banner_title = parsed.title || ''
                newSettings.homepage_banner_subtitle = parsed.subtitle || ''
              } else if (item.key === 'announcement_bar' && typeof parsed === 'object') {
                newSettings.announcement_enabled = !!parsed.enabled
                newSettings.announcement_message = parsed.message || ''
                newSettings.announcement_link = parsed.link || ''
                newSettings.announcement_variant = parsed.variant || 'info'
              } else {
                newSettings[item.key] = parsed
              }
            } catch {
              newSettings[item.key] = item.value
            }
          })
          setSettings(newSettings)
        }

        // 지역별 설정: plazas 테이블에서 오버라이드 (지역 격리)
        if (plaza) {
          const { data: plazaData } = await supabase
            .from('plazas')
            .select('name, theme')
            .eq('id', plaza)
            .maybeSingle()

          if (plazaData) {
            const theme = (plazaData.theme || {}) as any
            setSettings((s) => ({
              ...s,
              site_name: plazaData.name || s.site_name,
              homepage_banner_title: theme.banner_title || plazaData.name || s.homepage_banner_title,
              homepage_banner_subtitle: theme.banner_subtitle || s.homepage_banner_subtitle,
              site_logo: theme.logo || s.site_logo,
            }))
          }
        }
      } catch (error) {
        console.error('설정 로드 실패:', error)
        setMessage({ type: 'error', text: '설정 로드에 실패했습니다.' })
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const plaza = getCurrentPlazaClient()

      if (plaza) {
        // 지역별 설정: plazas.theme 에 병합 저장 (지역 격리)
        const { data: cur } = await supabase
          .from('plazas')
          .select('theme')
          .eq('id', plaza)
          .maybeSingle()

        const merged = {
          ...((cur?.theme as Record<string, any>) || {}),
          banner_title: settings.homepage_banner_title,
          banner_subtitle: settings.homepage_banner_subtitle,
          logo: settings.site_logo,
        }

        const { error: plazaErr } = await supabase
          .from('plazas')
          .update({
            name: settings.site_name,
            theme: merged,
            updated_at: new Date().toISOString(),
          })
          .eq('id', plaza)
        if (plazaErr) throw plazaErr
      }

      // 글로벌 site_settings — /api/site-settings 경유 (god-mode 권한 검증 포함)
      const entries = [
        { key: 'site_name', value: settings.site_name },
        { key: 'site_description', value: settings.site_description },
        { key: 'admin_email', value: settings.admin_email },
        { key: 'site_logo', value: settings.site_logo },
        { key: 'homepage_banner', value: {
          title: settings.homepage_banner_title,
          subtitle: settings.homepage_banner_subtitle,
        }},
        { key: 'announcement_bar', value: {
          enabled: settings.announcement_enabled,
          message: settings.announcement_message,
          link: settings.announcement_link,
          variant: settings.announcement_variant,
        }},
      ]

      const res = await fetch('/api/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      const result = await res.json()
      if (!res.ok) {
        // plaza admin 이 글로벌 설정을 수정 못하는 건 정상 — 지역별 저장은 이미 완료
        if (plaza && res.status === 403) {
          setMessage({ type: 'success', text: '지역 설정이 저장되었습니다. (글로벌 설정은 슈퍼관리자만 변경 가능)' })
          return
        }
        throw new Error(result.error || '저장 실패')
      }

      setMessage({ type: 'success', text: '설정이 저장되었습니다.' })
    } catch (error) {
      console.error('설정 저장 실패:', error)
      setMessage({ type: 'error', text: '설정 저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Settings}
        title="기본 환경설정"
        description="사이트의 기본 정보를 설정합니다"
      />

      {message && (
        <div
          className={cn(
            'px-4 py-3 rounded-lg text-sm border',
            message.type === 'error'
              ? 'bg-destructive/10 text-destructive border-destructive/20'
              : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400'
          )}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-5">
        {/* ── 사이트 정보 ── */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">사이트 정보</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">사이트의 기본 정보를 설정합니다</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="site_name">사이트 이름</Label>
              <Input
                id="site_name"
                value={settings.site_name}
                onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
                placeholder="전원일기"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="site_description">사이트 설명</Label>
              <Textarea
                id="site_description"
                value={settings.site_description}
                onChange={(e) => setSettings({ ...settings, site_description: e.target.value })}
                placeholder="사이트 설명을 입력하세요"
                rows={3}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="admin_email">관리자 이메일</Label>
              <Input
                id="admin_email"
                type="email"
                value={settings.admin_email}
                onChange={(e) => setSettings({ ...settings, admin_email: e.target.value })}
                placeholder="admin@example.com"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="site_logo">로고 URL</Label>
              <Input
                id="site_logo"
                value={settings.site_logo}
                onChange={(e) => setSettings({ ...settings, site_logo: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </div>
        </div>

        {/* ── 홈페이지 배너 ── */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">홈페이지 배너</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">홈페이지 상단 배너의 내용을 설정합니다</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="banner_title">배너 제목</Label>
              <Input
                id="banner_title"
                value={settings.homepage_banner_title}
                onChange={(e) => setSettings({ ...settings, homepage_banner_title: e.target.value })}
                placeholder="배너 제목"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="banner_subtitle">배너 부제목</Label>
              <Input
                id="banner_subtitle"
                value={settings.homepage_banner_subtitle}
                onChange={(e) => setSettings({ ...settings, homepage_banner_subtitle: e.target.value })}
                placeholder="배너 부제목"
              />
            </div>
          </div>
        </div>

        {/* ── 사이트 공지 배너 ── */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">사이트 공지 배너</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">모든 페이지 상단에 표시되는 공지 배너를 설정합니다</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">공지 배너 활성화</p>
                <p className="text-xs text-muted-foreground">
                  모든 페이지 상단에 공지 배너를 표시합니다
                </p>
              </div>
              <Switch
                checked={settings.announcement_enabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, announcement_enabled: checked })
                }
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="announcement_message">공지 메시지</Label>
              <Input
                id="announcement_message"
                value={settings.announcement_message}
                onChange={(e) =>
                  setSettings({ ...settings, announcement_message: e.target.value })
                }
                placeholder="예) 5월 5일 오전 2시~4시 서버 점검이 예정되어 있습니다"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="announcement_link">연결 링크 (선택)</Label>
              <Input
                id="announcement_link"
                value={settings.announcement_link}
                onChange={(e) =>
                  setSettings({ ...settings, announcement_link: e.target.value })
                }
                placeholder="/notice/123 또는 https://..."
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="announcement_variant">배너 스타일</Label>
              <select
                id="announcement_variant"
                className="h-10 w-full border border-input rounded-md px-3 bg-background text-sm"
                value={settings.announcement_variant}
                onChange={(e) =>
                  setSettings({ ...settings, announcement_variant: e.target.value })
                }
              >
                <option value="info">기본 (파랑)</option>
                <option value="success">완료 (초록)</option>
                <option value="warning">주의 (노랑)</option>
                <option value="danger">경고 (빨강)</option>
                <option value="megaphone">공지 (메가폰)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── 기능 설정 (슈퍼관리자 전용) ── */}
        {isSuperAdmin && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">기능 설정</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">슈퍼관리자 전용 기능 설정입니다</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">SMTP 이메일 활성화</p>
                  <p className="text-xs text-muted-foreground">이메일 발송 기능을 활성화합니다</p>
                </div>
                <Switch
                  checked={settings.smtp_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, smtp_enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">공사중 모드</p>
                  <p className="text-xs text-muted-foreground">사이트를 점검 모드로 전환합니다</p>
                </div>
                <Switch
                  checked={settings.maintenance_mode}
                  onCheckedChange={(checked) => setSettings({ ...settings, maintenance_mode: checked })}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── 저장 버튼 ── */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? '저장 중...' : '설정 저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}
