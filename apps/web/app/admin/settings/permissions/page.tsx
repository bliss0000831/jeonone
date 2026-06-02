'use client'

/**
 * 관리자 역할별 권한 매트릭스 페이지.
 *
 * 새 역할 시스템: owner, finance, content, support, viewer
 * 각 역할이 어떤 메뉴에 접근 가능한지 매트릭스로 시각화.
 * owner만 이 페이지에서 관리자 역할을 변경할 수 있음.
 */
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'
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
import {
  Shield,
  Users,
  FileText,
  Settings,
  BarChart3,
  Loader2,
  Check,
  X,
  CreditCard,
  Megaphone,
  Headphones,
  LayoutDashboard,
  RotateCcw,
} from 'lucide-react'
import {
  hasPermission,
  getRoleLabel,
  getRoleBadgeColor,
  type AdminRole,
} from '@/lib/services/admin-permissions'

// 역할 목록 (레거시 제외)
const ROLES: AdminRole[] = ['owner', 'finance', 'content', 'support', 'viewer']

// 메뉴 카테고리
const MENU_CATEGORIES = [
  { key: 'dashboard',  label: '대시보드',    icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'members',    label: '회원 관리',    icon: <Users className="w-4 h-4" /> },
  { key: 'billing',    label: '결제·정산',    icon: <CreditCard className="w-4 h-4" /> },
  { key: 'content',    label: '콘텐츠',       icon: <FileText className="w-4 h-4" /> },
  { key: 'promotion',  label: '프로모션',     icon: <Megaphone className="w-4 h-4" /> },
  { key: 'support',    label: '고객센터',     icon: <Headphones className="w-4 h-4" /> },
  { key: 'stats',      label: '통계',         icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'settings',   label: '설정',         icon: <Settings className="w-4 h-4" /> },
]

interface PlazaAdmin {
  user_id: string
  role: string
  nickname: string | null
  email: string | null
}

export default function PermissionsPage() {
  const [loading, setLoading] = useState(true)
  const [admins, setAdmins] = useState<PlazaAdmin[]>([])
  const [updating, setUpdating] = useState<string | null>(null)
  const supabase = createClient()
  const plaza = getCurrentPlazaClient()

  const loadAdmins = useCallback(async () => {
    if (!plaza) return
    setLoading(true)
    try {
      const { data: paRows } = await supabase
        .from('plaza_admins')
        .select('user_id, role')
        .eq('plaza_id', plaza)

      if (!paRows || paRows.length === 0) {
        setAdmins([])
        setLoading(false)
        return
      }

      // 프로필 정보 fetch
      const userIds = paRows.map((r: any) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nickname, email')
        .in('id', userIds)

      const profileMap = new Map<string, { nickname: string | null; email: string | null }>()
      for (const p of profiles || []) {
        profileMap.set((p as any).id, { nickname: (p as any).nickname, email: (p as any).email })
      }

      const result: PlazaAdmin[] = paRows.map((r: any) => ({
        user_id: r.user_id,
        role: r.role,
        nickname: profileMap.get(r.user_id)?.nickname || null,
        email: profileMap.get(r.user_id)?.email || null,
      }))

      setAdmins(result)
    } catch (e) {
      console.error('Failed to load admins:', e)
    } finally {
      setLoading(false)
    }
  }, [plaza])

  useEffect(() => { loadAdmins() }, [loadAdmins])

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!plaza) return
    setUpdating(userId)
    try {
      await supabase
        .from('plaza_admins')
        .update({ role: newRole })
        .eq('user_id', userId)
        .eq('plaza_id', plaza)
      await loadAdmins()
    } catch (e) {
      console.error('Failed to update role:', e)
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            관리자 권한 설정
          </h1>
          <p className="text-muted-foreground mt-1">
            역할별 접근 권한 매트릭스 및 관리자 역할 변경
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAdmins}>
          <RotateCcw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>

      {/* 역할별 권한 매트릭스 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">역할별 접근 권한 매트릭스</CardTitle>
          <CardDescription>각 역할이 접근 가능한 메뉴를 확인할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px] sticky left-0 bg-background z-10">메뉴</TableHead>
                  {ROLES.map((role) => (
                    <TableHead key={role} className="text-center min-w-[100px]">
                      <Badge className={getRoleBadgeColor(role)}>{getRoleLabel(role)}</Badge>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MENU_CATEGORIES.map((menu) => (
                  <TableRow key={menu.key}>
                    <TableCell className="sticky left-0 bg-background z-10">
                      <div className="flex items-center gap-2">
                        {menu.icon}
                        <span className="font-medium">{menu.label}</span>
                      </div>
                    </TableCell>
                    {ROLES.map((role) => {
                      const allowed = hasPermission(role, menu.key)
                      return (
                        <TableCell key={role} className="text-center">
                          {allowed ? (
                            <Check className="w-4 h-4 text-green-600 mx-auto" />
                          ) : (
                            <X className="w-4 h-4 text-gray-300 mx-auto" />
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 현재 광장 관리자 목록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">현재 광장 관리자</CardTitle>
          <CardDescription>관리자의 역할을 변경하려면 셀렉트박스를 사용하세요</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {admins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">등록된 관리자가 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>관리자</TableHead>
                    <TableHead>이메일</TableHead>
                    <TableHead>현재 역할</TableHead>
                    <TableHead>역할 변경</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((admin) => (
                    <TableRow key={admin.user_id}>
                      <TableCell className="font-medium">{admin.nickname || '이름 없음'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{admin.email || '-'}</TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(admin.role)}>
                          {getRoleLabel(admin.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {admin.role === 'super' ? (
                          <span className="text-xs text-muted-foreground">변경 불가</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              value={admin.role}
                              onChange={(e) => handleRoleChange(admin.user_id, e.target.value)}
                              disabled={updating === admin.user_id}
                              className="text-sm rounded-md border border-border px-2 py-1 bg-background"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>{getRoleLabel(r)}</option>
                              ))}
                            </select>
                            {updating === admin.user_id && (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 역할 설명 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">역할 안내</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {ROLES.map((role) => {
              const descriptions: Record<string, string> = {
                owner: '모든 메뉴 접근 + 다른 관리자 관리 + 설정 변경',
                finance: '대시보드(결제), 결제/정산, 매출통계, 프로모션',
                content: '대시보드(콘텐츠), 콘텐츠 관리, 프로모션, 통계',
                support: '대시보드(문의), 고객센터, 회원 기본 조회',
                viewer: '대시보드, 통계 (읽기 전용)',
              }
              return (
                <div key={role} className="p-3 rounded-lg border">
                  <Badge className={getRoleBadgeColor(role)}>{getRoleLabel(role)}</Badge>
                  <p className="text-xs text-muted-foreground mt-2">{descriptions[role]}</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
