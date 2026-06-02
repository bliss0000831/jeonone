import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "로컬푸드",
  description: "지역 생산자가 직접 재배한 신선한 농산물과 로컬푸드를 만나보세요.",
  openGraph: {
    title: "로컬푸드",
    description: "지역 생산자가 직접 재배한 신선한 농산물과 로컬푸드를 만나보세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
