import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { plazaCityName } from "@/lib/plaza/city-name"
import GroupBuyingPageClient from "./_client"

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

  const title = `${cityName} 공동구매 — 함께 사면 더 싸게`
  const description = `${cityName} 이웃과 함께하는 공동구매. 신선식품, 생활용품을 공구가로.`

  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ko_KR" },
  }
}

export default function GroupBuyingPage() {
  return <GroupBuyingPageClient />
}
