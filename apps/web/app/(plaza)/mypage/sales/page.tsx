"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { ArrowLeft, Loader2, Store, Truck, Banknote, ChevronRight } from "lucide-react"
import { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  STATUS_LABELS,
  STATUS_TONES,
  COURIER_COMPANIES,
  type LocalFoodOrder,
  type LocalFoodOrderItem,
} from "@/lib/local-food-orders"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type OrderWithItems = LocalFoodOrder & { items: LocalFoodOrderItem[] }
type GBOrder = {
  id: string
  post_id: string
  buyer_id: string
  status: string
  unit_price: number
  quantity: number
  amount: number
  settlement_amount?: number
  receive_method: "pickup" | "delivery"
  delivery_addr: any
  buyer_memo: string | null
  tracking_company: string | null
  tracking_number: string | null
  created_at: string
  post?: {
    id: string
    title: string
    product_name: string
    images: string[] | null
    min_participants: number
    current_participants: number
  } | null
}

const GB_STATUS_LABEL: Record<string, string> = {
  pending: "결제 대기",
  paid: "모집 진행 중",
  group_confirmed: "모집 성공 (발송 대기)",
  shipped: "배송 중",
  confirmed: "구매 확정",
  refunded: "환불 완료",
  cancelled: "취소됨",
  settled: "정산 완료",
}
const GB_STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  paid: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  group_confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  shipped: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  refunded: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  settled: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
}

