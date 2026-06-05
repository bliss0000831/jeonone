/**
 * 올리기권 충전 — 웹의 /bump-tickets 페이지를 webview 로 임베드.
 * 모바일 native 구매 페이지가 별도로 마련되기 전까지 web 결제 흐름 재사용.
 */

import { useEffect } from "react"
import { useRouter } from "expo-router"
import { getCachedPlaza } from "@/lib/plaza"

export default function BumpTicketsScreen() {
  const router = useRouter()

  useEffect(() => {
    const plaza = getCachedPlaza().id
    const base = (process.env.EXPO_PUBLIC_API_BASE ?? "https://jeonwondiary.vercel.app").replace(/\/$/, "")
    const url = `${base}/bump-tickets${plaza ? `?plaza=${plaza}` : ""}`
    // replace 로 진입 — 뒤로가기 누르면 이전 화면으로 직행 (webview 중간 단계 X)
    router.replace({
      pathname: "/webview",
      params: { url, title: "올리기권 충전" },
    } as any)
  }, [router])

  return null
}
