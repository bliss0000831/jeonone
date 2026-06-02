import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "부동산 매물",
  description: "우리 동네 아파트, 빌라, 오피스텔, 상가 매매·전세·월세 매물을 한눈에 확인하세요.",
  openGraph: {
    title: "부동산 매물",
    description: "우리 동네 아파트, 빌라, 오피스텔, 상가 매매·전세·월세 매물을 한눈에 확인하세요.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
