import Link from "next/link"
import Image from "next/image"
import { Gavel } from "lucide-react"

export const metadata = {
  title: "만물 경매장 — 경매 / 즉시 거래",
  description: "농산물·농기구 경매 거래소가 곧 열립니다.",
}

export default function AuctionComingSoonPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background pb-20 md:pb-0">
      {/* 히어로 (레퍼런스 경매 룩) */}
      <div className="relative h-44 md:h-60 overflow-hidden">
        <Image src="/images/card-auction.jpg" alt="만물 경매장" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
          <div className="text-center text-white">
            <Gavel className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3" />
            <h1 className="text-2xl md:text-4xl font-black">만물 경매장</h1>
            <p className="text-base md:text-xl mt-1.5">경매 / 즉시 거래 · 농산물·농기구 거래소</p>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-md mx-auto px-4 py-16 text-center">
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 grid place-items-center mb-5">
          <Gavel className="w-9 h-9 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">곧 열립니다</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          농산물·농기구 <b>경매 / 즉시 거래</b> 기능을 준비 중입니다.
          <br />
          조금만 기다려 주세요!
        </p>
        <Link href="/" className="mt-8 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold px-6 py-3 hover:bg-primary/90">
          홈으로
        </Link>
      </main>
    </div>
  )
}
