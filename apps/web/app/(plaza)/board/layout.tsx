import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "게시판",
  description: "마을 사랑방, 맛집추천, 생활정보, 일상공유, 질문답변 등 다양한 주제로 이웃과 소통해보세요.",
  openGraph: {
    title: "게시판",
    description: "마을 사랑방, 맛집추천, 생활정보, 일상공유, 질문답변 등 다양한 주제로 이웃과 소통해보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
