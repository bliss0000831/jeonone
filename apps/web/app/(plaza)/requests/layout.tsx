import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "매물 요청",
  description: "원하는 조건의 매물을 요청하고 공인중개사의 추천을 받아보세요.",
  openGraph: {
    title: "매물 요청",
    description: "원하는 조건의 매물을 요청하고 공인중개사의 추천을 받아보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
