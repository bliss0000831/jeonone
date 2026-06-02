'use client'

/**
 * 슈퍼 어드민 — Feature Flag 토글 UI.
 * PATCH /api/billing/feature-flags 호출.
 */
import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import type { FeatureFlag } from '@/lib/services/billing'

export function FeatureFlagsToggle({ initialFlags }: { initialFlags: FeatureFlag[] }) {
  const [flags, setFlags] = useState(initialFlags)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(key: string, enabled: boolean) {
    setBusy(key)
    try {
      const res = await fetch('/api/billing/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? '토글 실패')
        return
      }
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)))
      toast.success(`${key}: ${enabled ? 'ON' : 'OFF'}`)
    } catch (e: any) {
      toast.error(e?.message ?? '오류')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <div
          key={f.key}
          className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-mono font-medium">{f.key}</p>
            {f.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
            )}
          </div>
          <Switch
            checked={f.enabled}
            onCheckedChange={(v) => toggle(f.key, v)}
            disabled={busy === f.key}
          />
        </div>
      ))}
    </div>
  )
}
