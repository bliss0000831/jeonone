'use client'

/**
 * 다중 관리자 관리 페이지.
 *
 * plaza_admins 테이블 기반으로 현재 광장의 관리자를 관리.
 * 회원 검색 → 역할 선택 → 관리자로 추가/제거.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Users, Trash2, Search, Loader2, UserPlus, RotateCcw } from 'lucide-react'
import {
  getRoleLabel,
  getRoleBadgeColor,
  type AdminRole,
} from '@/lib/services/admin-permissions'

const ASSIGNABLE_ROLES: AdminRole[] = ['owner', 'finance', 'content', 'support', 'viewer']

interface PlazaAdmin {
  user_id: string
  role: string
  nickname: string | null
  email: string | null
  created_at: string
}

export default function MultiAdminPage() {
  const [admins, setAdmins] = useState<PlazaAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [search, setSearch] = useState('')

  // 추가 다이얼로그
  const [addOpen, setAddOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [newRole, setNewRole] = useState<AdminRole>('viewer')
  const [adding, setAdding] = useState(false)

  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadAdmins = useCallback(async () => {
    if (!plaza) return
    setLoading(true)
    try {
      const { data: paRows } = await supabase
        .from('plaza_admins')
        .select('user_id, role, created_at')
        .eq('plaza_id', plaza)

      if (!paRows || paRows.length === 0) {
        setAdmins([])
        setLoading(false)
        return
      }

      const userIds = paRows.map((r: any) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nickname, email')
        .in('id', userIds)

      const profileMap = new Map<string, any>()
      for (const p of profiles || []) {
        profileMap.set((p as any).id, p)
      }

      const result: PlazaAdmin[] = paRows.map((r: any) => ({
        user_id: r.user_id,
        role: r.role,
        nickname: profileMap.get(r.user_id)?.nickname || null,
        email: profileMap.get(r.user_id)?.email || null,
        created_at: r.created_at,
      }))

      // super 역할을 맨 위에
      result.sort((a, b) => {
        const order: Record<string, number> = { super: 0, owner: 1, finance: 2, content: 3, support: 4, viewer: 5 }
        return (order[a.role] ?? 99) - (order[b.role] ?? 99)
      })

      setAdmins(result)
    } catch (e) {
      console.error('Failed to load admins:', e)
      setMessage({ type: 'error', text: '관리자 목록을 불러오지 못했습니다.' })
    } finally {
      setLoading(false)
    }
  }, [plaza])

  useEffect(() => { loadAdmins() }, [loadAdmins])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, email, avatar_url')
        .or(`nickname.ilike.%${searchQuery.trim()}%,email.ilike.%${searchQuery.trim()}%`)
        .limit(10)
      setSearchResults(data || [])
    } catch {
      setMessage({ type: 'error', text: '회원 검색에 실패했습니다.' })
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async () => {
    if (!selectedUser || !plaza) return
    setAdding(true)
    try {
      // 이미 존재하는지 확인
      const { data: existing } = await supabase
        .from('plaza_admins')
        .select('user_id')
        .eq('user_id', selectedUser.id)
        .eq('plaza_id', plaza)
        .maybeSingle()

      if (existing) {
        // 이미 존재하면 역할만 업데이트
        await supabase
          .from('plaza_admins')
          .update({ role: newRole })
          .eq('user_id', selectedUser.id)
          .eq('plaza_id', plaza)
      } else {
        await supabase
          .from('plaza_admins')
          .insert({
            user_id: selectedUser.id,
            plaza_id: plaza,
            role: newRole,
          })
      }

      setMessage({ type: 'success', text: `${selectedUser.nickname || '회원'}을(를) ${getRoleLabel(newRole)}로 추가했습니다.` })
      setAddOpen(false)
      setSearchQuery('')
      setSearchResults([])
      setSelectedUser(null)
      setNewRole('viewer')
      await loadAdmins()
    } catch (e: any) {
      setMessage({ type: 'error', text: `관리자 추가 실패: ${e?.message || '알 수 없는 오류'}` })
    } finally {
      setAdding(false)
    }
  }

  const handleRoleChange = async (userId: string, role: string) => {
    if (!plaza) return
    try {
      await supabase
        .from('plaza_admins')
        .update({ role })
        .eq('user_id', userId)
        .eq('plaza_id', plaza)
      setMessage({ type: 'success', text: '역할이 변경되었습니다.' })
      await loadAdmins()
    } catch {
      setMessage({ type: 'error', text: '역할 변경에 실패했습니다.' })
    }
  }

  const handleRemove = async (userId: string, nickname: string | null) => {
    if (!plaza) return
    if (!confirm(`${nickname || '이 관리자'}의 권한을 해제하시겠습니까?`)) return
    try {
      await supabase
        .from('plaza_admins')
        .delete()
        .eq('user_id', userId)
        .eq('plaza_id', plaza)
      setMessage({ type: 'success', text: '관리자 권한이 해제되었습니다.' })
      await loadAdmins()
    } catch {
      setMessage({ type: 'error', text: '권한 해제에 실패했습니다.' })
    }
  }

  const filtered = admins.filter((a) => {
    const q = search.toLowerCase()
    return !q || a.email?.toLowerCase().includes(q) || a.nickname?.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            다중 관리자 관리
          </h1>
          <p className="text-muted-foreground mt-1">
            이 광장의 관리자를 추가하고 역할을 설정합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadAdmins}>
            <RotateCcw className="w-4 h-4 mr-2" />
            새로고침
          </Button>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            관리자 추가
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>관리자 목록 ({admins.length}명)</span>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름/이메일 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">등록된 관리자가 없습니다</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>관리자</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>등록일</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((admin) => (
                  <TableRow key={admin.user_id}>
                    <TableCell className="font-medium">{admin.nickname || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{admin.email || '-'}</TableCell>
                    <TableCell>
                      {admin.role === 'super' ? (
                        <Badge className={getRoleBadgeColor(admin.role)}>{getRoleLabel(admin.role)}</Badge>
                      ) : (
                        <select
                          value={admin.role}
                          onChange={(e) => handleRoleChange(admin.user_id, e.target.value)}
                          className="text-sm rounded-md border border-border px-2 py-1 bg-background"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>{getRoleLabel(r)}</option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {admin.created_at ? new Date(admin.created_at).toLocaleDateString('ko-KR') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {admin.role !== 'super' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemove(admin.user_id, admin.nickname)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 관리자 추가 다이얼로그 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>관리자 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 회원 검색 */}
            <div className="flex gap-2">
              <Input
                placeholder="닉네임 또는 이메일로 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searching} size="sm">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {/* 검색 결과 */}
            {searchResults.length > 0 && (
              <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {searchResults.map((user: any) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUser(user)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
                      selectedUser?.id === user.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <div className="font-medium">{user.nickname || '이름 없음'}</div>
                    <div className="text-xs text-muted-foreground">{user.email || '-'}</div>
                  </button>
                ))}
              </div>
            )}

            {/* 선택된 회원 + 역할 */}
            {selectedUser && (
              <div className="p-3 rounded-lg border bg-accent/30">
                <div className="text-sm font-medium">{selectedUser.nickname}</div>
                <div className="text-xs text-muted-foreground">{selectedUser.email}</div>
                <div className="mt-2">
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as AdminRole)}
                    className="text-sm rounded-md border border-border px-2 py-1 bg-background w-full"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>{getRoleLabel(r)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={handleAdd} disabled={!selectedUser || adding}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
