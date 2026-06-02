import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { PropertyDetail } from "@/components/property-detail"
import { PropertyLegalNotice } from "@/components/listing/property-legal-notice"
import { dbToProperty, DbProperty } from "@/types/app"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { notFound } from "next/navigation"
// 노출부스트 기능 일시 비활성화 — 프리미엄 패키지로 추후 재도입
// import { BoostButton } from "@/components/billing/boost-button"

export const revalidate = 60

interface PropertyDetailPageProps {
  params: Promise<{ id: string }>
}

/* ------------------------------------------------------------------ */
/*  SEO — 매물 상세 동적 메타데이터                                     */
/* ------------------------------------------------------------------ */

/** 가격 포맷: 만원 → "1억 2,000만원" / "5,000만원" */
function formatPrice(price: number): string {
  if (price >= 10000) {
    const eok = Math.floor(price / 10000)
    const rest = price % 10000
    return rest > 0
      ? `${eok}억 ${rest.toLocaleString("ko-KR")}만원`
      : `${eok}억`
  }
  return `${price.toLocaleString("ko-KR")}만원`
}

export async function generateMetadata({
  params,
}: PropertyDetailPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q = supabase
    .from("properties")
    .select("title, property_type, transaction_type, price, monthly_rent, area_sqm, address, description, images")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: p } = await q.single()

  if (!p) return {}

  // 타이틀: "[거래유형] 매물명 · 가격"
  const priceLabel =
    p.transaction_type === "월세" && p.monthly_rent != null
      ? `${formatPrice(p.price)}/${formatPrice(p.monthly_rent)}`
      : formatPrice(p.price)
  const title = `[${p.transaction_type}] ${p.title} · ${priceLabel}`

  // 설명: "아파트 · 59㎡ · 서울시 강남구 …"
  const desc = [
    p.property_type,
    `${p.area_sqm}㎡`,
    p.address,
    p.description?.slice(0, 80),
  ]
    .filter(Boolean)
    .join(" · ")

  const ogImage = p.images?.[0] ?? undefined

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      ...(ogImage && { images: [ogImage] }),
      type: "article",
      locale: "ko_KR",
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description: desc,
      ...(ogImage && { images: [ogImage] }),
    },
  }
}

export default async function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  // 1단계 — user + property 병렬 (이후 단계는 property.user_id 가 필요해 분리)
  let propertyQuery = supabase
    .from("properties")
    .select("*")
    .eq("id", id)
  if (plaza) propertyQuery = propertyQuery.eq("plaza_id", plaza)
  const [{ data: { user } }, { data: property, error }] = await Promise.all([
    supabase.auth.getUser(),
    propertyQuery.single(),
  ])

  if (error || !property) {
    notFound()
  }

  // 2단계 — 의존 쿼리 3개를 한 번에 병렬 (profile / favCount / userFavorite)
  let favCountQ: any = supabase
    .from("favorites")
    .select("*", { count: "exact", head: true })
    .eq("property_id", id)
  if (plaza) favCountQ = favCountQ.eq("plaza_id", plaza)

  let userFavQ: any = user
    ? (() => {
        let q: any = supabase
          .from("favorites")
          .select("id")
          .eq("user_id", user.id)
          .eq("property_id", id)
        if (plaza) q = q.eq("plaza_id", plaza)
        return q.maybeSingle()
      })()
    : Promise.resolve({ data: null })

  // 조회수 증가 — atomic RPC (race-free) — fire-and-forget, await X
  void supabase.rpc('increment_view_count', { p_table: 'properties', p_id: id, p_column: 'views' })

  const [profileRes, favCountRes, userFavRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nickname, phone, avatar_url, location, account_type")
      .eq("id", property.user_id)
      .single(),
    favCountQ,
    userFavQ,
  ])

  const propertyWithProfile = {
    ...property,
    profiles: profileRes.data || null,
  }
  const favoriteCount = favCountRes.count
  const isFavorite = !!userFavRes.data

  // DB 데이터를 UI 타입으로 변환
  const convertedProperty = dbToProperty(
    propertyWithProfile as DbProperty,
    favoriteCount ?? 0,
    isFavorite
  )

  return (
    <>
      <PropertyDetail property={convertedProperty} user={user} />
      <PropertyLegalNotice
        profile={profileRes.data}
        accountType={(profileRes.data as any)?.account_type}
      />
    </>
  )
}
