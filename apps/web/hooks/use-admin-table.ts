'use client'

/**
 * 관리자 리스트 페이지용 페이지네이션 + DB 검색 훅 (2026-04 audit, #8).
 *
 * 이전엔 `select('*').order('created_at')` 로 전체 row 를 한번에 끌어와
 * 클라에서 보여줌 → 데이터 늘어나면 폭증. 이 훅으로 통일:
 * - .range(from, to) 로 페이지당 50개씩
 * - count: 'exact' 로 총 개수 받아 페이지 수 계산
 * - 검색은 DB ILIKE — 현재 페이지가 아니라 전체 테이블에서 검색
 * - extraFilter 로 추가 조건 (status='active' 같은) 주입 가능
 *
 * 멀티-광장: 현재 광장 데이터만 보이게 자동 필터.
 * super admin 은 제외 (모든 광장 통합 조회). plazaScoped 옵션으로 끌 수 있음.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentPlazaClient } from '@/lib/plaza/client'

export interface UseAdminTableOptions {
  table: string
  /** 검색어로 ILIKE 매칭할 컬럼들 — 여러 개면 OR 결합 */
  searchColumns?: string[]
  /** 페이지당 개수, 기본 50 */
  pageSize?: number
  /** 정렬 컬럼, 기본 created_at desc */
  orderBy?: { column: string; ascending?: boolean }
  /** select 절, 기본 '*' */
  select?: string
  /**
   * 추가 필터 빌더. 쿼리에 .eq/.in/.gte 등을 적용 가능.
   * 의존성이 바뀌면 useEffect 가 재로드 트리거하도록 deps 도 같이 전달.
   */
  applyFilter?: (q: any) => any
  /** applyFilter 의존성 — 바뀌면 1페이지로 돌아가서 재로드 */
  filterDeps?: any[]
  /**
   * 현재 광장으로 자동 필터링 (기본 true).
   * super admin 은 제외 (전 광장 데이터 조회). false 면 어떤 admin 이든 전체 조회.
   * 광장과 무관한 테이블 (auth.users, profiles 등) 조회 시 false.
   */
  plazaScoped?: boolean
}

export interface AdminTableState<T = any> {
  rows: T[]
  loading: boolean
  page: number
  setPage: (p: number) => void
  pageSize: number
  totalCount: number
  totalPages: number
  search: string
  setSearch: (s: string) => void
  reload: () => Promise<void>
}

export function useAdminTable<T = any>(opts: UseAdminTableOptions): AdminTableState<T> {
  const {
    table,
    searchColumns = [],
    pageSize = 50,
    orderBy = { column: 'created_at', ascending: false },
    select = '*',
    applyFilter,
    filterDeps = [],
    plazaScoped = true,
  } = opts

  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearchInternal] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null)

  // mount 시 super admin 여부 조회 (한번만)
  useEffect(() => {
    if (!plazaScoped) {
      setIsSuperAdmin(true)  // plazaScoped=false 면 필터링 안 함
      return
    }
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setIsSuperAdmin(false)
        return
      }
      const { data } = await supabase
        .from('plaza_admins')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super')
        .maybeSingle()
      if (!cancelled) setIsSuperAdmin(!!data)
    })()
    return () => {
      cancelled = true
    }
  }, [plazaScoped])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const reload = useCallback(async () => {
    // super admin 여부 결정 전엔 쿼리 안 던짐 (필터 누락 방지)
    if (isSuperAdmin === null) return

    setLoading(true)
    const supabase = createClient()
    let q: any = (supabase as any)
      .from(table)
      .select(select, { count: 'exact' })
      .order(orderBy.column, { ascending: !!orderBy.ascending })
      .range(page * pageSize, page * pageSize + pageSize - 1)

    // 광장 스코프 — super 가 아니고 plazaScoped 면 현재 광장만
    if (plazaScoped && !isSuperAdmin) {
      const plaza = getCurrentPlazaClient()
      if (plaza) q = q.eq('plaza_id', plaza)
    }

    if (applyFilter) q = applyFilter(q)

    if (search.trim() && searchColumns.length > 0) {
      const term = search.trim().replace(/[%_]/g, '\\$&')
      // PostgREST or 문법: col1.ilike.*foo*,col2.ilike.*foo*
      const orExpr = searchColumns.map((c) => `${c}.ilike.*${term}*`).join(',')
      q = q.or(orExpr)
    }

    const { data, count, error } = await q
    if (error) {
      console.error(`useAdminTable[${table}]`, error)
      setRows([])
      setTotalCount(0)
    } else {
      setRows((data as T[]) || [])
      setTotalCount(count || 0)
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, page, pageSize, search, isSuperAdmin, plazaScoped, ...filterDeps])

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])

  // 검색어 바뀌면 1페이지로
  const setSearch = (s: string) => {
    setSearchInternal(s)
    setPage(0)
  }

  return {
    rows,
    loading,
    page,
    setPage,
    pageSize,
    totalCount,
    totalPages,
    search,
    setSearch,
    reload,
  }
}
