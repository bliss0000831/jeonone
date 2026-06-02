/**
 * 비슷한 매물 추천 API.
 *
 * 동일 광장 내에서 다음 우선순위로 정렬:
 *   1. 같은 거래유형 (매매/전세/월세)
 *   2. 같은 매물 타입 (아파트/빌라/원룸)
 *   3. 가격 ±20% 범위
 *   4. 최근 등록순
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlaza } from '@/lib/plaza/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  // 기준 매물 조회
  let baseQ: any = supabase
    .from('properties')
    .select('id, transaction_type, property_type, price, area_sqm')
    .eq('id', id)
  if (plaza) baseQ = baseQ.eq('plaza_id', plaza)
  const { data: base } = await baseQ.maybeSingle()

  if (!base) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 })
  }

  const minPrice = Math.max(0, Math.floor((base.price || 0) * 0.8))
  const maxPrice = Math.ceil((base.price || 0) * 1.2)

  const LIMIT = 8

  // tier-1: 같은 거래유형 + 같은 타입 + 가격대
  let q1: any = supabase
    .from('properties')
    .select('id, title, transaction_type, property_type, price, deposit, monthly_rent, area_sqm, address, dong, images, effective_at, status, user_id, plaza_id')
    .eq('status', 'active')
    .neq('id', id)
    .eq('transaction_type', base.transaction_type)
    .eq('property_type', base.property_type)
    .gte('price', minPrice)
    .lte('price', maxPrice)
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (plaza) q1 = q1.eq('plaza_id', plaza)

  // tier-2: 같은 거래유형으로 확장 (중복은 나중에 제거)
  let q2: any = supabase
    .from('properties')
    .select('id, title, transaction_type, property_type, price, deposit, monthly_rent, area_sqm, address, dong, images, effective_at, status, user_id, plaza_id')
    .eq('status', 'active')
    .neq('id', id)
    .eq('transaction_type', base.transaction_type)
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (plaza) q2 = q2.eq('plaza_id', plaza)

  // 두 쿼리를 병렬로 실행
  const [{ data: tier1 }, { data: tier2 }] = await Promise.all([q1, q2])

  // tier-1 결과 우선, 나머지 슬롯을 tier-2 로 채움 (중복 제거)
  const tier1Results = tier1 || []
  const tier1Ids = new Set(tier1Results.map((r: any) => r.id))
  const tier2Extras = (tier2 || []).filter((r: any) => !tier1Ids.has(r.id))
  const results = [...tier1Results, ...tier2Extras]

  return NextResponse.json({ similar: results.slice(0, LIMIT) })
}
