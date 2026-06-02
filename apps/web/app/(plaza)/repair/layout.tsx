import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "수리",
  description: "에어컨, 보일러, 배관, 전기 등 각종 수리 업체를 찾아보세요.",
  openGraph: {
    title: "수리",
    description: "에어컨, 보일러, 배관, 전기 등 각종 수리 업체를 찾아보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
