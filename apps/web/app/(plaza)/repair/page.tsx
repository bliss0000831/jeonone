import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { plazaCityName } from "@/lib/plaza/city-name"
import RepairListPageClient from "./_client"

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

  const title = `${cityName} 수리 서비스`
  const description = `${cityName} 전기수리, 배관수리, 가전수리 전문 업체를 찾아보세요.`

  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ko_KR" },
  }
}

export default function RepairListPage() {
  return <RepairListPageClient />
}
