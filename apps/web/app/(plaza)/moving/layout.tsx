import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "이사",
  description: "포장이사, 반포장이사, 용달이사 등 이사 업체를 비교하고 견적을 받아보세요.",
  openGraph: {
    title: "이사",
    description: "포장이사, 반포장이사, 용달이사 등 이사 업체를 비교하고 견적을 받아보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
