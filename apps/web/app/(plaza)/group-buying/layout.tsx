import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "공동구매",
  description: "이웃과 함께 공동구매로 더 저렴하게! 식품, 생활용품, 가전 등 다양한 공구.",
  openGraph: {
    title: "공동구매",
    description: "이웃과 함께 공동구매로 더 저렴하게! 식품, 생활용품, 가전 등 다양한 공구.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
