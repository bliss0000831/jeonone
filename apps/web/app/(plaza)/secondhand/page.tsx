import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { getCurrentPlaza } from "@/lib/plaza/server"
import { plazaCityName } from "@/lib/plaza/city-name"
import SecondhandPageClient from "./_client"

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

  const title = `${cityName} 중고거래 — 우리 동네 안전 거래`
  const description = `${cityName} 주민 간 중고거래. 디지털기기, 가구, 의류 등 안전하게 거래하세요.`

  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ko_KR" },
  }
}

export default function SecondhandPage() {
  return <SecondhandPageClient />
}
