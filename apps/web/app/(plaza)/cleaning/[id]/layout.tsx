import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"

interface Props {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q = supabase
    .from("cleaning_posts")
    .select("title, category, content, images, service_region, service_district, min_price, max_price, price_unit")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data: p } = await q.single()

  if (!p) return {}

  const priceText =
    p.min_price && p.max_price
      ? `${p.min_price.toLocaleString()}~${p.max_price.toLocaleString()}${p.price_unit || "만원"}`
      : p.min_price
        ? `${p.min_price.toLocaleString()}${p.price_unit || "만원"}~`
        : "가격 문의"

  const title = `${p.category ? `[${p.category}] ` : ""}${p.title} · ${priceText}`
  const desc = [p.service_region, p.service_district, p.content?.slice(0, 100)]
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
    },
  }
}

export default function CleaningDetailLayout({ children }: Props) {
  return children
}
