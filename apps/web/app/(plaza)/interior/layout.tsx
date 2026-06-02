import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "인테리어",
  description: "믿을 수 있는 인테리어 업체를 찾아보세요. 시공 사례, 견적, 후기를 한눈에.",
  openGraph: {
    title: "인테리어",
    description: "믿을 수 있는 인테리어 업체를 찾아보세요. 시공 사례, 견적, 후기를 한눈에.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
