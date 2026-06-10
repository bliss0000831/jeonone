import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "소식통",
  description: "마을 사랑방, 농업 일기, 무료 나눔, 살림 정보, 정부 지원금, 궁금해요 등 다양한 주제로 이웃과 소통해보세요.",
  openGraph: {
    title: "소식통",
    description: "마을 사랑방, 농업 일기, 무료 나눔, 살림 정보, 정부 지원금, 궁금해요 등 다양한 주제로 이웃과 소통해보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
