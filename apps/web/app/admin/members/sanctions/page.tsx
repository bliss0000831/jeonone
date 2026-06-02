'use client'

/**
 * 제재 관리 페이지 — 리메이크.
 *
 * 회원 검색/선택 → 제재 부여 (UUID 직접 입력 제거).
 * 기간 프리셋(1일/3일/7일/30일/영구) 제공.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Shield,
  Ban,
  AlertTriangle,
  Search,
  Loader2,
  Undo2,
  User,
  Clock,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type SanctionScope = 'suspend' | 'ban'

interface Sanction {
  id: string
  user_id: string
  nickname: string
  scope: SanctionScope
  reason: string
  starts_at: string
  expires_at: string | null
  lifted_at: string | null
  created_at: string
  active: boolean
}

interface MemberOption {
  id: string
  nickname: string | null
  full_name: string | null
  avatar_url: string | null
}


const scopeLabel: Record<SanctionScope, string> = {
  suspend: '활동정지',
  ban: '영구차단',
}

const DURATION_PRESETS = [
  { label: '1일', days: 1 },
  { label: '3일', days: 3 },
  { label: '7일', days: 7 },
  { label: '30일', days: 30 },
  { label: '직접 입력', days: -1 },
] as const

const REASON_PRESETS = [
  '욕설/비방',
  '스팸/광고',
  '허위 매물 등록',
  '사기 의심 행위',
  '개인정보 유출',
  '음란/불건전 콘텐츠',
  '반복적 규정 위반',
]


export default function MembersSanctionsPage() {
  const [loading, setLoading] = useState(true)
  const [sanctions, setSanctions] = useState<Sanction[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'lifted'>('all')

  // 제재 추가 모달
  const [addOpen, setAddOpen] = useState(false)
  const [scope, setScope] = useState<SanctionScope>('suspend')
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const [reason, setReason] = useState('')
  const [durationPreset, setDurationPreset] = useState<number>(7)
  const [customExpiry, setCustomExpiry] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 회원 검색
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<MemberOption[]>([])
  const [memberLoading, setMemberLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 해제
  const [liftingId, setLiftingId] = useState<string | null>(null)
  const [liftDialogOpen, setLiftDialogOpen] = useState(false)
  const [liftTarget, setLiftTarget] = useState<Sanction | null>(null)
  const [liftReason, setLiftReason] = useState('')

  // ─── 데이터 로드 ──────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sanctions')
      if (!res.ok) {
        setSanctions([])
        return
      }
      const { sanctions: list } = await res.json()
      setSanctions(list ?? [])
    } catch {
      setSanctions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ─── 회원 검색 (debounced) ──────────
  useEffect(() => {
    if (!memberSearch.trim()) {
      setMemberResults([])
      setShowDropdown(false)
      return
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setMemberLoading(true)
      try {
        const res = await fetch(`/api/admin/points/members?search=${encodeURIComponent(memberSearch)}`)
        if (res.ok) {
          const { users } = await res.json()
          setMemberResults((users ?? []).slice(0, 20))
          setShowDropdown(true)
        }
      } catch { /* ignore */ }
      finally { setMemberLoading(false) }
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [memberSearch])

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ─── 제재 부여 ──────────────────
  const handleAddSanction = async () => {
    if (!selectedMember || !reason.trim()) return
    setSubmitting(true)
    try {
      let expiresAt: string | null = null
      if (scope === 'suspend') {
        if (durationPreset === -1) {
          expiresAt = customExpiry || null
        } else {
          const d = new Date()
          d.setDate(d.getDate() + durationPreset)
          expiresAt = d.toISOString()
        }
      }

      const res = await fetch(`/api/admin/users/${selectedMember.id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          reason: reason.trim(),
          expires_at: expiresAt,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || '제재 부여에 실패했습니다')
        return
      }

      toast.success(`${selectedMember.nickname || selectedMember.full_name}님에게 ${scopeLabel[scope]}을(를) 부여했습니다`)
      resetAddForm()
      loadData()
    } catch {
      toast.error('제재 부여에 실패했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  const resetAddForm = () => {
    setAddOpen(false)
    setSelectedMember(null)
    setMemberSearch('')
    setMemberResults([])
    setScope('suspend')
    setReason('')
    setDurationPreset(7)
    setCustomExpiry('')
  }

  // ─── 제재 해제 ──────────────────
  const openLiftDialog = (s: Sanction) => {
    setLiftTarget(s)
    setLiftReason('')
    setLiftDialogOpen(true)
  }

  const handleLiftSanction = async () => {
    if (!liftTarget) return
    setLiftingId(liftTarget.user_id)
    try {
      const res = await fetch(`/api/admin/users/${liftTarget.user_id}/ban`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: liftReason || '관리자에 의한 해제' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || '해제에 실패했습니다')
        return
      }
      toast.success(`${liftTarget.nickname}님의 제재가 해제되었습니다`)
      setLiftDialogOpen(false)
      loadData()
    } catch {
      toast.error('해제에 실패했습니다')
    } finally {
      setLiftingId(null)
    }
  }

  // ─── 필터링 ──────────────────
  const activeSanctions = sanctions.filter(s => s.active)
  const suspensions = sanctions.filter(s => s.scope === 'suspend' && s.active).length
  const bans = sanctions.filter(s => s.scope === 'ban' && s.active).length

  const filtered = sanctions.filter(s => {
    // 상태 필터
    if (filterStatus === 'active' && !s.active) return false
    if (filterStatus === 'lifted' && s.active) return false
    // 텍스트 검색
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return s.nickname.toLowerCase().includes(q) || s.reason.toLowerCase().includes(q)
  })

  // ─── 날짜 포맷 ──────────────────
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  const getRemainingDays = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return '만료됨'
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return '오늘 만료'
    return `${days}일 남음`
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-500" />
            제재 관리
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            회원 활동정지/영구차단을 관리합니다.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-red-600 hover:bg-red-700">
          <Ban className="w-4 h-4 mr-1.5" />
          제재 부여
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:ring-2 ring-red-200 transition-all"
          onClick={() => setFilterStatus(filterStatus === 'active' ? 'all' : 'active')}>
          <CardContent className="p-4 text-center">
            <p className={cn('text-2xl font-bold', activeSanctions.length > 0 ? 'text-red-600' : '')}>
              {activeSanctions.length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">현재 제재 중</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={cn('text-2xl font-bold', suspensions > 0 ? 'text-orange-600' : '')}>
              {suspensions}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">활동정지</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={cn('text-2xl font-bold', bans > 0 ? 'text-red-600' : '')}>
              {bans}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">영구차단</p>
          </CardContent>
        </Card>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="회원명 또는 사유 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">제재 중</SelectItem>
            <SelectItem value="lifted">해제/만료</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 제재 목록 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Shield className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">
                {filterStatus === 'active' ? '현재 제재 중인 회원이 없습니다' :
                 filterStatus === 'lifted' ? '해제/만료된 제재가 없습니다' :
                 '제재 내역이 없습니다'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-4 hover:bg-accent/30 transition-colors">
                  {/* 아바타 + 이름 */}
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{s.nickname}</p>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] px-1.5 py-0',
                          s.scope === 'ban'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            : 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
                        )}
                      >
                        {scopeLabel[s.scope]}
                      </Badge>
                      {s.active ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300">
                          진행중
                        </Badge>
                      ) : s.lifted_at ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600">
                          해제됨
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600">
                          만료
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.reason}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span>{formatDate(s.starts_at)} 시작</span>
                      {s.expires_at ? (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {s.active ? getRemainingDays(s.expires_at) : formatDate(s.expires_at) + ' 만료'}
                        </span>
                      ) : (
                        <span className="text-red-500">무기한</span>
                      )}
                      {s.lifted_at && (
                        <span className="text-blue-600">{formatDate(s.lifted_at)} 해제</span>
                      )}
                    </div>
                  </div>

                  {/* 해제 버튼 */}
                  {s.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => openLiftDialog(s)}
                      disabled={liftingId === s.user_id}
                    >
                      {liftingId === s.user_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Undo2 className="w-4 h-4 mr-1" />
                      )}
                      해제
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 제재 부여 모달 ─── */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) resetAddForm(); else setAddOpen(true) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              제재 부여
            </DialogTitle>
            <DialogDescription>대상 회원을 검색하여 제재를 부여합니다.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 1. 회원 검색/선택 */}
            <div>
              <Label className="text-sm font-medium">대상 회원</Label>
              {selectedMember ? (
                <div className="mt-1.5 flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-9 h-9 rounded-full bg-background flex items-center justify-center border">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{selectedMember.nickname || selectedMember.full_name || '미설정'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{selectedMember.id}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs h-7"
                    onClick={() => { setSelectedMember(null); setMemberSearch('') }}>
                    변경
                  </Button>
                </div>
              ) : (
                <div className="relative mt-1.5" ref={dropdownRef}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="닉네임 또는 이름으로 검색..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    onFocus={() => { if (memberResults.length > 0) setShowDropdown(true) }}
                    className="pl-9"
                    autoFocus
                  />
                  {memberLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                  )}

                  {/* 검색 결과 드롭다운 */}
                  {showDropdown && memberResults.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
                      {memberResults.map((m) => (
                        <button
                          key={m.id}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent text-left transition-colors"
                          onClick={() => {
                            setSelectedMember(m)
                            setShowDropdown(false)
                            setMemberSearch('')
                          }}
                        >
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {m.nickname || m.full_name || '미설정'}
                            </p>
                            {m.full_name && m.nickname && (
                              <p className="text-[11px] text-muted-foreground truncate">{m.full_name}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {showDropdown && memberSearch.trim() && memberResults.length === 0 && !memberLoading && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg p-4 text-center text-sm text-muted-foreground">
                      검색 결과가 없습니다
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. 제재 유형 */}
            <div>
              <Label className="text-sm font-medium">제재 유형</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <button
                  className={cn(
                    'p-3 rounded-lg border text-left transition-all',
                    scope === 'suspend'
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20 ring-1 ring-orange-300'
                      : 'border-border hover:border-orange-200',
                  )}
                  onClick={() => setScope('suspend')}
                >
                  <AlertTriangle className="w-5 h-5 text-orange-500 mb-1" />
                  <p className="font-medium text-sm">활동정지</p>
                  <p className="text-[11px] text-muted-foreground">기간 제한 정지</p>
                </button>
                <button
                  className={cn(
                    'p-3 rounded-lg border text-left transition-all',
                    scope === 'ban'
                      ? 'border-red-400 bg-red-50 dark:bg-red-950/20 ring-1 ring-red-300'
                      : 'border-border hover:border-red-200',
                  )}
                  onClick={() => setScope('ban')}
                >
                  <Ban className="w-5 h-5 text-red-500 mb-1" />
                  <p className="font-medium text-sm">영구차단</p>
                  <p className="text-[11px] text-muted-foreground">복구 불가 차단</p>
                </button>
              </div>
            </div>

            {/* 3. 정지 기간 (활동정지일 때만) */}
            {scope === 'suspend' && (
              <div>
                <Label className="text-sm font-medium">정지 기간</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.days}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        durationPreset === p.days
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:border-primary/50',
                      )}
                      onClick={() => setDurationPreset(p.days)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {durationPreset === -1 && (
                  <Input
                    type="datetime-local"
                    value={customExpiry}
                    onChange={(e) => setCustomExpiry(e.target.value)}
                    className="mt-2"
                  />
                )}
              </div>
            )}

            {/* 4. 사유 */}
            <div>
              <Label className="text-sm font-medium">사유</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                {REASON_PRESETS.map((r) => (
                  <button
                    key={r}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[11px] border transition-all',
                      reason === r
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-primary/30',
                    )}
                    onClick={() => setReason(reason === r ? '' : r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="제재 사유를 입력하세요..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetAddForm}>취소</Button>
            <Button
              onClick={handleAddSanction}
              disabled={submitting || !selectedMember || !reason.trim()}
              className={scope === 'ban' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {scope === 'ban' ? '영구차단' : '활동정지'} 부여
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 해제 확인 모달 ─── */}
      <Dialog open={liftDialogOpen} onOpenChange={setLiftDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>제재 해제</DialogTitle>
            <DialogDescription>
              <strong>{liftTarget?.nickname}</strong>님의 {liftTarget ? scopeLabel[liftTarget.scope] : ''}을(를) 해제합니다.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-sm font-medium">해제 사유 (선택)</Label>
            <Textarea
              placeholder="해제 사유를 입력하세요..."
              value={liftReason}
              onChange={(e) => setLiftReason(e.target.value)}
              rows={2}
              className="mt-1.5"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLiftDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleLiftSanction}
              disabled={!!liftingId}
            >
              {liftingId && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              해제 확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
