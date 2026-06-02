import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "신장개업",
  description: "우리 동네 새로 오픈한 가게와 오픈 이벤트를 확인해보세요.",
  openGraph: {
    title: "신장개업",
    description: "우리 동네 새로 오픈한 가게와 오픈 이벤트를 확인해보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
