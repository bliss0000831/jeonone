'use client'

/**
 * 캐시 초기화 — 단순화 버전 (2026-04 audit, 옵션 E2)
 *
 * 이전엔 "페이지/이미지/데이터/브라우저" 4개 옵션 + 가짜 사이즈 표시였으나,
 * 실제로 작동하는 건 페이지 캐시(revalidatePath)와 브라우저 로컬 2개뿐이었음.
 * - 이미지 캐시: Vercel CDN 이 자동 관리, 외부에서 못 비움
 * - 데이터 캐시: fetch tags 붙은 곳 0건이라 revalidateTag 무효
 * - 가짜 사이즈 (12.4 MB 등) 하드코딩이라 거짓 정보
 *
 * 정직한 2개 옵션만 남기고, 가짜 사이즈/인공 지연 제거.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import {
  FileCode,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  HardDrive,
  AlertTriangle,
  Clock,
  XCircle,
} from 'lucide-react'

interface CacheOption {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  warning?: string
}

const cacheOptions: CacheOption[] = [
  {
    id: 'page',
    label: '사이트 페이지 캐시',
    description:
      '공지·배너·팝업 등 수정 후 즉시 반영하려면 사용하세요. 서버에서 모든 정적 페이지를 재생성합니다.',
    icon: <FileCode className="w-5 h-5" />,
  },
  {
    id: 'browser',
    label: '내 브라우저 로컬 저장소',
    description: 'localStorage / sessionStorage 데이터를 비웁니다.',
    icon: <HardDrive className="w-5 h-5" />,
    warning: '관리자 본인 브라우저에만 적용됩니다. 다른 유저에겐 영향 없음.',
  },
]

export default function CacheClearPage() {
  const [selected, setSelected] = useState<string[]>(['page'])
  const [clearing, setClearing] = useState(false)
  const [history, setHistory] = useState<
    { timestamp: string; items: string[]; status: 'success' | 'error' }[]
  >([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleClear = async () => {
    if (selected.length === 0) {
      setMessage({ type: 'error', text: '삭제할 캐시를 선택해주세요.' })
      return
    }
    if (!confirm(`선택한 ${selected.length}개 항목의 캐시를 삭제하시겠습니까?`)) return

    setClearing(true)
    setMessage(null)

    try {
      if (selected.includes('browser')) {
        try {
          localStorage.clear()
          sessionStorage.clear()
        } catch {}
      }

      if (selected.includes('page')) {
        const res = await fetch('/api/admin/cache-clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: ['page'] }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || '페이지 캐시 갱신 실패')
        }
      }

      const labels = selected
        .map((id) => cacheOptions.find((o) => o.id === id)?.label)
        .filter(Boolean) as string[]

      setHistory((prev) => [
        {
          timestamp: new Date().toLocaleString('ko-KR'),
          items: labels,
          status: 'success',
        },
        ...prev,
      ])

      setMessage({ type: 'success', text: '캐시가 성공적으로 갱신되었습니다.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || '캐시 삭제에 실패했습니다.' })
    } finally {
      setClearing(false)
    }
  }

  const handleReload = () => {
    if (confirm('페이지를 새로고침하시겠습니까?')) {
      window.location.reload()
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Trash2}
        title="캐시 초기화"
        description="사이트 캐시를 갱신하여 최신 데이터를 반영합니다."
      />

      {message && (
        <div
          className={cn(
            'p-4 rounded-xl flex items-center gap-2 text-sm',
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900'
              : 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900',
          )}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">삭제할 캐시 선택</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            삭제할 캐시 유형을 선택한 후 하단의 버튼을 눌러주세요.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {cacheOptions.map((option) => {
            const isSelected = selected.includes(option.id)
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggle(option.id)}
                className={cn(
                  'relative flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
                  'hover:shadow-sm',
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-transparent bg-muted/40 hover:bg-muted/70',
                )}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  </div>
                )}

                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-lg',
                    isSelected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {option.icon}
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium">{option.label}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {option.description}
                  </p>
                </div>

                {option.warning && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{option.warning}</span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={handleReload} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          페이지 새로고침
        </Button>
        <Button onClick={handleClear} disabled={clearing || selected.length === 0} className="gap-2">
          {clearing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          {clearing ? '갱신 중...' : `선택한 캐시 삭제 (${selected.length})`}
        </Button>
      </div>

      {history.length > 0 && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">초기화 기록</h2>
          </div>

          <div className="relative space-y-0">
            {history.map((h, i) => (
              <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {/* timeline line */}
                {i < history.length - 1 && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
                )}

                {/* timeline dot */}
                <div
                  className={cn(
                    'relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    h.status === 'success'
                      ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400'
                      : 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400',
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>

                {/* content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="text-sm font-medium truncate">{h.items.join(', ')}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{h.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
