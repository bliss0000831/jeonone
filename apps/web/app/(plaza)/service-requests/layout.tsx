import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "서비스 요청",
  description: "인테리어, 이사, 청소, 수리 등 각종 서비스 견적을 요청하고 비교해보세요.",
  openGraph: {
    title: "서비스 요청",
    description: "인테리어, 이사, 청소, 수리 등 각종 서비스 견적을 요청하고 비교해보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
