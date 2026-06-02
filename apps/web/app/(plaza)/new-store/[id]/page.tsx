import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import NewStoreDetailPage from "./_client"

export const revalidate = 60

interface Props {
  params: Promise<{ id: string }>
}

/* ------------------------------------------------------------------ */
/*  SEO — 신규매장 상세 동적 메타데이터                                  */
/* ------------------------------------------------------------------ */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase
    .from("new_store_posts")
    .select("store_name, description, images")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data } = await q.maybeSingle()

  if (!data) return { title: "게시글을 찾을 수 없습니다" }

  const title = data.store_name
  const desc = data.description?.slice(0, 160) || `${title} — 광장`
  const image = data.images?.[0] || undefined

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      ...(image && { images: [{ url: image }] }),
    },
  }
}

export default function Page() {
  return <NewStoreDetailPage />
}
