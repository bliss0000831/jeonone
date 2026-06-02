import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlaza } from '@/lib/plaza/server'

// 지역 데이터는 거의 변경되지 않으므로 1 시간(3600 s) ISR 캐시.
// plaza 컨텍스트는 쿼리 파라미터 또는 host 기반이지만, Next.js ISR 은
// URL(쿼리 포함) 단위로 캐시하므로 ?plaza= 별로 독립 캐시됨.
export const revalidate = 3600

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    // ?plaza= 쿼리 우선, 없으면 host/cookie 컨텍스트
    const queryPlaza = request.nextUrl.searchParams.get('plaza')
    const plaza = (queryPlaza && queryPlaza.length > 0)
      ? queryPlaza
      : await getCurrentPlaza()

    let q = supabase
      .from('regions')
      .select('id, name, parent_id, level, is_active, order_index')
      .eq('is_active', true)
      .order('order_index', { ascending: true })

    if (plaza) q = q.eq('plaza_id', plaza)

    const { data, error } = await q

    if (error) {
      return NextResponse.json({ error: "처리에 실패했습니다" }, { status: 500 })
    }

    // Build tree structure
    const map = new Map<string, any>()
    const roots: any[] = []

    ;(data || []).forEach((r) => {
      map.set(r.id, { ...r, children: [] })
    })
    ;(data || []).forEach((r) => {
      const region = map.get(r.id)!
      if (r.parent_id && map.has(r.parent_id)) {
        map.get(r.parent_id)!.children.push(region)
      } else {
        roots.push(region)
      }
    })

    return NextResponse.json(roots, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