export default function MySalesPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [shippingFor, setShippingFor] = useState<string | null>(null)
  const [trackForm, setTrackForm] = useState({ company: "CJ대한통운", number: "" })
  const [tab, setTab] = useState<"lf" | "gb">("lf")
  const [gbOrders, setGbOrders] = useState<GBOrder[]>([])

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login?redirect=/mypage/sales")
        return
      }
      setUser(user)
      await reload()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const reload = async () => {
    setLoading(true)
    const [lfRes, gbRes] = await Promise.all([
      fetch("/api/local-food-orders?role=seller", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/group-buying-orders?role=seller", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ])
    setOrders(lfRes?.orders || [])
    setGbOrders(gbRes?.orders || [])
    setLoading(false)
  }

  const submitTracking = async (orderId: string) => {
    if (!trackForm.number.trim()) {
      toast("운송장 번호를 입력해주세요")
      return
    }
    const res = await fetch(`/api/local-food-orders/${orderId}/ship`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tracking_company: trackForm.company,
        tracking_number: trackForm.number.trim(),
      }),
    })
    if (res.ok) {
      setShippingFor(null)
      setTrackForm({ company: "CJ대한통운", number: "" })
      await reload()
    } else {
      const j = await res.json()
      toast.error(j.error || "처리 실패")
    }
  }

  // 통계
  const stats = orders.reduce(
    (acc, o) => {
      acc.total += 1
      if (o.status === "paid") acc.toShip += 1
      if (o.status === "shipped" || o.status === "delivered") acc.shipped += 1
      if (["confirmed", "settled"].includes(o.status)) {
        acc.completed += 1
        acc.revenue += o.settlement_amount || 0
      }
      return acc
    },
    { total: 0, toShip: 0, shipped: 0, completed: 0, revenue: 0 },
  )

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <Link
          href="/mypage"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 마이페이지
        </Link>

        <div className="flex items-center gap-2 mb-6">
          <Store className="w-6 h-6 text-emerald-600" />
          <h1 className="text-xl font-bold">판매 관리</h1>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <div className="rounded-xl bg-card border border-border p-3 text-center">
            <p className="text-[11px] text-muted-foreground">전체</p>
            <p className="text-lg font-bold">{stats.total}</p>
          </div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-3 text-center">
            <p className="text-[11px] text-amber-700 dark:text-amber-300">발송 대기</p>
            <p className="text-lg font-bold text-amber-800 dark:text-amber-300">{stats.toShip}</p>
          </div>
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40 p-3 text-center">
            <p className="text-[11px] text-indigo-700 dark:text-indigo-300">배송 중</p>
            <p className="text-lg font-bold text-indigo-800 dark:text-indigo-300">{stats.shipped}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 p-3 text-center">
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">정산 예정</p>
            <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
              {stats.revenue.toLocaleString()}원
            </p>
          </div>
        </div>

        {/* 정산계좌 안내 */}
        <Link
          href="/mypage/settlement"
          className="block rounded-xl border border-border bg-card hover:bg-secondary/30 p-3 mb-4 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm">
            <Banknote className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">정산 계좌 등록</span>
            <span className="text-muted-foreground text-xs ml-auto">→</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            구매확정된 주문은 등록한 계좌로 입금됩니다 (실서비스 전환 후)
          </p>
        </Link>

        {/* 탭 — 로컬푸드 / 공동구매 */}
        <div className="flex items-center gap-2 mb-5 border-b border-border">
          <button
            onClick={() => setTab("lf")}
            className={cn(
              "px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
              tab === "lf"
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            🥬 로컬푸드 <span className="ml-1 text-xs tabular-nums">({orders.length})</span>
          </button>
          <button
            onClick={() => setTab("gb")}
            className={cn(
              "px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
              tab === "gb"
                ? "border-rose-500 text-rose-700 dark:text-rose-400"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            🛒 공동구매 <span className="ml-1 text-xs tabular-nums">({gbOrders.length})</span>
          </button>
        </div>

        {/* 공동구매 탭 */}
        {tab === "gb" && !loading && (
          gbOrders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Store className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">아직 주최한 공동구매 주문이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {gbOrders.map((o) => (
                <div key={o.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${GB_STATUS_TONE[o.status] || "bg-gray-100 text-gray-700"}`}>
                      {GB_STATUS_LABEL[o.status] || o.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  {o.post && (
                    <Link
                      href={`/group-buying/${o.post_id}`}
                      className="flex gap-3 hover:bg-secondary/30 -mx-2 px-2 py-1.5 rounded transition-colors mb-3"
                    >
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {o.post.images?.[0] ? (
                          <Image src={o.post.images[0]} alt="" fill className="object-cover" unoptimized />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">
                          {o.post.product_name || o.post.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {o.unit_price.toLocaleString()}원 × {o.quantity}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground self-center" />
                    </Link>
                  )}

                  {/* 받는 사람·주소 (delivery 인 경우) */}
                  {o.receive_method === "delivery" && o.delivery_addr && (
                    <div className="text-xs bg-secondary/40 rounded-lg px-3 py-2 mb-3 leading-relaxed">
                      <p>
                        <strong>받는 사람</strong> {o.delivery_addr.recipient_name} · {o.delivery_addr.phone}
                      </p>
                      <p>
                        <strong>주소</strong> {o.delivery_addr.addr1} {o.delivery_addr.addr2}
                      </p>
                      {o.buyer_memo && (
                        <p className="mt-1"><strong>메모</strong> {o.buyer_memo}</p>
                      )}
                    </div>
                  )}

                  {/* 운송장 */}
                  {o.tracking_number && (
                    <div className="text-xs bg-indigo-50 dark:bg-indigo-950/30 rounded-lg px-3 py-2 mb-3">
                      🚚 <strong>{o.tracking_company}</strong> · 운송장{" "}
                      <span className="font-mono">{o.tracking_number}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                    <span className="text-muted-foreground">정산 예정액</span>
                    <strong>{(o.settlement_amount ?? o.amount).toLocaleString()}원</strong>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* 로딩 (공통) */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {tab === "lf" && !loading && (
          orders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Store className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">아직 판매 내역이 없습니다</p>
            </div>
          ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_TONES[order.status]}`}
                  >
                    {STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(order.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>

                {/* 아이템 */}
                <div className="space-y-2 mb-3">
                  {order.items?.map((it) => (
                    <div key={it.id} className="flex gap-3 text-sm">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {it.thumbnail_url ? (
                          <Image src={it.thumbnail_url} alt={it.title} fill className="object-cover" unoptimized />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium line-clamp-1">{it.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.unit_price.toLocaleString()}원 × {it.quantity}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 받는사람·주소 */}
                <div className="text-xs bg-secondary/40 rounded-lg px-3 py-2 mb-3 leading-relaxed">
                  <p>
                    <strong>받는 사람</strong> {order.delivery_addr.recipient_name} ·{" "}
                    {order.delivery_addr.phone}
                  </p>
                  <p>
                    <strong>주소</strong> [{order.delivery_addr.postcode || "-"}]{" "}
                    {order.delivery_addr.addr1} {order.delivery_addr.addr2}
                  </p>
                  {order.buyer_memo && (
                    <p className="mt-1">
                      <strong>메모</strong> {order.buyer_memo}
                    </p>
                  )}
                </div>

                {/* 운송장 표시 또는 입력 */}
                {order.tracking_number ? (
                  <div className="text-xs bg-indigo-50 dark:bg-indigo-950/30 rounded-lg px-3 py-2 mb-3">
                    🚚 <strong>{order.tracking_company}</strong> · 운송장{" "}
                    <span className="font-mono">{order.tracking_number}</span>
                  </div>
                ) : order.status === "paid" ? (
                  shippingFor === order.id ? (
                    <div className="rounded-lg border border-border p-3 mb-3 space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={trackForm.company}
                          onChange={(e) => setTrackForm({ ...trackForm, company: e.target.value })}
                          className="px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                        >
                          {COURIER_COMPANIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <Input
                          value={trackForm.number}
                          onChange={(e) => setTrackForm({ ...trackForm, number: e.target.value })}
                          placeholder="운송장 번호"
                          className="flex-1 text-sm h-9"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShippingFor(null)}
                          className="flex-1"
                        >
                          취소
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => submitTracking(order.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          등록
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShippingFor(order.id)}
                      className="w-full mb-3"
                    >
                      <Truck className="w-4 h-4 mr-1" />
                      운송장 등록
                    </Button>
                  )
                ) : null}

                <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                  <span className="text-muted-foreground">정산 예정액</span>
                  <strong>{(order.settlement_amount || 0).toLocaleString()}원</strong>
                </div>
              </div>
            ))}
          </div>
        )
        )}
      </main>

      <BottomNav />
    </div>
  )
}
