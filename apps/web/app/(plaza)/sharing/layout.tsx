import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "나눔",
  description: "이웃과 물건을 나눠보세요. 무료 나눔, 교환, 기부 등 따뜻한 이웃 커뮤니티.",
  openGraph: {
    title: "나눔",
    description: "이웃과 물건을 나눠보세요. 무료 나눔, 교환, 기부 등 따뜻한 이웃 커뮤니티.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
