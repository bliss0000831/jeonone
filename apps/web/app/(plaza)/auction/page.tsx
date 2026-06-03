"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import type { User } from "@supabase/supabase-js"
import { Gavel, Clock, TrendingUp, Loader2, Plus } from "lucide-react"

const FALLBACK_IMG = "/images/card-auction.jpg"

interface Auction {
  id: string
  start_price: number
  current_price: number
  bid_count: number
  buy_now_price: number | null
  end_at: string
  status: string
  post?: { title?: string; images?: string[] | null; location?: string | null } | null
}

function won(n: number) {
  if (!n) return "0원"
  if (n >= 10000) return `${(n / 10000).toLocaleString()}만원`
  return `${n.toLocaleString()}원`
}

function timeLeft(end: string) {
  const ms = new Date(end).getTime() - Date.now()
  if (ms <= 0) return "마감"
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return `${Math.floor(h / 24)}일 남음`
  if (h >= 1) return `${h}시간 남음`
  return `${Math.max(1, Math.floor(ms / 60000))}분 남음`
}

export default function AuctionPage() {
  const [user, setUser] = useState<User | null>(null)
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    try {
      let q = (supabase as any)
        .from("auction_listings")
        .select("id, start_price, current_price, bid_count, buy_now_price, end_at, status, post:secondhand_posts(title, images, location)")
        .eq("status", "active")
        .order("end_at", { ascending: true })
        .limit(60)
      if (plaza) q = q.eq("plaza_id", plaza)
      const { data } = await q
      setAuctions((data as any[]) || [])
    } catch { setAuctions([]) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen flex flex-col bg-background pb-20 md:pb-0">
      <Header user={user} />

      {/* 히어로 */}
      <div className="relative h-44 md:h-60 overflow-hidden">
        <Image src={FALLBACK_IMG} alt="만물 경매장" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
          <div className="text-center text-white">
            <Gavel className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3" />
            <h1 className="text-2xl md:text-4xl font-black">만물 경매장</h1>
            <p className="text-base md:text-xl mt-1.5">농산물·농기구 경매 / 즉시 거래</p>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">진행 중인 경매</h2>
          {user && (
            <Link href="/secondhand/register?type=auction" className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2.5 hover:bg-primary/90">
              <Plus className="w-4 h-4" /> 경매 등록
            </Link>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
        ) : auctions.length === 0 ? (
          <div className="text-center py-16">
            <Gavel className="w-16 h-16 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-bold">진행 중인 경매가 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">첫 경매를 등록해보세요!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {auctions.map((a) => (
              <Link key={a.id} href={`/auction/${a.id}`} className="rounded-xl border-2 border-border overflow-hidden bg-card hover:shadow-lg transition-shadow group">
                <div className="relative h-52 bg-muted">
                  <Image src={a.post?.images?.[0] || FALLBACK_IMG} alt={a.post?.title || "경매"} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-rose-600 text-white"><Clock className="w-3.5 h-3.5" />{timeLeft(a.end_at)}</span>
                </div>
                <div className="p-4">
                  <h3 className="text-base font-bold mb-2 line-clamp-1">{a.post?.title || "경매 물품"}</h3>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">현재가</p>
                      <p className="text-xl font-black text-primary">{won(a.current_price || a.start_price)}</p>
                    </div>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground"><TrendingUp className="w-4 h-4" />{a.bid_count}회</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
