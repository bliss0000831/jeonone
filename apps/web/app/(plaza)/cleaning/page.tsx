import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { plazaCityName } from "@/lib/plaza/city-name"
import CleaningListPageClient from "./_client"

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

  const title = `${cityName} 청소 서비스`
  const description = `${cityName} 입주청소, 이사청소, 정기청소 전문 업체를 찾아보세요.`

  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ko_KR" },
  }
}

export default function CleaningListPage() {
  return <CleaningListPageClient />
}
