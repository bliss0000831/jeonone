'use client'

/**
 * 허브 배경 이미지 에디터 — 슈퍼 어드민 전용.
 *
 * 저장 위치: site_settings.hub_background
 * { image_url, overlay_opacity, overlay_color, position }
 */
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Upload, Loader2, RefreshCw, ImageIcon, Trash2, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

type OverlayColor = 'slate' | 'sky' | 'violet' | 'emerald' | 'rose'
type Position = 'top' | 'center' | 'bottom'

interface HubBackground {
  image_url?: string | null
  overlay_opacity?: number
  overlay_color?: OverlayColor
  position?: Position
}

interface Props {
  initial: HubBackground | null
}

const OVERLAY_COLORS: { value: OverlayColor; label: string; swatch: string }[] = [
  { value: 'slate', label: '어두운 회색', swatch: 'bg-slate-950' },
  { value: 'sky', label: '하늘', swatch: 'bg-sky-900' },
  { value: 'violet', label: '보라', swatch: 'bg-violet-950' },
  { value: 'emerald', label: '에메랄드', swatch: 'bg-emerald-950' },
  { value: 'rose', label: '로즈', swatch: 'bg-rose-950' },
]

const DEFAULTS: Required<HubBackground> = {
  image_url: null,
  overlay_opacity: 0.55,
  overlay_color: 'slate',
  position: 'center',
}

