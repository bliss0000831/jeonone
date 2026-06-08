"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { toast } from "sonner"
import { Tractor, ArrowLeft, Loader2, CalendarDays } from "lucide-react"
import { CallButton } from "@/components/detail"

const FALLBACK_IMG = "/images/card-farm-equipment.jpg"
const won = (n: number) => (n ? `${n.toLocaleString()}원` : "0원")

export default function RentalDetailPage() {
  const params = useParams()
  const id = (typeof params.id === "string" ? params.id : params.id?.[0]) || ""
  const [user, setUser] = useState<User | null>(null)
  const [r, setR] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data } = await (supabase as any)
      .from("rental_listings")
      .select("*, post:secondhand_posts(title, description, images, location)")
      .eq("id", id).maybeSingle()
    setR(data)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const days = useMemo(() => {
    if (!start || !end) return 0
    const d = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
    return d > 0 ? d : 0
  }, [start, end])
  const total = r ? days * (r.daily_price || 0) : 0

  const apply = async () => {
    if (!user) { toast.error("로그인이 필요합니다"); return }
    if (!start || !end || days <= 0) { toast.error("대여 기간을 선택해주세요"); return }
    setSubmitting(true)
    const supabase = createClient()
    // 금액·예치금·겹침검사는 서버(RPC)에서 권위적으로 처리 — 클라 계산값 미전송
    const { data, error } = await (supabase as any).rpc("create_rental_booking", {
      p_rental: id,
      p_start: start,
      p_end: end,
    })
    setSubmitting(false)
    if (error) { toast.error("신청 실패: " + error.message); return }
    const res = data as any
    if (!res?.ok) { toast.error(res?.error || "신청 실패"); return }
    toast.success("대여 신청이 접수되었습니다! 소유자 승인을 기다려주세요.")
    setStart(""); setEnd("")
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!r) return <div className="min-h-screen flex flex-col"><Header user={user} /><div className="flex-1 grid place-items-center text-muted-foreground">대여 상품을 찾을 수 없습니다</div></div>

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="min-h-screen flex flex-col bg-background pb-28">
      <Header user={user} />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-5">
        <Link href="/rental" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3"><ArrowLeft className="w-4 h-4" />농기구 대여</Link>

        <div className="relative w-full rounded-2xl overflow-hidden bg-muted mb-4" style={{ aspectRatio: "4/3" }}>
          <Image src={r.post?.images?.[0] || FALLBACK_IMG} alt={r.post?.title || "대여"} fill className="object-cover" />
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-primary text-primary-foreground"><CalendarDays className="w-3.5 h-3.5" />대여</span>
        </div>

        <h1 className="text-2xl font-black mb-2">{r.post?.title || "농기구"}</h1>
        <div className="rounded-2xl border-2 border-primary/20 bg-card p-5 mb-4">
          <p className="text-2xl font-black text-primary">{won(r.daily_price)}<span className="text-base font-bold text-muted-foreground"> / 일</span></p>
          {r.deposit ? <p className="text-sm text-muted-foreground mt-1">보증금 {won(r.deposit)} (반납 후 환급)</p> : null}
        </div>
        {r.post?.description && <p className="text-sm text-foreground/80 whitespace-pre-wrap mb-5">{r.post.description}</p>}

        {/* 대여 신청 */}
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-bold mb-3">대여 기간 선택</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">시작일</label>
              <input type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-border bg-background" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">반납일</label>
              <input type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-border bg-background" />
            </div>
          </div>
          {days > 0 && (
            <div className="flex justify-between items-center mt-3 text-sm">
              <span className="text-muted-foreground">{days}일 대여</span>
              <span className="font-black text-primary text-lg">{won(total)}{r.deposit ? <span className="text-xs font-medium text-muted-foreground"> + 보증금 {won(r.deposit)}</span> : null}</span>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-card border-t border-border p-3 z-40">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* 보조: 소유자에게 전화 걸기 — phone 있을 때만 노출 */}
          <CallButton userId={r.owner_id} />
          <button onClick={apply} disabled={submitting} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold py-3.5 disabled:opacity-50">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarDays className="w-5 h-5" />} 대여 신청{total > 0 ? ` · ${won(total)}` : ""}
          </button>
        </div>
      </div>
    </div>
  )
}
