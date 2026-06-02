'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import {
  Loader2,
  Save,
  AlertTriangle,
  Wrench,
  Clock,
  Settings,
  MessageSquareText,
  Monitor,
  Mail,
} from 'lucide-react'

interface MaintenanceSettings {
  enabled: boolean
  title: string
  message: string
  start_at: string
  end_at: string
  allow_admin: boolean
  contact_email: string
}

export default function MaintenancePage() {
  const [settings, setSettings] = useState<MaintenanceSettings>({
    enabled: false,
    title: '사이트 점검 중',
    message: '더 나은 서비스 제공을 위해 시스템 점검을 진행하고 있습니다.\n잠시 후 다시 이용해 주시기 바랍니다.',
    start_at: '',
    end_at: '',
    allow_admin: true,
    contact_email: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.from('site_settings').select('key, value')
        if (data) {
          const map: any = {}
          data.forEach((item) => {
            try {
              map[item.key] =
                typeof item.value === 'string' ? JSON.parse(item.value) : item.value
            } catch {
              map[item.key] = item.value
            }
          })
          if (map.maintenance_settings && typeof map.maintenance_settings === 'object') {
            setSettings({ ...settings, ...map.maintenance_settings })
          } else if (typeof map.maintenance_mode === 'boolean') {
            setSettings((s) => ({ ...s, enabled: map.maintenance_mode }))
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: settings.enabled,
          settings,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) {
          setMessage({ type: 'error', text: data.error || '슈퍼관리자만 공사중 모드를 변경할 수 있습니다.' })
        } else {
          setMessage({ type: 'error', text: data.error || '설정 저장에 실패했습니다.' })
        }
        return
      }
      setMessage({ type: 'success', text: '공사중 설정이 저장되었습니다.' })
    } catch {
      setMessage({ type: 'error', text: '설정 저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="공사중 설정"
        description="사이트 점검 모드를 설정하여 방문자에게 안내 페이지를 표시합니다."
        icon={Wrench}
        badge={
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              settings.enabled
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            )}
          >
            {settings.enabled ? '활성' : '비활성'}
          </span>
        }
      />

      {message && (
        <div
          className={cn(
            'px-4 py-3 rounded-xl text-sm font-medium',
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
              : 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
          )}
        >
          {message.text}
        </div>
      )}

      {settings.enabled && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-900 dark:text-amber-300">
            <strong>공사중 모드가 활성화되어 있습니다.</strong>
            <br />
            현재 일반 방문자는 사이트를 이용할 수 없습니다.
          </div>
        </div>
      )}

      {/* Settings Section */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-6 py-4">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">공사중 모드</h2>
        </div>
        <div className="space-y-5 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">공사중 모드 활성화</p>
              <p className="text-[13px] text-muted-foreground">
                전체 사이트를 점검 페이지로 전환합니다.
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
            />
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">관리자 접속 허용</p>
              <p className="text-[13px] text-muted-foreground">
                공사중 모드에서도 관리자는 사이트에 접속할 수 있습니다.
              </p>
            </div>
            <Switch
              checked={settings.allow_admin}
              onCheckedChange={(checked) => setSettings({ ...settings, allow_admin: checked })}
            />
          </div>
        </div>
      </div>

      {/* Message Section */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-6 py-4">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">안내 메시지</h2>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid gap-2">
            <Label className="text-sm">제목</Label>
            <Input
              value={settings.title}
              onChange={(e) => setSettings({ ...settings, title: e.target.value })}
              placeholder="사이트 점검 중"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-sm">안내 내용</Label>
            <Textarea
              rows={6}
              value={settings.message}
              onChange={(e) => setSettings({ ...settings, message: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-sm flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              문의 이메일
            </Label>
            <Input
              type="email"
              placeholder="support@example.com"
              value={settings.contact_email}
              onChange={(e) => setSettings({ ...settings, contact_email: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Schedule Section */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-6 py-4">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">점검 일정</h2>
        </div>
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-sm">시작 일시</Label>
              <Input
                type="datetime-local"
                value={settings.start_at}
                onChange={(e) => setSettings({ ...settings, start_at: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-sm">종료 일시</Label>
              <Input
                type="datetime-local"
                value={settings.end_at}
                onChange={(e) => setSettings({ ...settings, end_at: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-6 py-4">
          <Monitor className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">미리보기</h2>
        </div>
        <div className="p-6">
          {/* Device frame */}
          <div className="mx-auto max-w-lg overflow-hidden rounded-xl border shadow-sm">
            {/* Browser chrome bar */}
            <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              </div>
              <div className="mx-auto h-5 w-48 rounded-md bg-background/80 border text-[10px] flex items-center justify-center text-muted-foreground">
                yoursite.com
              </div>
              <div className="w-[52px]" />
            </div>
            {/* Page content */}
            <div className="flex flex-col items-center gap-4 bg-background px-8 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Wrench className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold">{settings.title || '사이트 점검 중'}</h2>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                {settings.message}
              </p>
              {settings.contact_email && (
                <p className="text-xs text-muted-foreground">
                  문의: {settings.contact_email}
                </p>
              )}
              {(settings.start_at || settings.end_at) && (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {settings.start_at && new Date(settings.start_at).toLocaleString('ko-KR')}
                  {settings.end_at && ' ~ '}
                  {settings.end_at && new Date(settings.end_at).toLocaleString('ko-KR')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? '저장 중...' : '설정 저장'}
        </Button>
      </div>
    </div>
  )
}
