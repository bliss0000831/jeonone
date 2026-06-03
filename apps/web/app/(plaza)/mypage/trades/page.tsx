"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { Tractor, Gavel, CalendarDays, Loader2, ArrowLeft, Package, TrendingUp } from "lucide-react"

const FALLBACK_IMG = "/images/card-farm-equipment.jpg"
const won = (n: number) => (n ? `${n.toLocaleString()}원` : "0원")

type Tab = "listings" | "bids" | "bookings"

const LISTING_BADGE: Record<string, { label: string; cls: string }> = {
  sale: { label: "판매", cls: "bg-primary text-primary-foreground" },
  auction: { label: "경매", cls: "bg-rose-600 text-white" },
  rental: { label: "대여", cls: "bg-emerald-600 text-white" },
}
const POST_STATUS: Record<string, string> = {
  active: "판매중", reserved: "예약중", completed: "거래완료", hidden: "숨김",
}
const BOOKING_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "승인 대기", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "승인됨", cls: "bg-emerald-100 text-emerald-700" },
  in_use: { label: "대여중", cls: "bg-blue-100 text-blue-700" },
  returned: { label: "반납됨", cls: "bg-slate-100 text-slate-600" },
  completed: { label: "완료", cls: "bg-slate-100 text-slate-600" },
  cancelled: { label: "취소/거절됨", cls: "bg-rose-100 text-rose-600" },
}

