'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LogOut, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from "sonner"

interface SessionUser {
  id: string
  email: string | null
  last_sign_in_at: string | null
  created_at: string | null
  confirmed_at: string | null
  banned_until: string | null
}

export default function AdminSessionsPage() {
  const [users, setUsers] = useState<SessionUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sessions?limit=100', { cache: 'no-store' })
      const data = await res.json()
      if (res.status === 403) {
        setForbidden(true)
        setUsers([])
        return
      }
      if (!res.ok) {
        setError(data.error || '조회 실패')
        setUsers([])
        return
      }
      setUsers(data.users || [])
    } catch (e: any) {
      setError(e?.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const forceSignOut = async (u: SessionUser) => {
    if (!confirm(`${u.email || u.id} 의 모든 세션을 강제 종료하시겠습니까?`)) return
    setActing(u.id)
    try {
      const res = await fetch('/api/admin/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: u.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '실패')
        return
      }
      toast.success('강제 로그아웃 완료')
    } catch (e: any) {
      toast.error(e?.message || '실패')
    } finally {
      setActing(null)
    }
  }

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR') : '-')

  if (forbidden) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" />
            권한 없음
          </h1>
          <p className="text-muted-foreground mt-1">이 페이지는 슈퍼관리자만 접근할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LogOut className="w-6 h-6 text-primary" />
            사용자 세션
          </h1>
          <p className="text-muted-foreground mt-1">
            최근 로그인한 사용자 목록과 강제 로그아웃 기능을 제공합니다 (super 전용).
          </p>
        </div>
        <Button onClick={load} variant="outline" disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          새로고침
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 활동 사용자 ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="whitespace-nowrap">최근 로그인</TableHead>
                  <TableHead className="whitespace-nowrap">가입일</TableHead>
                  <TableHead className="whitespace-nowrap">상태</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin inline-block" />
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      활동 사용자가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm">{u.email || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmt(u.last_sign_in_at)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmt(u.created_at)}</TableCell>
                      <TableCell>
                        {u.banned_until ? (
                          <Badge className="bg-red-500 text-white text-xs">차단</Badge>
                        ) : u.confirmed_at ? (
                          <Badge className="bg-emerald-500 text-white text-xs">활성</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">미확인</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => forceSignOut(u)}
                          disabled={acting === u.id}
                          className="gap-1 h-8 text-xs border-red-300 text-red-600 hover:bg-red-50"
                        >
                          {acting === u.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <LogOut className="w-3 h-3" />
                          )}
                          강제 로그아웃
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
