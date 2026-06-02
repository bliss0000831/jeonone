import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { NearbyToilets } from "@/components/nearby-toilets"

export default function ToiletsPage() {
  return (
    <div className="min-h-screen bg-muted/30 pb-20 md:pb-0">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold">내 주변 화장실</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto py-6">
        <NearbyToilets />
      </main>

      <BottomNav />
    </div>
  )
}
