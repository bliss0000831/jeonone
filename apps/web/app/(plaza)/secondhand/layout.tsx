import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "농기구/자재",
  description: "우리 동네 농기구·자재를 사고팔아보세요. 트랙터, 경운기, 이양기, 관리기, 하우스 자재 등 다양한 카테고리.",
  openGraph: {
    title: "농기구/자재",
    description: "우리 동네 농기구·자재를 사고팔아보세요. 트랙터, 경운기, 이양기, 관리기, 하우스 자재 등 다양한 카테고리.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
