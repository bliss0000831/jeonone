'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Shield, Loader2, ExternalLink, Check, X } from 'lucide-react'

interface PlazaAdminRow {
  user_id: string
  plaza_id: string
  role: string
}
interface ProfileLite {
  id: string
  nickname: string | null
  full_name: string | null
  email: string | null
  role: string | null
}
interface PlazaLite {
  id: string
  name: string
}

export default function AdminPermissionsMatrixPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [admins, setAdmins] = useState<ProfileLite[]>([])
  const [plazas, setPlazas] = useState<PlazaLite[]>([])
  const [rows, setRows] = useState<PlazaAdminRow[]>([])

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      try {
        const [paRes, plazasRes] = await Promise.all([
          supabase.from('plaza_admins').select('user_id, plaza_id, role'),
          supabase.from('plazas').select('id, name').order('name', { ascending: true }),
        ])
        if (paRes.error) throw paRes.error
        const paRows = (paRes.data || []) as PlazaAdminRow[]
        setRows(paRows)
        setPlazas(((plazasRes.data || []) as PlazaLite[]))

        const adminIds = Array.from(new Set(paRows.map((r) => r.user_id)))
        // legacy admin/superadmin 도 함께 표시
        const { data: legacy } = await supabase
          .from('profiles')
          .select('id, nickname, full_name, role')
          .in('role', ['admin', 'superadmin'])
        const legacyArr = (legacy || []) as ProfileLite[]
        const allIds = Array.from(new Set([...adminIds, ...legacyArr.map((l) => l.id)]))
        let profilesArr: ProfileLite[] = []
        if (allIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, nickname, full_name, role')
            .in('id', allIds)
          profilesArr = (profs || []) as ProfileLite[]
        }
        // 정렬: superadmin / super 우선
        profilesArr.sort((a, b) => {
          const pri = (r: string | null) => (r === 'superadmin' ? 0 : r === 'admin' ? 1 : 2)
          return pri(a.role) - pri(b.role)
        })
        setAdmins(profilesArr)
      } catch (e: any) {
        setError(e?.message || '로드 실패')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // 빠른 lookup
  const lookup = (userId: string, plazaId: string): string | null => {
    const r = rows.find((x) => x.user_id === userId && x.plaza_id === plazaId)
    return r ? r.role : null
  }

  const renderRoleCell = (role: string | null) => {
    if (!role) return <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
    const styles: Record<string, string> = {
      super: 'bg-purple-500 text-white',
      admin: 'bg-blue-500 text-white',
      manager: 'bg-emerald-500 text-white',
      staff: 'bg-gray-500 text-white',
    }
    return (
      <Badge className={`${styles[role] || 'bg-gray-400 text-white'} text-xs`}>
        {role}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            권한 매트릭스
          </h1>
          <p className="text-muted-foreground mt-1">
            관리자별 지역 권한을 한눈에 확인합니다 (읽기 전용).
          </p>
        </div>
        <Link href="/admin/settings/multi-admin">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="w-4 h-4" />
            다중 관리자 편집
          </Button>
        </Link>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">관리자 × 지역 × 역할</CardTitle>
          <CardDescription>plaza_admins 테이블 기준</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">관리자</TableHead>
                  <TableHead className="text-center">legacy role</TableHead>
                  {plazas.map((p) => (
                    <TableHead key={p.id} className="text-center whitespace-nowrap">
                      {p.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2 + plazas.length} className="text-center py-10 text-muted-foreground">
                      등록된 관리자가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  admins.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="sticky left-0 bg-card z-10">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">
                            {a.nickname || a.full_name || a.id.slice(0, 8)}
                          </span>
                          {a.email && (
                            <span className="text-xs text-muted-foreground">{a.email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {a.role === 'superadmin' ? (
                          <Badge className="bg-purple-500 text-white text-xs">superadmin</Badge>
                        ) : a.role === 'admin' ? (
                          <Badge className="bg-blue-500 text-white text-xs">admin</Badge>
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </TableCell>
                      {plazas.map((p) => (
                        <TableCell key={p.id} className="text-center">
                          {renderRoleCell(lookup(a.id, p.id))}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">역할 설명</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
              <Badge className="bg-purple-500 text-white text-xs mb-1">super</Badge>
              <p className="text-muted-foreground text-xs">전체 전원일기 / 모든 권한</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <Badge className="bg-blue-500 text-white text-xs mb-1">admin</Badge>
              <p className="text-muted-foreground text-xs">해당 전원일기 운영 전반</p>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
              <Badge className="bg-emerald-500 text-white text-xs mb-1">manager</Badge>
              <p className="text-muted-foreground text-xs">콘텐츠 / 모더레이션</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-950/20 rounded-lg">
              <Badge className="bg-gray-500 text-white text-xs mb-1">staff</Badge>
              <p className="text-muted-foreground text-xs">읽기 전용</p>
            </div>
          </div>
          <div className="mt-4 p-3 rounded-md bg-secondary/40 text-xs text-muted-foreground flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              권한 편집은 <Link href="/admin/settings/multi-admin" className="underline">설정 → 다중 관리자</Link> 에서 가능합니다.
              메뉴 단위 r/w/d 권한은 <Link href="/admin/settings/permissions" className="underline">설정 → 관리 권한</Link> 에서 설정하세요.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
