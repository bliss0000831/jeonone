'use client'

import { useState, useEffect } from 'react'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Coins, Search, Plus, Minus, History, User } from 'lucide-react'
import { format } from 'date-fns/format'
import { ko } from 'date-fns/locale'
import { toast } from "sonner"

interface UserWithPoints {
  id: string
  nickname: string | null
  full_name: string | null
  email: string | null
  balance: number // from user_points.available
}

interface PointTransaction {
  id: string
  user_id: string
  amount: number
  type: string
  source: string
  status: string
  metadata: any
  created_at: string
  created_by?: string | null
}

export default function PointManagementPage() {
  const [users, setUsers] = useState<UserWithPoints[]>([])
  const [history, setHistory] = useState<PointTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserWithPoints | null>(null)
  const [pointModalOpen, setPointModalOpen] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [pointAction, setPointAction] = useState<'add' | 'subtract'>('add')
  const [pointAmount, setPointAmount] = useState('')
  const [pointReason, setPointReason] = useState('')
  const [processing, setProcessing] = useState(false)
  const [adminNames, setAdminNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      // 서버 API 를 통해 회원+잔액 조회 (service role — RLS 우회)
      const res = await fetch('/api/admin/points/members')
      if (res.ok) {
        const json = await res.json()
        const merged: UserWithPoints[] = (json.users ?? []).map((u: any) => ({
          id: u.id,
          nickname: u.nickname,
          full_name: u.full_name,
          email: null,
          balance: u.balance ?? 0,
        }))
        setUsers(merged)
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePointAction = async () => {
    if (!selectedUser || !pointAmount || parseInt(pointAmount) <= 0) {
      toast('포인트 금액을 입력해주세요.')
      return
    }
    // 차감은 비가역적 조치 — 확인
    if (pointAction === 'subtract' && !window.confirm(`${parseInt(pointAmount).toLocaleString()}P를 차감하시겠습니까?`)) return

    setProcessing(true)
    try {
      const plazaId = getCurrentPlazaClient()
      const rawAmount = parseInt(pointAmount)
      const amount = pointAction === 'subtract' ? -rawAmount : rawAmount

      const res = await fetch('/api/admin/points/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          plazaId,
          amount,
          reason: pointReason || (pointAction === 'add' ? '관리자 지급' : '관리자 차감'),
          type: pointAction === 'add' ? 'manual_adjust' : 'penalty',
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? '포인트 처리에 실패했습니다.')
        setProcessing(false)
        return
      }

      // 즉시 UI 반영 — API 응답의 newBalance 로 로컬 상태 업데이트
      if (selectedUser && json.newBalance !== undefined) {
        setUsers(prev => prev.map(u =>
          u.id === selectedUser.id ? { ...u, balance: json.newBalance } : u
        ))
      } else {
        // fallback: 전체 재조회
        await loadData()
      }

      toast.success(
        pointAction === 'add'
          ? `${rawAmount.toLocaleString()}P 지급 완료`
          : `${rawAmount.toLocaleString()}P 차감 완료`,
      )
      setPointModalOpen(false)
      setPointAmount('')
      setPointReason('')
      setSelectedUser(null)
    } catch (error) {
      console.error('포인트 처리 실패:', error)
      toast.error('포인트 처리에 실패했습니다.')
    } finally {
      setProcessing(false)
    }
  }

  const loadUserHistory = async (user: UserWithPoints) => {
    setSelectedUser(user)

    // 서버 API 로 내역 + 관리자 이름 조회 (service role)
    const res = await fetch(`/api/admin/points/history?userId=${user.id}`)
    if (res.ok) {
      const json = await res.json()
      setHistory((json.transactions || []) as PointTransaction[])

      // 관리자 이름 매핑 업데이트
      if (json.adminMap) {
        setAdminNames(prev => {
          const next = new Map(prev)
          for (const [id, name] of Object.entries(json.adminMap)) {
            next.set(id, name as string)
          }
          return next
        })
      }
    }

    setHistoryModalOpen(true)
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'manual_adjust': return '관리자 조정'
      case 'penalty': return '페널티 차감'
      case 'earn': return '적립'
      case 'spend': return '사용'
      case 'expire': return '만료'
      case 'revert': return '회수'
      case 'event': return '이벤트'
      default: return type
    }
  }

  const filteredUsers = users.filter((user) =>
    !searchQuery ||
    user.nickname?.includes(searchQuery) ||
    user.full_name?.includes(searchQuery)
  )

  const totalPoints = users.reduce((sum, u) => sum + (u.balance || 0), 0)

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Coins className="w-6 h-6 text-primary" />
          포인트 관리
        </h1>
        <p className="text-muted-foreground mt-1">회원 포인트를 관리합니다.</p>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{users.length.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">전체 회원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{totalPoints.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">총 활성 포인트</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{users.filter(u => (u.balance || 0) > 0).length}</p>
            <p className="text-sm text-muted-foreground">포인트 보유 회원</p>
          </CardContent>
        </Card>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="닉네임, 이름으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* 회원 포인트 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>회원 포인트 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredUsers.slice(0, 50).map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{user.nickname || user.full_name || '미설정'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-bold text-primary">{(user.balance || 0).toLocaleString()}P</p>
                  <Button variant="outline" size="sm" onClick={() => loadUserHistory(user)}>
                    <History className="w-4 h-4 mr-1" />
                    내역
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSelectedUser(user); setPointAction('add'); setPointModalOpen(true); }}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    지급
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSelectedUser(user); setPointAction('subtract'); setPointModalOpen(true); }}
                  >
                    <Minus className="w-4 h-4 mr-1" />
                    차감
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 포인트 지급/차감 모달 */}
      <Dialog open={pointModalOpen} onOpenChange={setPointModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pointAction === 'add' ? '포인트 지급' : '포인트 차감'}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">대상 회원</p>
                <p className="font-medium">{selectedUser.nickname || selectedUser.full_name}</p>
                <p className="text-sm">현재 포인트: <span className="font-bold text-primary">{(selectedUser.balance || 0).toLocaleString()}P</span></p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">
                  {pointAction === 'add' ? '지급' : '차감'}할 포인트
                </label>
                <Input
                  type="number"
                  value={pointAmount}
                  onChange={(e) => setPointAmount(e.target.value)}
                  placeholder="0"
                  min={1}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground">사유</label>
                <Textarea
                  value={pointReason}
                  onChange={(e) => setPointReason(e.target.value)}
                  placeholder={pointAction === 'add' ? '지급 사유를 입력하세요' : '차감 사유를 입력하세요'}
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPointModalOpen(false)}>취소</Button>
                <Button
                  onClick={handlePointAction}
                  disabled={processing}
                  className={pointAction === 'subtract' ? 'bg-red-600 hover:bg-red-700' : ''}
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  {pointAction === 'add' ? '지급하기' : '차감하기'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 포인트 내역 모달 */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedUser?.nickname || selectedUser?.full_name}님의 포인트 내역
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">포인트 내역이 없습니다.</p>
            ) : (
              history.map((h) => {
                const reason = h.metadata?.reason || h.metadata?.description || h.source
                const isCredit = h.type === 'earn' || h.type === 'manual_adjust' || h.type === 'event'
                const adminId = h.metadata?.admin_id || (h as any).created_by
                const adminName = adminId ? adminNames.get(adminId) : null
                const isAdminAction = h.type === 'manual_adjust' || h.type === 'penalty' || h.type === 'event'
                return (
                  <div key={h.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{reason || getTypeLabel(h.type)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(h.created_at), 'yyyy.MM.dd HH:mm', { locale: ko })}
                        </p>
                        {isAdminAction && adminName && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            처리: {adminName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className={`font-bold ${isCredit ? 'text-blue-600' : 'text-red-600'}`}>
                        {isCredit ? '+' : '-'}{h.amount.toLocaleString()}P
                      </p>
                      <p className="text-xs text-muted-foreground">{getTypeLabel(h.type)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
