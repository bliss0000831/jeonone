"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { toast } from "sonner"
import { Gavel, Clock, TrendingUp, ArrowLeft, Loader2, Zap } from "lucide-react"

const FALLBACK_IMG = "/images/card-auction.jpg"

function won(n: number) {
  if (!n) return "0원"
  return `${n.toLocaleString()}원`
}
function timeLeft(end: string) {
  const ms = new Date(end).getTime() - Date.now()
  if (ms <= 0) return "마감"
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 남음`
  if (h >= 1) return `${h}시간 ${Math.floor((ms % 3600000) / 60000)}분 남음`
  return `${Math.max(1, Math.floor(ms / 60000))}분 남음`
}

export default function AuctionDetailPage() {
  const params = useParams()
  const id = (typeof params.id === "string" ? params.id : params.id?.[0]) || ""
  const [user, setUser] = useState<User | null>(null)
  const [a, setA] = useState<any>(null)
  const [bids, setBids] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bidAmount, setBidAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    // 만료 경매 자동 정산 (cron 대체) — 이 경매가 막 끝났다면 ended 로 갱신됨
    try { await (supabase as any).rpc("close_expired_auctions") } catch { /* ignore */ }
    const { data } = await (supabase as any)
      .from("auction_listings")
      .select("*, post:secondhand_posts(title, description, images, location)")
      .eq("id", id)
      .maybeSingle()
    setA(data)
    const { data: b } = await (supabase as any)
      .from("auction_bids")
      .select("amount, created_at")
      .eq("auction_id", id)
      .order("created_at", { ascending: false })
      .limit(10)
    setBids(b || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const minBid = a ? Math.max(a.start_price, (a.current_price || 0) + a.bid_increment) : 0

  const placeBid = async () => {
    if (!user) { toast.error("로그인이 필요합니다"); return }
    const amt = parseInt(bidAmount.replace(/[^0-9]/g, ""), 10)
    if (!amt || amt < minBid) { toast.error(`최소 입찰가는 ${won(minBid)} 입니다`); return }
    setSubmitting(true)
    const supabase = createClient()
    const { data, error } = await (supabase as any).rpc("place_auction_bid", { p_auction: id, p_amount: amt })
    setSubmitting(false)
    if (error) { toast.error("입찰 실패: " + error.message); return }
    const res = data as any
    if (!res?.ok) { toast.error(res?.error || "입찰 실패"); return }
    toast.success("입찰 완료!")
    setBidAmount("")
    load()
  }

  const buyNow = async () => {
    if (!user) { toast.error("로그인이 필요합니다"); return }
    if (!a?.buy_now_price) return
    if (!confirm(`${won(a.buy_now_price)}에 즉시구매하시겠습니까?`)) return
    setSubmitting(true)
    const supabase = createClient()
    const { data, error } = await (supabase as any).rpc("buy_now_auction", { p_auction: id })
    setSubmitting(false)
    if (error) { toast.error("구매 실패: " + error.message); return }
    const res = data as any
    if (!res?.ok) { toast.error(res?.error || "구매 실패"); return }
    toast.success("즉시구매 완료! 🎉")
    load()
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!a) return (
    <div className="min-h-screen flex flex-col"><Header user={user} />
      <div className="flex-1 grid place-items-center text-muted-foreground">경매를 찾을 수 없습니다</div>
    </div>
  )

  const ended = a.status !== "active" || new Date(a.end_at).getTime() <= Date.now()

  return (
    <div className="min-h-screen flex flex-col bg-background pb-24">
      <Header user={user} />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-5">
        <Link href="/auction" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3"><ArrowLeft className="w-4 h-4" />경매장</Link>

        <div className="relative w-full rounded-2xl overflow-hidden bg-muted mb-4" style={{ aspectRatio: "4/3" }}>
          <Image src={a.post?.images?.[0] || FALLBACK_IMG} alt={a.post?.title || "경매"} fill className="object-cover" />
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-rose-600 text-white"><Clock className="w-3.5 h-3.5" />{timeLeft(a.end_at)}</span>
        </div>

        <h1 className="text-2xl font-black mb-2">{a.post?.title || "경매 물품"}</h1>

        <div className="rounded-2xl border-2 border-primary/20 bg-card p-5 mb-4">
          <div className="flex items-end justify-between mb-1">
            <span className="text-sm text-muted-foreground">현재가</span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground"><TrendingUp className="w-4 h-4" />입찰 {a.bid_count}회</span>
          </div>
          <p className="text-3xl font-black text-primary">{won(a.current_price || a.start_price)}</p>
          <p className="text-xs text-muted-foreground mt-1">시작가 {won(a.start_price)} · 최소 입찰 단위 {won(a.bid_increment)}</p>
          {a.buy_now_price ? <p className="text-sm font-bold mt-2">즉시구매가 {won(a.buy_now_price)}</p> : null}
        </div>

        {/* 종료/낙찰 결과 */}
        {ended && (
          a.winner_id ? (
            <div className={`rounded-2xl p-4 mb-4 border-2 ${user && a.winner_id === user.id ? "border-primary bg-primary/5" : "border-border bg-muted/40"}`}>
              <p className="font-black flex items-center gap-2">
                <Gavel className="w-5 h-5 text-primary" />
                {user && a.winner_id === user.id ? "🎉 축하합니다! 낙찰되었습니다" : "경매가 종료되었습니다 (낙찰)"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">최종 낙찰가 <span className="font-bold text-primary">{won(a.current_price)}</span></p>
              {user && a.winner_id === user.id && <p className="text-xs text-muted-foreground mt-1">판매자와 채팅으로 거래를 진행해주세요.</p>}
            </div>
          ) : (
            <div className="rounded-2xl p-4 mb-4 border-2 border-border bg-muted/40">
              <p className="font-bold text-muted-foreground">입찰자가 없어 종료된 경매입니다 (유찰)</p>
            </div>
          )
        )}

        {a.post?.description && <p className="text-sm text-foreground/80 whitespace-pre-wrap mb-5">{a.post.description}</p>}

        {/* 최근 입찰 */}
        <div className="rounded-2xl border bg-card p-4 mb-24">
          <h3 className="font-bold mb-2">입찰 내역</h3>
          {bids.length === 0 ? <p className="text-sm text-muted-foreground py-2">아직 입찰이 없습니다</p> : (
            <ul className="divide-y divide-border">
              {bids.map((b, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-semibold text-primary">{won(b.amount)}</span>
                  <span className="text-muted-foreground text-xs">{new Date(b.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* 입찰 바 (하단 고정) */}
      {!ended && (
        <div className="fixed bottom-0 inset-x-0 bg-card border-t border-border p-3 z-40">
          <div className="max-w-2xl mx-auto space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder={`${minBid.toLocaleString()}원 이상`}
                className="flex-1 px-4 py-3 rounded-xl border-2 border-border bg-background focus:outline-none focus:border-primary"
              />
              <button onClick={placeBid} disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-6 py-3 disabled:opacity-50">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gavel className="w-5 h-5" />} 입찰
              </button>
            </div>
            {a.buy_now_price && a.seller_id !== user?.id && (
              <button onClick={buyNow} disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary text-primary font-bold py-3 hover:bg-primary/5 disabled:opacity-50">
                <Zap className="w-5 h-5" /> 즉시구매 · {won(a.buy_now_price)}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