export function HubBackgroundEditor({ initial }: Props) {
  const [image_url, setImageUrl] = useState<string | null>(initial?.image_url ?? null)
  const [overlay_opacity, setOpacity] = useState<number>(initial?.overlay_opacity ?? 0.55)
  const [overlay_color, setColor] = useState<OverlayColor>(initial?.overlay_color ?? 'slate')
  const [position, setPosition] = useState<Position>(initial?.position ?? 'center')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? '업로드 실패')
      setImageUrl(data.url)
      toast.success('업로드 완료. 저장 버튼을 눌러야 적용됩니다.')
    } catch (e: any) {
      toast.error(e?.message ?? '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const value = { image_url, overlay_opacity, overlay_color, position }
      const res = await fetch('/api/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ key: 'hub_background', value }],
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        console.error('[hub-bg save] failed', json)
        throw new Error(json?.error ?? '저장 실패')
      }

      // verify 응답에서 실제 DB에 들어간 값 확인
      const saved = json?.verify?.hub_background
      const savedUrl = saved?.image_url ?? null
      if (savedUrl !== image_url) {
        console.warn('[hub-bg save] DB 저장값 불일치', { sent: image_url, saved: savedUrl })
        toast.warning(
          'DB 저장값이 보낸 값과 다릅니다. 권한/RLS 확인 필요.\n' +
            `보낸 값: ${image_url ?? '(없음)'}\n저장된 값: ${savedUrl ?? '(없음)'}`,
        )
        return
      }

      toast.success('저장 완료. 허브 페이지를 새 탭으로 열어 확인하세요.', {
        action: {
          label: '허브 열기',
          onClick: () => window.open('/', '_blank'),
        },
      })
    } catch (e: any) {
      toast.error(e?.message ?? '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setImageUrl(null)
    setOpacity(DEFAULTS.overlay_opacity)
    setColor(DEFAULTS.overlay_color)
    setPosition(DEFAULTS.position)
  }

  // 미리보기용 색상 클래스 (Tailwind safelist 의존)
  const overlayBgClass: Record<OverlayColor, string> = {
    slate: 'bg-slate-950',
    sky: 'bg-sky-900',
    violet: 'bg-violet-950',
    emerald: 'bg-emerald-950',
    rose: 'bg-rose-950',
  }

  return (
    <div className="space-y-6">
      {/* 미리보기 */}
      <section>
        <Label className="text-sm font-medium mb-2 inline-flex items-center gap-1.5">
          <Eye className="w-4 h-4" />
          미리보기
        </Label>
        <div className="relative h-72 rounded-xl overflow-hidden border border-border bg-slate-100 dark:bg-slate-900">
          {image_url ? (
            <div
              className="absolute inset-0 bg-cover"
              style={{
                backgroundImage: `url('${image_url}')`,
                backgroundPosition:
                  position === 'top' ? 'center top' : position === 'bottom' ? 'center bottom' : 'center center',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              이미지가 설정되지 않았습니다
            </div>
          )}
          <div
            className={cn('absolute inset-0', overlayBgClass[overlay_color])}
            style={{ opacity: overlay_opacity }}
          />
          {/* 샘플 글자 */}
          <div className="relative z-10 h-full flex flex-col items-start justify-end p-6">
            <p className="text-xs px-2 py-0.5 rounded-full bg-white/15 backdrop-blur text-white/90 mb-2">
              전국 전원일기 플랫폼
            </p>
            <h2
              className="text-3xl font-bold text-white"
              style={{ textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}
            >
              전원일기
            </h2>
            <p
              className="text-sm text-white/80 mt-1"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
            >
              지역별 부동산 · 생활정보 · 이웃 커뮤니티
            </p>
          </div>
        </div>
      </section>

      {/* 이미지 업로드 + URL */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          배경 이미지
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="gap-2"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            이미지 업로드
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
              if (fileRef.current) fileRef.current.value = ''
            }}
          />
          {image_url && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setImageUrl(null)}
              className="gap-2 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="w-4 h-4" />
              이미지 제거
            </Button>
          )}
        </div>

        <div>
          <Label htmlFor="image_url" className="text-xs text-muted-foreground">
            또는 URL 직접 입력
          </Label>
          <Input
            id="image_url"
            value={image_url ?? ''}
            onChange={(e) => setImageUrl(e.target.value || null)}
            placeholder="https://..."
          />
        </div>

        <div className="text-xs text-muted-foreground space-y-1.5">
          <p>
            <strong>화질 잘 나오는 가이드:</strong>
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              해상도 <strong>최소 2560×1440</strong> (4K 이상이면 더 좋음 — 큰 모니터에서도
              선명)
            </li>
            <li>형식 <strong>JPG (90% 품질) 또는 WebP</strong></li>
            <li>용량 <strong>500KB ~ 2MB</strong> 권장 (너무 작으면 압축 자국 보임)</li>
            <li>가로 비율 — 세로 사진은 잘려나가요</li>
            <li>
              무료 고화질 사진:{' '}
              <a
                href="https://unsplash.com"
                target="_blank"
                rel="noopener"
                className="underline hover:text-foreground"
              >
                Unsplash
              </a>
              {' · '}
              <a
                href="https://www.pexels.com"
                target="_blank"
                rel="noopener"
                className="underline hover:text-foreground"
              >
                Pexels
              </a>
            </li>
          </ul>
          <p className="pt-1 text-amber-700 dark:text-amber-400">
            ⚠️ 업로드 후 흐릿하게 보이면 → 원본 이미지 자체의 해상도가 낮을 가능성이 큽니다.
          </p>
        </div>
      </section>

      {/* 오버레이 색 */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-bold">가리는 색 (Overlay)</h2>
        <div className="grid grid-cols-5 gap-2">
          {OVERLAY_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 transition-all',
                overlay_color === c.value
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-primary/40',
              )}
            >
              <span className={cn('w-full h-8 rounded', c.swatch)} />
              <span className="text-xs">{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 어둡게 가리는 정도 */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">어둡게 가리는 정도</h2>
          <span className="text-sm font-mono">{Math.round(overlay_opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={overlay_opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>투명 (이미지 그대로)</span>
          <span>가운데</span>
          <span>어둡게 (텍스트 잘 보임)</span>
        </div>
      </section>

      {/* 이미지 위치 */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-bold">이미지 위치</h2>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'top' as const, label: '위' },
            { value: 'center' as const, label: '가운데' },
            { value: 'bottom' as const, label: '아래' },
          ]).map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPosition(p.value)}
              className={cn(
                'rounded-lg border-2 py-3 text-sm transition-all',
                position === p.value
                  ? 'border-primary bg-primary/5 font-semibold'
                  : 'border-border hover:border-primary/40',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* 저장 / 초기화 */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={reset} disabled={saving}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          기본값 복원
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          저장
        </Button>
      </div>
    </div>
  )
}
