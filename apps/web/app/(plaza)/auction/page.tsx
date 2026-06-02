import Link from "next/link"
import { ArrowLeft, Gavel } from "lucide-react"

export const metadata = {
  title: "만물 경매장 — 준비 중",
  description: "농산물·농기구 경매 거래소가 곧 열립니다.",
}

export default function AuctionComingSoonPage() {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">만물 경매장</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="mx-auto w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 grid place-items-center mb-5">
          <Gavel className="w-9 h-9 text-amber-700 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">곧 열립니다</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          농산물·농기구 <b>경매 / 즉시 거래</b> 기능을 준비 중입니다.
          <br />
          조금만 기다려 주세요!
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-3"
        >
          홈으로
        </Link>
      </main>
    </div>
  )
}
