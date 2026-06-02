'use client'

/**
 * 업자 탐지 플래그 검토 UI — 슈퍼 어드민용.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { UserFlag } from '@/lib/services/business-detection'

interface Props {
  flags: UserFlag[]
  profiles: Record<string, { id: string; nickname: string | null; phone: string | null }>
}

export function FlagsReviewClient({ flags, profiles }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function review(flagId: string, decision: UserFlag['status'], notes?: string) {
    setBusy(flagId)
    try {
      const res = await fetch('/api/admin/user-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagId, decision, notes }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? '처리 실패')
        return
      }
      toast.success('처리되었습니다.')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? '오류')
    } finally {
      setBusy(null)
    }
  }

  if (flags.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-6 text-sm text-muted-foreground text-center">
        검토할 플래그가 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {flags.map((f) => {
        const profile = profiles[f.user_id]
        const meta = f.metadata as any
        return (
          <div key={f.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <SeverityIcon severity={f.severity} />
                  <p className="font-bold text-sm">{profile?.nickname ?? f.user_id.slice(0, 8)}</p>
                  <SeverityBadge severity={f.severity} />
                </div>
                <p className="text-xs text-muted-foreground">{flagTypeLabel(f.flag_type)}</p>
              </div>
            </div>

            {/* metadata */}
            {f.flag_type === 'high_volume_posts' && meta && (
              <p className="text-xs text-muted-foreground mb-2">
                30일 내 <strong>{meta.post_count}건</strong> 등록 (임계값 {meta.threshold}건)
              </p>
            )}
            {profile?.phone && (
              <p className="text-[11px] text-muted-foreground mb-2">📱 {profile.phone}</p>
            )}

            {/* 액션 버튼들 */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy === f.id}
                onClick={() => review(f.id, 'reviewed_clear', '문제 없음으로 검토 완료')}
                className="h-7 text-xs"
              >
                문제 없음
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === f.id}
                onClick={() => review(f.id, 'reviewed_warning', '경고 발송')}
                className="h-7 text-xs"
              >
                경고
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy === f.id}
                onClick={() => review(f.id, 'reviewed_suspended', '업자 의심 계정 정지')}
                className="h-7 text-xs"
              >
                정지 (업자 차단)
              </Button>
              {busy === f.id && <Loader2 className="w-4 h-4 animate-spin self-center" />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function flagTypeLabel(t: UserFlag['flag_type']): string {
  switch (t) {
    case 'high_volume_posts': return '대량 등록 의심 (업자)'
    case 'duplicate_images': return '중복 이미지 다중 등록'
    case 'multi_account_ip': return '동일 IP 다계정'
    case 'manual_admin': return '관리자 수동 플래그'
    case 'reported_by_users': return '사용자 신고 누적'
  }
}

function SeverityBadge({ severity }: { severity: UserFlag['severity'] }) {
  const m: Record<string, string> = {
    low: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
    critical: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m[severity]}`}>
      {severity.toUpperCase()}
    </span>
  )
}

function SeverityIcon({ severity }: { severity: UserFlag['severity'] }) {
  const cls: Record<string, string> = {
    low: 'text-yellow-500',
    medium: 'text-amber-500',
    high: 'text-orange-500',
    critical: 'text-red-500',
  }
  return <AlertTriangle className={`w-3.5 h-3.5 ${cls[severity]}`} />
}
