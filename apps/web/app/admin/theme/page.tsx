'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Palette, Loader2, ChevronRight, RotateCcw, Check } from 'lucide-react'
import { toast } from "sonner"

interface ThemeColors {
  primary: string
  accent: string
}

const DEFAULT: ThemeColors = { primary: '#0ea5e9', accent: '#f59e0b' }

const PRESETS: { label: string; primary: string; accent: string }[] = [
  { label: '스카이블루 (기본)', primary: '#0ea5e9', accent: '#f59e0b' },
  { label: '딥블루', primary: '#1d4ed8', accent: '#f59e0b' },
  { label: '에메랄드', primary: '#10b981', accent: '#f59e0b' },
  { label: '바이올렛', primary: '#8b5cf6', accent: '#f59e0b' },
  { label: '로즈', primary: '#f43f5e', accent: '#0ea5e9' },
  { label: '슬레이트', primary: '#475569', accent: '#f59e0b' },
]

const SUB_PAGES = [
  { href: '/admin/theme/basic-info', label: '기본정보', desc: '회사명, 주소, 연락처 등' },
  { href: '/admin/theme/menu', label: '메뉴설정', desc: '홈페이지 상단 메뉴 관리' },
  { href: '/admin/theme/slider', label: '슬라이더관리', desc: '메인 슬라이더 이미지' },
  { href: '/admin/theme/footer', label: '푸터설정', desc: '푸터 문구 및 링크' },
]

const isValidHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())

