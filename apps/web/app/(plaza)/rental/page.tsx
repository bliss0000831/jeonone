"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import type { User } from "@supabase/supabase-js"
import { Tractor, MapPin, Loader2, Plus, CalendarDays } from "lucide-react"

const FALLBACK_IMG = "/images/card-farm-equipment.jpg"

function won(n: number) {
  if (!n) return "문의"
  if (n >= 10000) return `${(n / 10000).toLocaleString()}만원`
  return `${n.toLocaleString()}원`
}

export default function RentalPage() {
  const [user, setUser] = useState<User | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const plaza = getCurrentPlazaClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    try {
      let q = (supabase as any)
        .from("rental_listings")
        .select("id, daily_price, deposit, post:secondhand_posts(title, images, location)")
        .order("created_at", { ascending: false })
        .limit(60)
      if (plaza) q = q.eq("plaza_id", plaza)
      const { data } = await q
      setItems((data as any[]) || [])
    } catch { setItems([]) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen flex flex-col bg-background pb-20 md:pb-0">
      <Header user={user} />

      <div className="relative h-44 md:h-60 overflow-hidden">
        <Image src={FALLBACK_IMG} alt="농기구 대여" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center text-white">
            <Tractor className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3" />
            <h1 className="text-2xl md:text-4xl font-black">농기구 대여</h1>
            <p className="text-base md:text-xl mt-1.5">필요할 때 빌려 쓰는 농기구</p>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">대여 가능한 농기구</h2>
          {user && (
            <Link href="/secondhand/register?type=rental" className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2.5 hover:bg-primary/90">
              <Plus className="w-4 h-4" /> 대여 등록
            </Link>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Tractor className="w-16 h-16 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-bold">대여 상품이 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">농기구를 대여로 등록해보세요!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((r) => (
              <Link key={r.id} href={`/rental/${r.id}`} className="rounded-xl border-2 border-border overflow-hidden bg-card hover:shadow-lg transition-shadow group">
                <div className="relative h-52 bg-muted">
                  <Image src={r.post?.images?.[0] || FALLBACK_IMG} alt={r.post?.title || "대여"} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-primary text-primary-foreground"><CalendarDays className="w-3.5 h-3.5" />대여</span>
                </div>
                <div className="p-4">
                  <h3 className="text-base font-bold mb-2 line-clamp-1">{r.post?.title || "농기구"}</h3>
                  <p className="text-xl font-black text-primary">{won(r.daily_price)}<span className="text-sm font-bold text-muted-foreground"> / 일</span></p>
                  {r.deposit ? <p className="text-xs text-muted-foreground mt-0.5">보증금 {won(r.deposit)}</p> : null}
                  {r.post?.location && <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2"><MapPin className="w-4 h-4" />{r.post.location}</div>}
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
