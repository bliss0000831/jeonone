import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "청소",
  description: "입주청소, 이사청소, 정기청소 등 전문 청소 업체를 찾아보세요.",
  openGraph: {
    title: "청소",
    description: "입주청소, 이사청소, 정기청소 등 전문 청소 업체를 찾아보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
