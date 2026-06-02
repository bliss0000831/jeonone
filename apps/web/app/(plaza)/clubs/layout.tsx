import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "모임",
  description: "동네 모임을 만들고 참여해보세요. 취미, 운동, 스터디, 동호회 등 다양한 모임.",
  openGraph: {
    title: "모임",
    description: "동네 모임을 만들고 참여해보세요. 취미, 운동, 스터디, 동호회 등 다양한 모임.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
