/**
 * 슈퍼 어드민 — 지역 협회 관리.
 *
 * 각 지역의 운영 사업자(협회) 등록, 승인, 통장 정보 관리.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  verifySuperAdminToken,
  SUPER_ADMIN_COOKIE,
} from '@/lib/services/super-admin'
import type { PlazaAssociation } from '@/lib/services/billing'

export const dynamic = 'force-dynamic'

export default async function PlazaAssociationsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value
  const authed = await verifySuperAdminToken(token)
  if (!authed) redirect('/super-admin')

  const supabase = await createClient()
  const [associationsRes, plazasRes] = await Promise.all([
    supabase.from('plaza_associations').select('*').order('created_at', { ascending: false }),
    supabase.from('plazas').select('id, name, is_active'),
  ])

  const associations = (associationsRes.data ?? []) as PlazaAssociation[]
  const plazas = plazasRes.data ?? []
  const plazaNameById = new Map(plazas.map((p: any) => [p.id, p.name]))

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">지역 협회 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              각 지역의 운영 사업자 (별개 사업자등록). 본사와 분리된 회계 / 통장.
            </p>
          </div>
          <Link href="/super-admin/billing" className="text-sm text-muted-foreground">
            ← 결제 대시보드
          </Link>
        </div>

        {associations.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">등록된 지역 협회가 없습니다.</p>
            <p className="text-xs text-muted-foreground">
              협회는 API <code className="px-1 py-0.5 bg-muted rounded">POST /api/billing/plaza-associations</code> 로 등록합니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {associations.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-bold">{a.business_name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {plazaNameById.get(a.plaza_id) ?? a.plaza_id} · 사업자번호 {a.business_number} · 대표 {a.ceo_name}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-3">
                  <Info label="은행" value={a.bank_name} />
                  <Info label="계좌" value={a.bank_account} />
                  <Info label="예금주" value={a.bank_holder} />
                  <Info label="본사 수수료" value={`${Number(a.royalty_rate).toFixed(0)}%`} />
                </div>
                <div className="mt-3 flex gap-2 text-xs">
                  <span className="text-muted-foreground">{a.contact_email}</span>
                  {a.contact_phone && (
                    <span className="text-muted-foreground">· {a.contact_phone}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 등록 가이드 */}
        <div className="mt-8 rounded-lg border border-border bg-muted/20 p-5">
          <h2 className="font-bold mb-2">협회 가입 절차</h2>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
            <li>협회로부터 사업자등록증 + 통장사본 + 대표자 정보 수령</li>
            <li>본 페이지 또는 API 로 등록 (status=&apos;pending&apos;)</li>
            <li>본사 검수 후 승인 (status=&apos;active&apos;)</li>
            <li>해당 지역에서 발생한 매출의 80%가 자동 정산 대상이 됨</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: PlazaAssociation['status'] }) {
  const m: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    suspended: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
    terminated: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300',
  }
  const label: Record<string, string> = {
    pending: '검수 대기',
    active: '활성',
    suspended: '정지',
    terminated: '종료',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${m[status] ?? ''}`}>
      {label[status] ?? status}
    </span>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? '-'}</p>
    </div>
  )
}
