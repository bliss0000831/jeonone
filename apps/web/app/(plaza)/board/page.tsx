import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { plazaCityName } from "@/lib/plaza/city-name"
import BoardPageClient from "./_client"

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const plaza = await getCurrentPlaza()

  let cityName = "광장"
  if (plaza) {
    const { data } = await supabase
      .from("plazas")
      .select("name")
      .eq("id", plaza)
      .single()
    if (data?.name) cityName = plazaCityName(data.name)
  }

  const title = `${cityName} 게시판 — 자유·맛집·생활정보·일상`
  const description = `${cityName} 주민들의 마을 사랑방. 맛집 추천, 생활정보, 일상 이야기를 나눠보세요.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
    },
  }
}

export default function BoardPage() {
  return <BoardPageClient />
}
