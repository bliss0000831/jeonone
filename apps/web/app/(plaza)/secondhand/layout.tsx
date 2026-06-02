import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "중고거래",
  description: "우리 동네 중고 물품을 사고팔아보세요. 가전, 가구, 의류, 유아용품 등 다양한 카테고리.",
  openGraph: {
    title: "중고거래",
    description: "우리 동네 중고 물품을 사고팔아보세요. 가전, 가구, 의류, 유아용품 등 다양한 카테고리.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
