import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import JobsDetailPage from "./_client"

export const revalidate = 60

interface Props {
  params: Promise<{ id: string }>
}

/* ------------------------------------------------------------------ */
/*  SEO — 구인구직 상세 동적 메타데이터                                  */
/* ------------------------------------------------------------------ */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let q: any = supabase
    .from("jobs_posts")
    .select("title, description")
    .eq("id", id)
  if (plaza) q = q.eq("plaza_id", plaza)
  const { data } = await q.maybeSingle()

  if (!data) return { title: "게시글을 찾을 수 없습니다" }

  const desc = data.description?.slice(0, 160) || `${data.title} — 전원일기`

  return {
    title: data.title,
    description: desc,
    openGraph: {
      title: data.title,
      description: desc,
    },
  }
}

export default function Page() {
  return <JobsDetailPage />
}