export default function ThemeAdminPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [colors, setColors] = useState<ThemeColors>(DEFAULT)

  useEffect(() => {
    const load = async () => {
      const plaza = getCurrentPlazaClient()
      if (plaza) {
        const { data } = await supabase
          .from('plazas')
          .select('theme')
          .eq('id', plaza)
          .maybeSingle()
        const t = (data?.theme || {}) as any
        setColors({
          primary: t.primary || t.primaryColor || DEFAULT.primary,
          accent: t.accent || t.accentColor || DEFAULT.accent,
        })
      } else {
        // 허브 (super-admin 환경) — site_settings 글로벌
        const { data } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'hub_theme_colors')
          .maybeSingle()
        const parsed = data?.value
          ? typeof data.value === 'string'
            ? JSON.parse(data.value)
            : data.value
          : {}
        setColors({ ...DEFAULT, ...parsed })
      }
      setLoading(false)
    }
    load()
  }, [])

  const primaryValid = isValidHex(colors.primary)
  const accentValid = isValidHex(colors.accent)
  const canSave = primaryValid && accentValid

  const save = async () => {
    if (!canSave) {
      toast('HEX 색상 코드(#RRGGBB) 형식으로 입력해주세요.')
      return
    }
    setSaving(true)
    const plaza = getCurrentPlazaClient()
    let error: any = null
    if (plaza) {
      // 지역별 테마 — plazas.theme 에 병합 저장
      const { data: cur } = await supabase
        .from('plazas')
        .select('theme')
        .eq('id', plaza)
        .maybeSingle()
      const merged = {
        ...((cur?.theme as Record<string, any>) || {}),
        primary: colors.primary,
        primaryColor: colors.primary,  // 호환
        accent: colors.accent,
        accentColor: colors.accent,
      }
      const res = await supabase
        .from('plazas')
        .update({ theme: merged, updated_at: new Date().toISOString() })
        .eq('id', plaza)
      error = res.error
    } else {
      const res = await supabase.from('site_settings').upsert(
        {
          key: 'hub_theme_colors',
          value: JSON.stringify(colors),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )
      error = res.error
    }
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('저장되었습니다. 페이지를 새로고침하면 사이트 전반에 적용됩니다.')
    // 관리자 본인에게 즉시 반영
    window.location.reload()
  }

  const resetDefault = () => {
    if (!confirm('기본 테마 색상(스카이블루)으로 되돌릴까요?')) return
    setColors(DEFAULT)
  }

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
        title="테마관리"
        description="사이트 전반의 브랜드 색상을 HEX 코드로 한번에 변경합니다"
        icon={<Palette className="w-6 h-6" />}
      />

      <Card>
        <CardContent className="p-6 space-y-6">
          {/* 안내 */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-900/40 p-3 text-sm">
            <div className="font-semibold text-foreground mb-1">사용법</div>
            <ul className="text-muted-foreground leading-relaxed list-disc pl-4 space-y-0.5">
              <li>브라우저 색상 선택기나 <code className="px-1 rounded bg-white dark:bg-slate-800 text-[11px]">#0ea5e9</code> 같은 HEX 코드 직접 입력</li>
              <li>저장하면 <strong className="text-foreground">홈페이지 전체</strong>(버튼·링크·뱃지·카테고리 칩 등)에 즉시 반영</li>
              <li>기존 방문자는 페이지를 새로고침해야 새 색상이 보입니다</li>
            </ul>
          </div>

          {/* 색상 입력 — primary */}
          <div className="grid md:grid-cols-2 gap-6">
            <ColorField
              label="주요 색상 (Primary)"
              hint="버튼·링크·강조 요소 — 사이트 대표 색상"
              value={colors.primary}
              valid={primaryValid}
              onChange={(v) => setColors((p) => ({ ...p, primary: v }))}
            />
            <ColorField
              label="강조 색상 (Accent)"
              hint="포인트·알림·특수 강조용 (선택)"
              value={colors.accent}
              valid={accentValid}
              onChange={(v) => setColors((p) => ({ ...p, accent: v }))}
            />
          </div>

          {/* 프리셋 */}
          <div className="space-y-2">
            <Label className="text-sm">프리셋 — 클릭 한번으로 적용</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const selected = colors.primary.toLowerCase() === p.primary.toLowerCase()
                return (
                  <button
                    key={p.label}
                    onClick={() => setColors({ primary: p.primary, accent: p.accent })}
                    className={`group relative flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-medium transition-all ${
                      selected
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                        : 'border-border hover:border-primary/50 hover:bg-muted/40'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full ring-1 ring-black/10"
                      style={{ background: p.primary }}
                    />
                    <span>{p.label}</span>
                    {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 미리보기 */}
          <ThemePreview primary={colors.primary} accent={colors.accent} />

          {/* 액션 */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={resetDefault} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
              기본값으로
            </Button>
            <Button onClick={save} disabled={saving || !canSave} className="gap-2">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                '저장하고 사이트에 적용'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {SUB_PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.desc}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function ColorField({
  label,
  hint,
  value,
  valid,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  valid: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 rounded-lg border border-input bg-background cursor-pointer flex-shrink-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#0ea5e9"
          className={`font-mono text-sm ${!valid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        />
      </div>
      {!valid && (
        <p className="text-[11px] text-destructive">
          올바른 HEX 형식이 아닙니다 (예: #0ea5e9 또는 #0af)
        </p>
      )}
    </div>
  )
}

function ThemePreview({ primary, accent }: { primary: string; accent: string }) {
  const style = useMemo(
    () => ({ '--p': primary, '--a': accent } as React.CSSProperties),
    [primary, accent],
  )
  return (
    <div className="space-y-2">
      <Label className="text-sm">미리보기</Label>
      <div
        style={style}
        className="rounded-xl border border-border p-4 bg-gradient-to-br from-muted/20 to-background space-y-3"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <button
            style={{ background: 'var(--p)', color: '#fff' }}
            className="px-4 py-2 rounded-lg text-sm font-medium shadow-sm"
          >
            주요 버튼
          </button>
          <button
            style={{ borderColor: 'var(--p)', color: 'var(--p)' }}
            className="px-4 py-2 rounded-lg text-sm font-medium border bg-background"
          >
            보조 버튼
          </button>
          <span
            style={{ background: 'var(--p)', color: '#fff' }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
          >
            NEW
          </span>
          <span
            style={{ background: 'var(--a)', color: '#fff' }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
          >
            강조
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">링크 예시:</span>
          <span style={{ color: 'var(--p)' }} className="font-medium underline underline-offset-2">
            자세히 보기
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              style={{ background: 'var(--p)', width: '65%' }}
              className="h-full"
            />
          </div>
          <span className="text-xs text-muted-foreground">진행도 65%</span>
        </div>
      </div>
    </div>
  )
}
