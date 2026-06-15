"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"
import { CalendarDays, ArrowLeft, Loader2, Inbox, Send, Check, X, PackageCheck, Star } from "lucide-react"

const FALLBACK_IMG = "/images/card-farm-equipment.jpg"
const won = (n: number) => (n ? `${n.toLocaleString()}원` : "0원")

const STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "승인 대기", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "승인됨", cls: "bg-emerald-100 text-emerald-700" },
  in_use: { label: "대여중", cls: "bg-blue-100 text-blue-700" },
  returned: { label: "반납됨", cls: "bg-slate-100 text-slate-600" },
  completed: { label: "완료", cls: "bg-slate-100 text-slate-600" },
  cancelled: { label: "취소/거절됨", cls: "bg-rose-100 text-rose-600" },
}

interface Booking {
  id: string
  rental_id: string
  renter_id: string
  start_date: string
  end_date: string
  total_amount: number
  deposit: number
  status: string
  created_at: string
  rental?: {
    owner_id: string
    plaza_id?: string | null
    post?: { title?: string; images?: string[] | null } | null
  } | null
  renterName?: string
}

export default function RentalManagePage() {
  const confirm = useConfirm()
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<"received" | "sent">("received")
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  // ?tab=sent 로 진입 시 '보낸 신청' 탭으로 (대여 신청 완료 토스트에서 연결)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "sent") setTab("sent")
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: au } = await supabase.auth.getUser()
    const u = au.user
    setUser(u)
    if (!u) { setLoading(false); return }

    // RLS: 신청자(renter) OR 소유자(owner) 인 예약만 반환됨
    const { data } = await (supabase as any)
      .from("rental_bookings")
      .select("*, rental:rental_listings(owner_id, plaza_id, post:secondhand_posts(title, images))")
      .order("created_at", { ascending: false })
    const rows: Booking[] = (data as Booking[]) || []

    // 신청자 이름 매핑 (받은 신청 표시용)
    const renterIds = Array.from(new Set(rows.map((b) => b.renter_id)))
    if (renterIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nickname, full_name")
        .in("id", renterIds)
      const pmap = new Map((profs || []).map((p: any) => [p.id, p.nickname || p.full_name || "농부님"]))
      rows.forEach((b) => { b.renterName = pmap.get(b.renter_id) || "농부님" })
    }
    setBookings(rows)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const received = bookings.filter((b) => b.rental?.owner_id === user?.id && b.renter_id !== user?.id)
  const sent = bookings.filter((b) => b.renter_id === user?.id)

  const notify = async (toUser: string, title: string, message: string, plaza?: string | null) => {
    if (!user || toUser === user.id) return
    const supabase = createClient()
    try {
      await (supabase as any).from("notifications").insert({
        user_id: toUser, type: "rental_response", title, message,
        link: "/rental/manage", actor_id: user.id, ...(plaza ? { plaza_id: plaza } : {}),
      })
    } catch { /* ignore */ }
  }

  const setStatus = async (b: Booking, next: string) => {
    // 비가역/중요 전이는 확인 (오탭 방지)
    if (next === "cancelled" && !(await confirm({ title: "대여 거절", description: "이 대여 신청을 거절하시겠습니까?", confirmText: "거절", destructive: true }))) return
    if (next === "returned" && !(await confirm({ title: "반납 확인", description: "반납을 확인 처리하시겠습니까?", confirmText: "반납 확인" }))) return
    setBusy(b.id)
    const supabase = createClient()
    const { error } = await (supabase as any)
      .from("rental_bookings").update({ status: next, updated_at: new Date().toISOString() }).eq("id", b.id)
    setBusy(null)
    if (error) { console.error("[rental status]", error); toast.error("처리하지 못했어요. 잠시 후 다시 시도해주세요."); return }
    const title = b.rental?.post?.title || "농기구"
    if (next === "approved") { toast.success("승인했습니다"); notify(b.renter_id, "대여 승인됨", `${title} 대여가 승인되었습니다`, b.rental?.plaza_id) }
    else if (next === "cancelled") { toast.success("거절했습니다"); notify(b.renter_id, "대여 거절됨", `${title} 대여 신청이 거절되었습니다`, b.rental?.plaza_id) }
    else if (next === "in_use") { toast.success("대여를 시작했습니다"); notify(b.renter_id, "대여 시작됨", `${title} 대여가 시작되었습니다`, b.rental?.plaza_id) }
    else if (next === "returned") { toast.success("반납을 확인했습니다"); notify(b.renter_id, "반납 완료", `${title} 반납이 확인되었습니다. 후기를 남겨주세요.`, b.rental?.plaza_id) }
    else if (next === "completed") { toast.success("반납 완료 처리했습니다") }
    load()
  }

  const cancelMine = async (b: Booking) => {
    if (!(await confirm({ title: "신청 취소", description: "대여 신청을 취소하시겠습니까?", confirmText: "신청 취소", destructive: true }))) return
    setBusy(b.id)
    const supabase = createClient()
    const { error } = await (supabase as any)
      .from("rental_bookings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", b.id)
    setBusy(null)
    if (error) { console.error("[rental cancel]", error); toast.error("취소하지 못했어요. 잠시 후 다시 시도해주세요."); return }
    toast.success("신청을 취소했습니다")
    load()
  }

  const Card = ({ b, mine }: { b: Booking; mine: boolean }) => {
    const st = STATUS[b.status] || STATUS.requested
    const days = Math.max(1, Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000) + 1)
    return (
      <div className="rounded-2xl border-2 border-border bg-card overflow-hidden">
        <div className="flex gap-3 p-3">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0">
            <Image src={b.rental?.post?.images?.[0] || FALLBACK_IMG} alt="" fill className="object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold line-clamp-1">{b.rental?.post?.title || "농기구"}</h3>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md shrink-0 ${st.cls}`}>{st.label}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />{b.start_date} ~ {b.end_date} ({days}일)
            </p>
            {!mine && <p className="text-xs text-muted-foreground mt-0.5">신청자: {b.renterName}</p>}
            <p className="text-sm font-black text-primary mt-1">{won(b.total_amount)}{b.deposit ? <span className="text-xs font-medium text-muted-foreground"> + 보증금 {won(b.deposit)}</span> : null}</p>
          </div>
        </div>
        {/* 액션 */}
        {!mine && b.status === "requested" && (
          <div className="flex border-t border-border">
            <button onClick={() => setStatus(b, "approved")} disabled={busy === b.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              {busy === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}승인
            </button>
            <button onClick={() => setStatus(b, "cancelled")} disabled={busy === b.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 border-l border-border disabled:opacity-50">
              <X className="w-4 h-4" />거절
            </button>
          </div>
        )}
        {!mine && b.status === "approved" && (
          <div className="flex border-t border-border">
            <button onClick={() => setStatus(b, "in_use")} disabled={busy === b.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
              {busy === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}대여 시작
            </button>
            <button onClick={() => setStatus(b, "cancelled")} disabled={busy === b.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 border-l border-border disabled:opacity-50">
              <X className="w-4 h-4" />취소
            </button>
          </div>
        )}
        {!mine && b.status === "in_use" && (
          <button onClick={() => setStatus(b, "returned")} disabled={busy === b.id}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-primary hover:bg-primary/5 border-t border-border disabled:opacity-50">
            {busy === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}반납 확인
          </button>
        )}
        {mine && (b.status === "requested" || b.status === "approved") && (
          <button onClick={() => cancelMine(b)} disabled={busy === b.id}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted border-t border-border disabled:opacity-50">
            {busy === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}신청 취소
          </button>
        )}
        {mine && b.status === "in_use" && (
          <p className="px-3 py-2.5 border-t border-border text-xs text-muted-foreground text-center leading-relaxed">
            대여 중입니다. 반납일에 소유자에게 반납해 주세요.<br />반납 확인은 소유자가 합니다.
          </p>
        )}
        {mine && (b.status === "returned" || b.status === "completed") && b.rental?.owner_id && (
          <Link href={`/mypage/write-review?reviewed_user_id=${b.rental.owner_id}&source_type=rental&source_id=${b.id}&target_name=${encodeURIComponent(b.rental?.post?.title || "소유자")}`}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-primary hover:bg-primary/5 border-t border-border">
            <Star className="w-4 h-4" /> 소유자 후기 작성
          </Link>
        )}
      </div>
    )
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!user) return (
    <div className="min-h-screen flex flex-col"><Header user={user} />
      <div className="flex-1 grid place-items-center text-center px-6">
        <div>
          <p className="text-lg font-bold mb-2">로그인이 필요합니다</p>
          <Link href="/auth/login?redirect=/rental/manage" className="inline-block rounded-xl bg-primary text-primary-foreground font-bold px-5 py-2.5">로그인</Link>
        </div>
      </div>
    </div>
  )

  const list = tab === "received" ? received : sent

  return (
    <div className="min-h-screen flex flex-col bg-background pb-24 md:pb-6">
      <Header user={user} />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-5">
        <Link href="/rental" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3"><ArrowLeft className="w-4 h-4" />농기구 대여</Link>
        <h1 className="text-2xl font-black mb-4">대여 예약 관리</h1>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab("received")}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm border-2 ${tab === "received" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"}`}>
            <Inbox className="w-4 h-4" />받은 신청{received.length ? ` (${received.length})` : ""}
          </button>
          <button onClick={() => setTab("sent")}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm border-2 ${tab === "sent" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"}`}>
            <Send className="w-4 h-4" />내 신청{sent.length ? ` (${sent.length})` : ""}
          </button>
        </div>

        {list.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays className="w-14 h-14 mx-auto text-muted-foreground mb-3" />
            <p className="font-bold">{tab === "received" ? "받은 대여 신청이 없습니다" : "신청한 대여가 없습니다"}</p>
            {tab === "sent" && <Link href="/rental" className="text-sm text-primary font-semibold mt-2 inline-block">농기구 대여 둘러보기 →</Link>}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((b) => <Card key={b.id} b={b} mine={tab === "sent"} />)}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