export default function MyTradesPage() {
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>("listings")
  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: au } = await supabase.auth.getUser()
    const u = au.user
    setUser(u)
    if (!u) { setLoading(false); return }

    // 만료 경매 정산 트리거 (입찰 현황 정확도)
    try { await (supabase as any).rpc("close_expired_auctions") } catch { /* ignore */ }

    // 내 상품
    const { data: posts } = await (supabase as any)
      .from("secondhand_posts")
      .select("id, title, images, price, listing_type, status, created_at")
      .eq("user_id", u.id)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(100)
    setListings((posts as any[]) || [])

    // 내 입찰 (경매별 최고 입찰)
    const { data: myBids } = await (supabase as any)
      .from("auction_bids")
      .select("auction_id, amount, created_at, auction:auction_listings(id, status, current_price, current_bidder_id, winner_id, end_at, post:secondhand_posts(title, images))")
      .eq("bidder_id", u.id)
      .order("amount", { ascending: false })
    const seen = new Set<string>()
    const dedupBids: any[] = []
    for (const b of (myBids as any[]) || []) {
      if (seen.has(b.auction_id)) continue
      seen.add(b.auction_id)
      dedupBids.push(b)
    }
    setBids(dedupBids)

    // 내 예약 (신청자)
    const { data: bk } = await (supabase as any)
      .from("rental_bookings")
      .select("id, start_date, end_date, total_amount, deposit, status, created_at, rental:rental_listings(post:secondhand_posts(title, images))")
      .eq("renter_id", u.id)
      .order("created_at", { ascending: false })
    setBookings((bk as any[]) || [])

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const bidState = (b: any): { label: string; cls: string } => {
    const a = b.auction
    if (!a) return { label: "-", cls: "bg-slate-100 text-slate-600" }
    const ended = a.status !== "active" || new Date(a.end_at).getTime() <= Date.now()
    if (ended) {
      return a.winner_id === user?.id
        ? { label: "낙찰 🎉", cls: "bg-primary/10 text-primary" }
        : { label: "패찰", cls: "bg-slate-100 text-slate-600" }
    }
    return a.current_bidder_id === user?.id
      ? { label: "최고 입찰 중", cls: "bg-emerald-100 text-emerald-700" }
      : { label: "밀림 · 재입찰", cls: "bg-amber-100 text-amber-700" }
  }

  const TABS: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: "listings", label: "내 상품", icon: Package, count: listings.length },
    { key: "bids", label: "내 입찰", icon: Gavel, count: bids.length },
    { key: "bookings", label: "내 예약", icon: CalendarDays, count: bookings.length },
  ]

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!user) return (
    <div className="min-h-screen flex flex-col"><Header user={user} />
      <div className="flex-1 grid place-items-center text-center px-6">
        <div>
          <p className="text-lg font-bold mb-2">로그인이 필요합니다</p>
          <Link href="/auth/login?redirect=/mypage/trades" className="inline-block rounded-xl bg-primary text-primary-foreground font-bold px-5 py-2.5">로그인</Link>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-background pb-24 md:pb-6">
      <Header user={user} />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-5">
        <Link href="/mypage" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3"><ArrowLeft className="w-4 h-4" />마이페이지</Link>
        <h1 className="text-2xl font-black mb-4">내 거래</h1>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm border-2 ${tab === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"}`}>
              <t.icon className="w-4 h-4" />{t.label}{t.count ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* 내 상품 */}
        {tab === "listings" && (
          listings.length === 0 ? (
            <Empty icon={Package} text="등록한 상품이 없습니다" actionHref="/secondhand/register" actionText="농기구 등록하기" />
          ) : (
            <div className="space-y-3">
              {listings.map((p) => {
                const badge = LISTING_BADGE[p.listing_type] || LISTING_BADGE.sale
                return (
                  <Link key={p.id} href={`/secondhand/${p.id}`} className="flex gap-3 rounded-2xl border-2 border-border bg-card p-3 hover:shadow-sm">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0">
                      <Image src={p.images?.[0] || FALLBACK_IMG} alt="" fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>
                        <span className="text-xs text-muted-foreground">{POST_STATUS[p.status] || p.status}</span>
                      </div>
                      <h3 className="font-bold line-clamp-1 mt-1">{p.title}</h3>
                      <p className="text-sm font-black text-primary mt-1">{won(p.price)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )
        )}

        {/* 내 입찰 */}
        {tab === "bids" && (
          bids.length === 0 ? (
            <Empty icon={Gavel} text="입찰한 경매가 없습니다" actionHref="/auction" actionText="경매장 가기" />
          ) : (
            <div className="space-y-3">
              {bids.map((b) => {
                const st = bidState(b)
                const a = b.auction
                return (
                  <Link key={b.auction_id} href={`/auction/${b.auction_id}`} className="flex gap-3 rounded-2xl border-2 border-border bg-card p-3 hover:shadow-sm">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0">
                      <Image src={a?.post?.images?.[0] || "/images/card-auction.jpg"} alt="" fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold line-clamp-1">{a?.post?.title || "경매 물품"}</h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md shrink-0 ${st.cls}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">내 입찰가 {won(b.amount)}</p>
                      <p className="text-sm font-black text-primary mt-0.5 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />현재가 {won(a?.current_price || 0)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )
        )}

        {/* 내 예약 */}
        {tab === "bookings" && (
          bookings.length === 0 ? (
            <Empty icon={CalendarDays} text="신청한 대여가 없습니다" actionHref="/rental" actionText="농기구 대여 가기" />
          ) : (
            <>
              <div className="space-y-3">
                {bookings.map((b) => {
                  const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.requested
                  return (
                    <div key={b.id} className="flex gap-3 rounded-2xl border-2 border-border bg-card p-3">
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0">
                        <Image src={b.rental?.post?.images?.[0] || FALLBACK_IMG} alt="" fill className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold line-clamp-1">{b.rental?.post?.title || "농기구"}</h3>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md shrink-0 ${st.cls}`}>{st.label}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{b.start_date} ~ {b.end_date}</p>
                        <p className="text-sm font-black text-primary mt-0.5">{won(b.total_amount)}{b.deposit ? <span className="text-xs font-medium text-muted-foreground"> + 보증금 {won(b.deposit)}</span> : null}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Link href="/rental/manage" className="mt-4 block text-center text-sm text-primary font-semibold">대여 예약 관리(승인/취소)로 이동 →</Link>
            </>
          )
        )}
      </main>
      <BottomNav />
    </div>
  )
}

function Empty({ icon: Icon, text, actionHref, actionText }: { icon: any; text: string; actionHref: string; actionText: string }) {
  return (
    <div className="text-center py-16">
      <Icon className="w-14 h-14 mx-auto text-muted-foreground mb-3" />
      <p className="font-bold">{text}</p>
      <Link href={actionHref} className="text-sm text-primary font-semibold mt-2 inline-block">{actionText} →</Link>
    </div>
  )
}
