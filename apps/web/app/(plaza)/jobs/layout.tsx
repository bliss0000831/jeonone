import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "구인구직",
  description: "우리 동네 알바, 정규직, 파트타임 구인·구직 정보를 확인하세요.",
  openGraph: {
    title: "구인구직",
    description: "우리 동네 알바, 정규직, 파트타임 구인·구직 정보를 확인하세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
