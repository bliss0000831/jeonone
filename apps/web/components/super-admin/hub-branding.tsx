'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import NextImage from 'next/image'
import { Loader2, Save, Image as ImageIcon, Upload, X, Palette } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const PRESETS = [
  { label: '스카이블루', primary: '#0ea5e9', accent: '#f59e0b' },
  { label: '딥블루', primary: '#1d4ed8', accent: '#f59e0b' },
  { label: '에메랄드', primary: '#10b981', accent: '#f59e0b' },
  { label: '바이올렛', primary: '#8b5cf6', accent: '#f59e0b' },
  { label: '로즈', primary: '#f43f5e', accent: '#0ea5e9' },
  { label: '슬레이트', primary: '#475569', accent: '#f59e0b' },
]

const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())

/**
 * 허브 (gwangjang.app) 의 테마/로고/사이트명 편집.
 * 슈퍼 관리자만 접근 — site_settings 의 hub_* 키에 저장.
 * 광장 도메인 settings 와 격리.
 */
export function SuperAdminHubBranding() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [primary, setPrimary] = useState('#0ea5e9')
  const [accent, setAccent] = useState('#f59e0b')
  const [logo, setLogo] = useState('/logo.png?v=3')
  const [siteName, setSiteName] = useState('전국 광장')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['hub_theme_colors', 'hub_logo', 'hub_site_name'])
      data?.forEach((row: any) => {
        const parsed = typeof row.value === 'string'
          ? (() => { try { return JSON.parse(row.value) } catch { return row.value } })()
          : row.value
        if (row.key === 'hub_theme_colors' && parsed && typeof parsed === 'object') {
          if (parsed.primary && isHex(parsed.primary)) setPrimary(parsed.primary)
          if (parsed.accent && isHex(parsed.accent)) setAccent(parsed.accent)
        } else if (row.key === 'hub_logo' && typeof parsed === 'string' && parsed) {
          setLogo(parsed)
        } else if (row.key === 'hub_site_name' && typeof parsed === 'string' && parsed) {
          setSiteName(parsed)
        }
      })
      setLoading(false)
    }
    load()
  }, [])

  const uploadLogo = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast('이미지만 업로드 가능')
    if (file.size > 5 * 1024 * 1024) return toast('5MB 이하 파일만')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'hub-branding')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || '업로드 실패')
      }
      const { url } = await res.json()
      setLogo(url)
    } catch (err: any) {
      toast.error(err?.message || '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!isHex(primary) || !isHex(accent)) {
      return toast('HEX 형식 (#RRGGBB) 으로 입력해주세요')
    }
    setSaving(true)
    try {
      const res = await fetch('/api/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [
            { key: 'hub_theme_colors', value: { primary, accent } },
            { key: 'hub_logo', value: logo },
            { key: 'hub_site_name', value: siteName },
          ],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      toast.success('저장됐습니다')
      // RSC 캐시 무효화 — 새로고침 없이 즉시 반영
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-amber-600 dark:text-amber-400" />
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">허브 브랜딩</h2>
        <span className="text-xs text-gray-500 dark:text-gray-500">gwangjang.app 전용</span>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-5">
        {/* 사이트 이름 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">사이트 이름 (탭/SEO)</label>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="전국 광장"
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
          />
        </div>

        {/* 로고 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">로고</label>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
              {logo ? (
                <NextImage src={logo} alt="logo" width={56} height={56} className="w-full h-full object-contain" unoptimized />
              ) : (
                <ImageIcon className="w-5 h-5 text-gray-500 dark:text-gray-500" />
              )}
            </div>
            <div className="flex-1 flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100 transition disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                업로드
              </button>
              <button
                type="button"
                onClick={() => setLogo('/logo.png?v=3')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100 transition"
              >
                <X className="w-3.5 h-3.5" />
                기본값
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadLogo(f)
                  e.currentTarget.value = ''
                }}
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1.5 break-all">{logo}</p>
        </div>

        {/* 색상 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">주요 색상 (Primary)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isHex(primary) ? primary : '#0ea5e9'}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-9 w-12 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-pointer"
              />
              <input
                type="text"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">강조 색상 (Accent)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isHex(accent) ? accent : '#f59e0b'}
                onChange={(e) => setAccent(e.target.value)}
                className="h-9 w-12 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-pointer"
              />
              <input
                type="text"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
          </div>
        </div>

        {/* 프리셋 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">프리셋</label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const selected = primary.toLowerCase() === p.primary.toLowerCase()
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setPrimary(p.primary); setAccent(p.accent) }}
                  className={
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition ' +
                    (selected
                      ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:border-gray-600 text-gray-700 dark:text-gray-300')
                  }
                >
                  <span className="w-3 h-3 rounded-full" style={{ background: p.primary }} />
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 미리보기 */}
        <div className="rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-950 p-4">
          <p className="text-[10px] text-gray-500 dark:text-gray-500 mb-2 uppercase tracking-wide">미리보기</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              style={{ background: primary, color: '#fff' }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
            >
              주요 버튼
            </button>
            <button
              type="button"
              style={{ borderColor: primary, color: primary }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white dark:bg-gray-900"
            >
              보조 버튼
            </button>
            <span
              style={{ background: accent, color: '#fff' }}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            >
              강조
            </span>
          </div>
        </div>

        {/* 저장 */}
        <div className="flex items-center justify-end pt-2 border-t border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            허브에 적용
          </button>
        </div>
      </div>
    </section>
  )
}
