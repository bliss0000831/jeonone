'use client'

/**
 * 회원 관리 — Pro Admin Design.
 *
 * 테이블 기반 레이아웃, 인라인 드롭다운, 깔끔한 통계 카드.
 * 서버 사이드 페이지네이션 + 디바운스 검색.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Search, Shield, Trash2, Users, Building2, User, Loader2, Clock,
  Phone, Wrench, MapPin, Store, MessageSquare, Send, Leaf, Download,
  Ban, ShieldOff, ChevronLeft, ChevronRight, MoreHorizontal, Eye,
  FileText, AlertTriangle, Coins, CheckCircle2, XCircle, Bell, BellOff,
  Mail, StickyNote, Pencil, Save, Circle,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { koreaRegions } from '@/lib/constants/korea-regions'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { cn } from '@/lib/utils'
import { toast } from "sonner"

const PAGE_SIZE = 50

interface UserProfile {
  id: string
  nickname: string | null
  full_name: string | null
  phone: string | null
  email?: string | null
  account_type: string | null
  role: string | null
  location: string | null
  created_at: string
  last_seen: string | null
  points: number | null
  is_verified_phone: boolean | null
  notif_marketing: boolean | null
  post_count: number
  report_count: number
  admin_memo: string | null
}

// 계정 유형 정의
const ACCOUNT_TYPES: Record<string, { label: string; color: string }> = {
  individual: { label: '일반', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  agent: { label: '중개사', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  business: { label: '사장님', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  producer: { label: '생산자', color: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  interior: { label: '인테리어', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  moving: { label: '이사', color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  cleaning: { label: '청소', color: 'bg-pink-50 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
  repair: { label: '수리', color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
}

export default function MembersPage() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [stats, setStats] = useState<{
    total: number; agents: number; business: number; producers: number; services: number; individuals: number
  } | null>(null)

  // 쪽지 관련
  const [messageModalOpen, setMessageModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [messageContent, setMessageContent] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  // 차단 관련
  const [banModalOpen, setBanModalOpen] = useState(false)
  const [banTarget, setBanTarget] = useState<UserProfile | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banScope, setBanScope] = useState<'suspend' | 'ban'>('suspend')
  const [banExpiresAt, setBanExpiresAt] = useState('')
  const [banSubmitting, setBanSubmitting] = useState(false)
  const [activeBans, setActiveBans] = useState<Record<string, boolean>>({})

  // 상세 모달
  const [detailUser, setDetailUser] = useState<UserProfile | null>(null)

  // 메모 모달
  const [memoModalOpen, setMemoModalOpen] = useState(false)
  const [memoTarget, setMemoTarget] = useState<UserProfile | null>(null)
  const [memoContent, setMemoContent] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)

  const supabase = createClient()

  const chuncheonDongs = koreaRegions
    .find(r => r.name === '강원특별자치도')
    ?.subRegions?.find(r => r.name === '춘천시')
    ?.subRegions || []

  // 디바운스
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(0)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  useEffect(() => {
    const loadCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profile) setCurrentUser(profile as any)
    }
    loadCurrentUser()
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || '회원 목록을 불러오지 못했습니다')
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
      setTotal(data.total ?? 0)
      if (data.stats) setStats(data.stats)

      const sub = getCurrentPlazaClient()
      const ids = (data.users || []).map((u: any) => u.id)
      if (sub && ids.length > 0) {
        try {
          const { data: banRows } = await supabase
            .from('user_bans')
            .select('user_id, expires_at, lifted_at')
            .eq('plaza_id', sub)
            .is('lifted_at', null)
            .in('user_id', ids)
          const now = Date.now()
          const map: Record<string, boolean> = {}
          ;(banRows || []).forEach((b: any) => {
            const active = !b.expires_at || new Date(b.expires_at).getTime() > now
            if (active) map[b.user_id] = true
          })
          setActiveBans(map)
        } catch {}
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('회원 목록을 불러오지 못했습니다. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── 권한 체크 ──
  const canModifyUser = (u: UserProfile) => {
    if (currentUser?.role === 'superadmin') return true
    if (u.role === 'superadmin') return false
    return true
  }

  // ── Actions ──
  const updateAccountType = async (userId: string, newType: string) => {
    const t = users.find(u => u.id === userId)
    if (t && !canModifyUser(t)) { toast.error('수정 권한이 없습니다.'); return }
    setActionLoading(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_type: newType })
      })
      if (!res.ok) throw new Error((await res.json()).error || '실패')
      setUsers(users.map(u => u.id === userId ? { ...u, account_type: newType } : u))
    } catch (e: any) {
      toast.error(e?.message || '변경 실패')
    } finally { setActionLoading(null) }
  }

  const updateRole = async (userId: string, newRole: string) => {
    if (currentUser?.role !== 'superadmin') { toast.error('슈퍼관리자만 가능'); return }
    setActionLoading(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })
      if (!res.ok) throw new Error((await res.json()).error || '실패')
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (e: any) {
      toast.error(e?.message || '변경 실패')
    } finally { setActionLoading(null) }
  }

  const updateLocation = async (userId: string, dong: string) => {
    const t = users.find(u => u.id === userId)
    if (t && !canModifyUser(t)) { toast.error('수정 권한이 없습니다.'); return }
    const newLocation = dong ? `강원특별자치도 춘천시 ${dong}` : null
    setActionLoading(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: newLocation })
      })
      if (!res.ok) throw new Error((await res.json()).error || '실패')
      setUsers(users.map(u => u.id === userId ? { ...u, location: newLocation } : u))
    } catch (e: any) {
      toast.error(e?.message || '변경 실패')
    } finally { setActionLoading(null) }
  }

  const deleteUser = async (userId: string) => {
    const t = users.find(u => u.id === userId)
    if (t && !canModifyUser(t)) { toast.error('삭제할 수 없습니다.'); return }
    if (userId === currentUser?.id) { toast.error('자신은 삭제 불가'); return }
    const label = t?.nickname || t?.full_name || t?.email || '이 회원'
    if (!confirm(`'${label}' 회원을 영구 삭제하시겠습니까?\n\n계정과 관련 데이터가 모두 삭제되며 되돌릴 수 없습니다.`)) return
    setActionLoading(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || '실패')
      await fetchUsers()
    } catch (e: any) {
      toast.error(e?.message || '삭제 실패')
    } finally { setActionLoading(null) }
  }

  const openBanModal = (u: UserProfile) => {
    setBanTarget(u); setBanReason(''); setBanScope('suspend'); setBanExpiresAt(''); setBanModalOpen(true)
  }
  const submitBan = async () => {
    if (!banTarget) return
    // 영구 차단은 사유 필수 — 처벌성 비가역 조치이므로 근거 기록 강제
    if (banScope === 'ban' && !banReason.trim()) {
      toast.error('영구 차단은 사유를 입력해야 합니다.')
      return
    }
    setBanSubmitting(true)
    try {
      const body: any = { scope: banScope }
      if (banReason.trim()) body.reason = banReason.trim()
      if (banExpiresAt) body.expires_at = new Date(banExpiresAt).toISOString()
      const res = await fetch(`/api/admin/users/${banTarget.id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { toast.error((await res.json()).error || '실패'); return }
      setActiveBans(prev => ({ ...prev, [banTarget.id]: true }))
      setBanModalOpen(false)
    } catch (e: any) { toast.error(e?.message || '실패') }
    finally { setBanSubmitting(false) }
  }
  const unbanUser = async (u: UserProfile) => {
    if (!confirm(`${u.nickname || '이 회원'}의 차단을 해제하시겠습니까?`)) return
    setActionLoading(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}/ban`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) { toast.error((await res.json()).error || '실패'); return }
      setActiveBans(prev => { const n = { ...prev }; delete n[u.id]; return n })
    } catch (e: any) { toast.error(e?.message || '실패') }
    finally { setActionLoading(null) }
  }
  const sendMessage = async () => {
    if (!selectedUser || !messageContent.trim()) return
    setSendingMessage(true)
    try {
      const res = await fetch('/api/admin/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: selectedUser.id, message: messageContent })
      })
      if (!res.ok) throw new Error((await res.json()).error || '실패')
      toast.success('전송되었습니다.')
      setMessageModalOpen(false); setMessageContent(''); setSelectedUser(null)
    } catch (e: any) { toast.error(e?.message || '전송 실패') }
    finally { setSendingMessage(false) }
  }

  const openMemoModal = (u: UserProfile) => {
    setMemoTarget(u); setMemoContent(u.admin_memo || ''); setMemoModalOpen(true)
  }
  const saveMemo = async () => {
    if (!memoTarget) return
    setMemoSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${memoTarget.id}/memo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo: memoContent }),
      })
      if (!res.ok) throw new Error((await res.json()).error || '실패')
      setUsers(users.map(u => u.id === memoTarget.id ? { ...u, admin_memo: memoContent.trim() || null } : u))
      setMemoModalOpen(false)
    } catch (e: any) { toast.error(e?.message || '저장 실패') }
    finally { setMemoSaving(false) }
  }

  // ── 유틸 ──
  const getUserStatus = (u: UserProfile): 'active' | 'dormant' => {
    if (!u.last_seen) return 'dormant'
    const diff = Date.now() - new Date(u.last_seen).getTime()
    return diff > 90 * 24 * 60 * 60 * 1000 ? 'dormant' : 'active' // 90일 이상 미접속 = 휴면
  }
  const formatDate = (d: string | null) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
  }
  const formatTime = (d: string | null) => {
    if (!d) return '접속 기록 없음'
    const date = new Date(d)
    const now = Date.now()
    const diff = now - date.getTime()
    if (diff < 60000) return '방금 전'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }
  const extractDong = (loc: string | null) => {
    if (!loc) return ''
    const parts = loc.split(' ')
    return parts.length >= 3 ? parts[2] : ''
  }
  const getType = (t: string | null) => ACCOUNT_TYPES[t || 'individual'] || ACCOUNT_TYPES.individual

  // ── CSV 내보내기 ──
  const exportCSV = () => {
    const rows = users.map(u => ({
      id: u.id, nickname: u.nickname ?? '', full_name: u.full_name ?? '',
      phone: u.phone ?? '', email: u.email ?? '', account_type: u.account_type ?? '',
      role: u.role ?? '', location: u.location ?? '', created_at: u.created_at,
      status: activeBans[u.id] ? '정지' : getUserStatus(u) === 'dormant' ? '휴면' : '활성',
      post_count: u.post_count ?? 0, report_count: u.report_count ?? 0,
      points: u.points ?? 0, is_verified_phone: u.is_verified_phone ? 'Y' : 'N',
      notif_marketing: u.notif_marketing ? 'Y' : 'N',
      admin_memo: u.admin_memo ?? '',
    }))
    const headers = Object.keys(rows[0] || { id: '' })
    const csv = headers.join(',') + '\n' + rows.map((r: any) =>
      headers.map(h => {
        const v = String(r[h] ?? '')
        return v.includes(',') || v.includes('\n') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
      }).join(',')
    ).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── 페이지 번호 윈도우 ──
  const windowed: (number | 'gap')[] = []
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) windowed.push(i)
  } else {
    windowed.push(0)
    let from = Math.max(1, page - 2), to = Math.min(totalPages - 2, page + 2)
    if (from > 1) windowed.push('gap')
    for (let i = from; i <= to; i++) windowed.push(i)
    if (to < totalPages - 2) windowed.push('gap')
    windowed.push(totalPages - 1)
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── 페이지 헤더 ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">회원 관리</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              전체 회원 목록을 조회하고 관리합니다
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 text-xs gap-1.5">
          <Download className="w-3.5 h-3.5" />
          CSV
        </Button>
      </div>

      {/* ── KPI 카드 ── */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: '전체', value: stats.total, icon: Users, color: 'text-foreground' },
            { label: '중개사', value: stats.agents, icon: Building2, color: 'text-blue-600' },
            { label: '사장님', value: stats.business, icon: Store, color: 'text-emerald-600' },
            { label: '생산자', value: stats.producers, icon: Leaf, color: 'text-green-600' },
            { label: '서비스', value: stats.services, icon: Wrench, color: 'text-orange-600' },
            { label: '일반', value: stats.individuals, icon: User, color: 'text-gray-500' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={cn('w-3.5 h-3.5', color)} />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 검색 ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
        <Input
          placeholder="이름, 닉네임, 전화번호..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-[13px] bg-muted/30 border-border/50 focus:bg-background"
        />
      </div>

      {/* ── 테이블 ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[
                  { label: '회원', hide: '' },
                  { label: '유형', hide: 'hidden sm:table-cell' },
                  { label: '이메일', hide: 'hidden md:table-cell' },
                  { label: '연락처', hide: 'hidden sm:table-cell' },
                  { label: '상태', hide: 'hidden lg:table-cell' },
                  { label: '지역', hide: 'hidden xl:table-cell' },
                  { label: '게시글', hide: 'hidden xl:table-cell' },
                  { label: '신고', hide: 'hidden xl:table-cell' },
                  { label: '포인트', hide: 'hidden xl:table-cell' },
                  { label: '메모', hide: 'hidden lg:table-cell' },
                  { label: '가입일', hide: 'hidden md:table-cell' },
                  { label: '최근 접속', hide: 'hidden xl:table-cell' },
                  { label: '', hide: 'text-right w-[120px]' },
                ].map((h, i) => (
                  <th key={i} className={cn(
                    'text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-3 py-2.5',
                    h.hide,
                  )}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={13} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-sm text-muted-foreground">
                    검색 결과가 없습니다
                  </td>
                </tr>
              )}
              {!loading && users.map(user => {
                const type = getType(user.account_type)
                const isProtected = !canModifyUser(user)
                const isBanned = activeBans[user.id]

                return (
                  <tr
                    key={user.id}
                    className={cn(
                      'border-b border-border/50 last:border-0 transition-colors hover:bg-accent/40',
                      isBanned && 'bg-red-50/50 dark:bg-red-950/20',
                    )}
                  >
                    {/* 회원 */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground shrink-0">
                          {(user.nickname || user.full_name || '?')[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium truncate">
                              {user.nickname || '닉네임 없음'}
                            </span>
                            {user.role === 'superadmin' && (
                              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px] px-1.5 py-0">
                                Super
                              </Badge>
                            )}
                            {user.role === 'admin' && (
                              <Badge className="bg-primary/10 text-primary text-[10px] px-1.5 py-0">
                                관리자
                              </Badge>
                            )}
                            {isBanned && (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px] px-1.5 py-0 gap-0.5">
                                <Ban className="w-2.5 h-2.5" />차단
                              </Badge>
                            )}
                          </div>
                          {user.full_name && (
                            <p className="text-[11px] text-muted-foreground/70 truncate">{user.full_name}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 유형 */}
                    <td className="px-3 py-3 hidden sm:table-cell">
                      <Select
                        value={user.account_type || 'individual'}
                        onValueChange={v => updateAccountType(user.id, v)}
                        disabled={isProtected || actionLoading === user.id}
                      >
                        <SelectTrigger className="h-7 w-[100px] text-[12px] border-0 bg-transparent hover:bg-muted/50 px-2">
                          <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium', type.color)}>
                            {type.label}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ACCOUNT_TYPES).map(([k, v]) => (
                            <SelectItem key={k} value={k} className="text-[12px]">{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* 이메일 */}
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className="text-[11px] text-muted-foreground truncate block max-w-[160px]">
                        {user.email || '-'}
                      </span>
                    </td>

                    {/* 연락처 */}
                    <td className="px-3 py-3 hidden sm:table-cell">
                      <span className="text-[12px] text-muted-foreground tabular-nums">
                        {user.phone || '-'}
                      </span>
                    </td>

                    {/* 상태 */}
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <div className="flex flex-col gap-1">
                        {isBanned ? (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px] px-1.5 py-0 w-fit">
                            정지
                          </Badge>
                        ) : getUserStatus(user) === 'dormant' ? (
                          <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 text-[10px] px-1.5 py-0 w-fit">
                            휴면
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] px-1.5 py-0 w-fit">
                            활성
                          </Badge>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span title="본인인증">
                            {user.is_verified_phone ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <XCircle className="w-3 h-3 text-muted-foreground/30" />
                            )}
                          </span>
                          <span title="마케팅 수신">
                            {user.notif_marketing ? (
                              <Bell className="w-3 h-3 text-blue-500" />
                            ) : (
                              <BellOff className="w-3 h-3 text-muted-foreground/30" />
                            )}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 지역 */}
                    <td className="px-3 py-3 hidden xl:table-cell">
                      <Select
                        value={extractDong(user.location) || 'none'}
                        onValueChange={v => updateLocation(user.id, v === 'none' ? '' : v)}
                        disabled={isProtected || actionLoading === user.id}
                      >
                        <SelectTrigger className="h-7 w-[90px] text-[12px] border-0 bg-transparent hover:bg-muted/50 px-2">
                          <span className="text-[12px] text-muted-foreground truncate">
                            {extractDong(user.location) || '미설정'}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-[12px]">미설정</SelectItem>
                          {chuncheonDongs.map(dong => (
                            <SelectItem key={dong.name} value={dong.name} className="text-[12px]">{dong.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* 게시글 */}
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className="text-[12px] tabular-nums text-muted-foreground">{user.post_count || 0}</span>
                    </td>

                    {/* 신고 */}
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {(user.report_count || 0) > 0 ? (
                        <span className={cn(
                          'inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded',
                          (user.report_count || 0) >= 3
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                        )}>
                          <AlertTriangle className="w-3 h-3" />
                          {user.report_count}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground/40">0</span>
                      )}
                    </td>

                    {/* 포인트 */}
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className="text-[12px] tabular-nums text-muted-foreground">
                        {(user.points || 0).toLocaleString()}
                      </span>
                    </td>

                    {/* 메모 */}
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {user.admin_memo ? (
                        <button
                          onClick={() => openMemoModal(user)}
                          className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline max-w-[100px] truncate"
                          title={user.admin_memo}
                        >
                          <StickyNote className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{user.admin_memo}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => openMemoModal(user)}
                          className="p-1 rounded hover:bg-muted/50 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                          title="메모 추가"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </td>

                    {/* 가입일 */}
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className="text-[12px] text-muted-foreground tabular-nums">{formatDate(user.created_at)}</span>
                    </td>

                    {/* 최근 접속 */}
                    <td className="px-3 py-3 hidden xl:table-cell">
                      <span className="text-[12px] text-muted-foreground">{formatTime(user.last_seen)}</span>
                    </td>

                    {/* 액션 */}
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* 쪽지 */}
                        <button
                          onClick={() => { setSelectedUser(user); setMessageModalOpen(true) }}
                          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="쪽지 보내기"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>

                        {/* 상세 */}
                        <button
                          onClick={() => setDetailUser(user)}
                          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="상세 정보"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* 차단/해제 */}
                        {user.id !== currentUser?.id && !isProtected && (
                          isBanned ? (
                            <button
                              onClick={() => unbanUser(user)}
                              disabled={actionLoading === user.id}
                              className="p-1.5 rounded-md hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors dark:hover:bg-red-950/30"
                              title="차단 해제"
                            >
                              <ShieldOff className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => openBanModal(user)}
                              disabled={actionLoading === user.id}
                              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                              title="차단"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}

                        {/* 삭제 */}
                        {user.id !== currentUser?.id && !isProtected && (
                          <button
                            onClick={() => deleteUser(user.id)}
                            disabled={actionLoading === user.id}
                            className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors dark:hover:bg-red-950/30"
                            title="삭제"
                          >
                            {actionLoading === user.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />
                            }
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 페이지네이션 ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[12px] text-muted-foreground/70 tabular-nums">
            {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()} / {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-0.5">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 w-7 p-0">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            {windowed.map((w, i) =>
              w === 'gap' ? (
                <span key={`gap-${i}`} className="px-0.5 text-[11px] text-muted-foreground/50">···</span>
              ) : (
                <button
                  key={w}
                  onClick={() => setPage(w)}
                  className={cn(
                    'h-7 min-w-[28px] px-1.5 text-[12px] rounded-md transition-colors',
                    w === page
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  {w + 1}
                </button>
              ),
            )}
            <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 w-7 p-0">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── 상세 모달 ── */}
      <Dialog open={!!detailUser} onOpenChange={o => !o && setDetailUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">회원 상세 정보</DialogTitle>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                  {(detailUser.nickname || detailUser.full_name || '?')[0]}
                </div>
                <div>
                  <p className="font-medium">{detailUser.nickname || '닉네임 없음'}</p>
                  <p className="text-xs text-muted-foreground">{detailUser.full_name}</p>
                </div>
              </div>
              {[
                ['ID', detailUser.id.slice(0, 12) + '...'],
                ['유형', getType(detailUser.account_type).label],
                ['연락처', detailUser.phone || '-'],
                ['이메일', detailUser.email || '-'],
                ['지역', detailUser.location || '미설정'],
                ['가입일', new Date(detailUser.created_at).toLocaleDateString('ko-KR')],
                ['최근 접속', formatTime(detailUser.last_seen)],
                ['권한', detailUser.role || 'user'],
                ['게시글 수', String(detailUser.post_count || 0)],
                ['신고 횟수', String(detailUser.report_count || 0)],
                ['포인트', (detailUser.points || 0).toLocaleString() + 'P'],
                ['본인인증', detailUser.is_verified_phone ? '✅ 인증 완료' : '❌ 미인증'],
                ['마케팅 수신', detailUser.notif_marketing ? '✅ 동의' : '❌ 거부'],
                ['상태', activeBans[detailUser.id] ? '🚫 정지' : getUserStatus(detailUser) === 'dormant' ? '💤 휴면' : '✅ 활성'],
                ['메모', detailUser.admin_memo || '-'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-[13px]">{label}</span>
                  <span className="text-[13px] font-medium max-w-[200px] truncate">{value}</span>
                </div>
              ))}

              {/* 슈퍼관리자: 역할 변경 */}
              {currentUser?.role === 'superadmin' && detailUser.id !== currentUser.id && (
                <div className="pt-2 border-t border-border">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">역할 변경</label>
                  <Select
                    value={detailUser.role || 'user'}
                    onValueChange={v => { updateRole(detailUser.id, v); setDetailUser({ ...detailUser, role: v }) }}
                  >
                    <SelectTrigger className="mt-1.5 h-8 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">일반</SelectItem>
                      <SelectItem value="admin">관리자</SelectItem>
                      <SelectItem value="superadmin">슈퍼관리자</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 차단 모달 ── */}
      <Dialog open={banModalOpen} onOpenChange={setBanModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              회원 차단 — {banTarget?.nickname || banTarget?.full_name}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              현재 지역에서만 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">범위</label>
              <Select value={banScope} onValueChange={v => setBanScope(v as 'suspend' | 'ban')}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="suspend">활동 정지</SelectItem>
                  <SelectItem value="ban">영구 차단</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">사유</label>
              <Textarea
                placeholder="차단 사유 (선택)"
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                rows={3}
                className="text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">만료 일시</label>
              <Input type="datetime-local" value={banExpiresAt} onChange={e => setBanExpiresAt(e.target.value)} className="h-9 text-[13px]" />
              <p className="text-[11px] text-muted-foreground">비워두면 무기한</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setBanModalOpen(false)}>취소</Button>
            <Button variant="destructive" size="sm" onClick={submitBan} disabled={banSubmitting} className="gap-1.5">
              {banSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              차단 적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 쪽지 모달 ── */}
      <Dialog open={messageModalOpen} onOpenChange={setMessageModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              쪽지 보내기 — {selectedUser?.nickname || selectedUser?.full_name}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              &quot;관리자&quot; 이름으로 전송됩니다. 답장 불가.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="메시지를 입력하세요..."
            value={messageContent}
            onChange={e => setMessageContent(e.target.value)}
            rows={5}
            className="text-[13px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setMessageModalOpen(false)}>취소</Button>
            <Button size="sm" onClick={sendMessage} disabled={!messageContent.trim() || sendingMessage} className="gap-1.5">
              {sendingMessage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              전송
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 메모 모달 ── */}
      <Dialog open={memoModalOpen} onOpenChange={setMemoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              관리자 메모 — {memoTarget?.nickname || memoTarget?.full_name || '회원'}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              이 메모는 관리자에게만 표시됩니다.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="회원에 대한 내부 메모를 작성하세요..."
            value={memoContent}
            onChange={e => setMemoContent(e.target.value)}
            rows={4}
            className="text-[13px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setMemoModalOpen(false)}>취소</Button>
            {memoContent.trim() !== (memoTarget?.admin_memo || '') && (
              <Button size="sm" onClick={saveMemo} disabled={memoSaving} className="gap-1.5">
                {memoSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                저장
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
