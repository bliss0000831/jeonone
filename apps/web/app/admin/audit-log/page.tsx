'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminPageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  FileSearch, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  ChevronDown, User, Shield, Clock, Globe, Activity, Filter,
} from 'lucide-react'

interface AuditLog {
  id: string
  created_at: string
  actor_id: string | null
  plaza_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: any
  ip: string | null
  user_agent: string | null
}

const PAGE_SIZE = 50

const ACTION_COLORS: Record<string, string> = {
  ban_user: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-800',
  unban_user: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400 border-green-200 dark:border-green-800',
  force_signout: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  delete_post: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-800',
  approve_user: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  reject_user: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800',
}

const DEFAULT_ACTION_COLOR = 'bg-secondary text-secondary-foreground border-border'

function getActionColor(action: string) {
  return ACTION_COLORS[action] ?? DEFAULT_ACTION_COLOR
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(true)

  // 필터
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')

  // actor 이름 캐시 (id -> nickname/email)
  const [actorMap, setActorMap] = useState<Record<string, { nickname: string | null; email: string | null }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(offset))
      if (from) params.set('from', new Date(from).toISOString())
      if (to) params.set('to', new Date(to).toISOString())
      if (actor.trim()) params.set('actor', actor.trim())
      if (action.trim()) params.set('action', action.trim())

      const res = await fetch(`/api/admin/audit-log?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '조회 실패')
        setLogs([])
        return
      }
      setLogs(data.logs || [])
      setTotal(data.total || 0)

      // actor 정보 fetch
      const ids = Array.from(new Set((data.logs || []).map((l: AuditLog) => l.actor_id).filter(Boolean))) as string[]
      const missing = ids.filter((id) => !actorMap[id])
      if (missing.length > 0) {
        try {
          const sb = createClient()
          const { data: profs } = await sb
            .from('profiles')
            .select('id, nickname, email')
            .in('id', missing)
          if (profs) {
            const next = { ...actorMap }
            ;(profs as any[]).forEach((p) => {
              next[p.id] = { nickname: p.nickname, email: p.email }
            })
            setActorMap(next)
          }
        } catch {
          /* 무시 */
        }
      }
    } catch (e: any) {
      setError(e?.message || '조회 실패')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, from, to, actor, action])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset])

  const onSearch = () => {
    setOffset(0)
    load()
  }

  const onReset = () => {
    setFrom('')
    setTo('')
    setActor('')
    setAction('')
    setOffset(0)
    setTimeout(() => load(), 0)
  }

  const formatDate = (s: string) => new Date(s).toLocaleString('ko-KR')
  const formatActor = (id: string | null) => {
    if (!id) return '-'
    const a = actorMap[id]
    if (a) return a.nickname || a.email || id.slice(0, 8)
    return id.slice(0, 8) + '...'
  }
  const formatTarget = (l: AuditLog) => {
    if (!l.target_type && !l.target_id) return '-'
    return `${l.target_type || '?'}:${l.target_id ? l.target_id.slice(0, 8) : '?'}`
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Stats
  const uniqueActors = new Set(logs.map((l) => l.actor_id).filter(Boolean)).size
  const actionCounts: Record<string, number> = {}
  logs.forEach((l) => {
    actionCounts[l.action] = (actionCounts[l.action] || 0) + 1
  })
  const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        icon={FileSearch}
        title="감사 로그"
        description="관리자 활동 기록 (audit_log + admin_actions)"
        actions={
          <Button
            onClick={load}
            variant="outline"
            size="sm"
            disabled={loading}
            className="gap-2"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            새로고침
          </Button>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/50">
            <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">전체 로그</p>
            <p className="text-lg font-semibold">{total.toLocaleString()}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-950/50">
            <User className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">고유 행위자</p>
            <p className="text-lg font-semibold">{uniqueActors}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/50">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">최다 액션</p>
            <p className="text-lg font-semibold">
              {topAction ? topAction[0] : '-'}
              {topAction && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({topAction[1]}건)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-card">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center justify-between w-full px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="w-4 h-4 text-muted-foreground" />
            필터
            {(from || to || actor.trim() || action.trim()) && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                적용중
              </Badge>
            )}
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform duration-200',
              filtersOpen && 'rotate-180'
            )}
          />
        </button>
        {filtersOpen && (
          <div className="px-5 pb-5 border-t">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">시작 일시</Label>
                <Input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">종료 일시</Label>
                <Input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">actor (user_id)</Label>
                <Input
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="UUID"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">action</Label>
                <Input
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="ban_user, force_signout..."
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={onSearch} size="sm" disabled={loading} className="gap-1.5">
                <FileSearch className="w-3.5 h-3.5" />
                조회
              </Button>
              <Button onClick={onReset} variant="outline" size="sm" disabled={loading}>
                초기화
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Log entries */}
      <div className="space-y-2">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileSearch className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">기록이 없습니다</p>
          </div>
        ) : (
          logs.map((l) => {
            const isExpanded = expandedId === l.id
            return (
              <div
                key={l.id}
                className={cn(
                  'rounded-xl border bg-card transition-colors hover:bg-accent/40',
                  isExpanded && 'ring-1 ring-primary/20'
                )}
              >
                <button
                  type="button"
                  className="flex items-center gap-4 w-full px-4 py-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : l.id)}
                >
                  {/* Left: action badge + actor */}
                  <div className="flex items-center gap-3 min-w-0 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-mono text-[11px] px-2 py-0.5 border',
                        getActionColor(l.action)
                      )}
                    >
                      {l.action}
                    </Badge>
                    <div className="flex items-center gap-1.5 text-sm">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate max-w-[120px]">
                        {formatActor(l.actor_id)}
                      </span>
                    </div>
                  </div>

                  {/* Center: target */}
                  <div className="flex-1 min-w-0 text-sm text-muted-foreground truncate">
                    {formatTarget(l) !== '-' && (
                      <span className="font-mono text-xs bg-secondary/60 rounded px-1.5 py-0.5">
                        {formatTarget(l)}
                      </span>
                    )}
                  </div>

                  {/* Right: timestamp + IP + expand */}
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span className="whitespace-nowrap">{formatDate(l.created_at)}</span>
                    </div>
                    {l.ip && (
                      <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        <span className="font-mono">{l.ip}</span>
                      </div>
                    )}
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform duration-200',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </div>
                </button>

                {/* Expanded metadata */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Actor ID</span>
                        <p className="font-mono mt-0.5 break-all">{l.actor_id || '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Plaza ID</span>
                        <p className="font-mono mt-0.5 break-all">{l.plaza_id || '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target</span>
                        <p className="font-mono mt-0.5 break-all">
                          {l.target_type || '-'} / {l.target_id || '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">User Agent</span>
                        <p className="font-mono mt-0.5 break-all truncate">{l.user_agent || '-'}</p>
                      </div>
                    </div>
                    {l.metadata && (
                      <div className="mt-3">
                        <span className="text-xs text-muted-foreground">Metadata</span>
                        <pre className="mt-1 text-xs bg-secondary/40 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                          {JSON.stringify(l.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {total > 0
            ? `총 ${total.toLocaleString()}건 / ${page} / ${totalPages} 페이지`
            : ' '}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{page}</span>
            <span>/</span>
            <span>{totalPages}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="gap-1"
          >
            다음
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
