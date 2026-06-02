"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import {
  ArrowLeft,
  Loader2,
  Package,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Star,
} from "lucide-react"
import { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import {
  STATUS_LABELS,
  STATUS_TONES,
  type LocalFoodOrder,
  type LocalFoodOrderItem,
} from "@/lib/local-food-orders"
import { ReviewWriteModal } from "@/components/review-write-modal"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"

type OrderWithItems = LocalFoodOrder & { items: LocalFoodOrderItem[] }
type GBOrder = {
  id: string
  post_id: string
  buyer_id: string
  seller_id: string
  status: string
  unit_price: number
  quantity: number
  amount: number
  receive_method: "pickup" | "delivery"
  tracking_company: string | null
  tracking_number: string | null
  created_at: string
  post?: {
    id: string
    title: string
    product_name: string
    images: string[] | null
    deadline: string | null
    status: string
    min_participants: number
    current_participants: number
  } | null
}

const GB_STATUS_LABEL: Record<string, string> = {
  pending: "결제 대기",
  paid: "모집 진행 중",
  group_confirmed: "모집 성공",
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

export default function MyOrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justOrderId = searchParams.get("just")
  const confirmDialog = useConfirm()
  const [user, setUser] = useState<User | null>(null)
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<{ orderId: string; sellerId: string } | null>(null)
  const [reviewedOrders, setReviewedOrders] = useState<Set<string>>(new Set())
  // 탭: type=group-buying 쿼리 또는 로컬 state
  const initialTab = searchParams.get("type") === "group-buying" ? "gb" : "lf"
  const [tab, setTab] = useState<"lf" | "gb">(initialTab)
  const [gbOrders, setGbOrders] = useState<GBOrder[]>([])

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login?redirect=/mypage/orders")
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
    // 두 종류 동시 fetch
    const [lfRes, gbRes] = await Promise.all([
      fetch("/api/local-food-orders?role=buyer", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/group-buying-orders?role=buyer", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ])
    setOrders(lfRes?.orders || [])
    setGbOrders(gbRes?.orders || [])
    // 후기 작성한 주문 (로컬푸드/공구 둘 다)
    try {
      const supabase = createClient()
      const { data: myReviews } = await supabase
        .from("reviews")
        .select("source_id")
        .in("source_type", ["local_food_order", "group_buying_order"])
      if (myReviews) {
        setReviewedOrders(
          new Set((myReviews as any[]).map((r) => r.source_id).filter(Boolean)),
        )
      }
    } catch {}
    setLoading(false)
  }

  const confirm = async (orderId: string) => {
    if (!(await confirmDialog({ description: "구매를 확정하시겠습니까? 확정 후에는 환불이 어려울 수 있습니다." }))) return
    setActing(orderId)
    const res = await fetch(`/api/local-food-orders/${orderId}/confirm`, { method: "POST" })
    if (res.ok) { await reload(); toast.success("구매를 확정했습니다") }
    else toast.error("처리 실패")
    setActing(null)
  }
  const cancel = async (orderId: string) => {
    if (!(await confirmDialog({ description: "주문을 취소하시겠습니까?", destructive: true }))) return
    setActing(orderId)
    const res = await fetch(`/api/local-food-orders/${orderId}/cancel`, { method: "POST" })
    if (res.ok) { await reload(); toast.success("주문을 취소했습니다") }
    else toast.error("처리 실패")
    setActing(null)
  }
  const refund = async (orderId: string) => {
    const reason = window.prompt("환불 사유를 입력해주세요")
    if (!reason || !reason.trim()) return
    setActing(orderId)
    const res = await fetch(`/api/local-food-orders/${orderId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    })
    if (res.ok) { await reload(); toast.success("환불 요청을 접수했습니다") }
    else toast.error("처리 실패")
    setActing(null)
  }

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

        <div className="flex items-center gap-2 mb-4">
          <Package className="w-6 h-6 text-emerald-600" />
          <h1 className="text-xl font-bold">내 구매 내역</h1>
        </div>

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

        {justOrderId && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 p-3 mb-4">
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              ✅ 결제가 완료되었습니다.{" "}
              {tab === "lf"
                ? "생산자가 발송하면 운송장 번호가 등록됩니다."
                : "모집 인원이 충족되면 주최자가 발송 안내를 드립니다."}
            </p>
          </div>
        )}

        {/* 공동구매 탭 */}
        {tab === "gb" && !loading && (
          gbOrders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">아직 공동구매 참여 내역이 없습니다</p>
              <Link href="/group-buying" className="inline-block mt-3 text-sm text-primary hover:underline">
                공동구매 둘러보기
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {gbOrders.map((o) => {
                const reviewable = o.status === "confirmed" || o.status === "settled"
                const reviewed = reviewedOrders.has(o.id)
                return (
                  <div key={o.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${GB_STATUS_TONE[o.status] || "bg-gray-100 text-gray-700"}`}>
                        {GB_STATUS_LABEL[o.status] || o.status}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("ko-KR")}
                      </span>
                    </div>

                    {/* 공구 글 + 수량 */}
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
                            {o.unit_price.toLocaleString()}원 × {o.quantity} ={" "}
                            {o.amount.toLocaleString()}원
                          </p>
                          {o.post.min_participants && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              모집 {o.post.current_participants}/{o.post.min_participants}명
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground self-center" />
                      </Link>
                    )}

                    {/* 운송장 */}
                    {o.tracking_number && (
                      <div className="text-xs bg-secondary/40 rounded-lg px-3 py-2 mb-3">
                        🚚 <strong>{o.tracking_company}</strong> · 운송장{" "}
                        <span className="font-mono">{o.tracking_number}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div className="text-sm">
                        <span className="text-muted-foreground">결제금액 </span>
                        <strong className="text-base">{o.amount.toLocaleString()}원</strong>
                      </div>
                      <div className="flex gap-2">
                        {(o.status === "pending" || o.status === "paid") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const isRefund = o.status === "paid"
                              if (!(await confirmDialog({
                                description: isRefund ? "환불을 요청하시겠습니까?" : "주문을 취소하시겠습니까?",
                                destructive: true,
                              }))) return
                              setActing(o.id)
                              const res = await fetch(`/api/group-buying-orders/${o.id}/cancel`, { method: "POST" })
                              if (res.ok) { await reload(); toast.success(isRefund ? "환불을 요청했습니다" : "주문을 취소했습니다") }
                              else toast.error("처리 실패")
                              setActing(null)
                            }}
                            disabled={acting === o.id}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            {o.status === "pending" ? "취소" : "환불요청"}
                          </Button>
                        )}
                        {reviewable && (
                          reviewed ? (
                            <Button size="sm" variant="outline" disabled className="gap-1">
                              <Star className="w-4 h-4 fill-amber-400 stroke-amber-400" />
                              후기 작성됨
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() =>
                                setReviewTarget({ orderId: o.id, sellerId: o.seller_id })
                              }
                              className="bg-amber-500 hover:bg-amber-600 text-white gap-1"
                            >
                              <Star className="w-4 h-4" />
                              후기 남기기
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* 공통 로딩 */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* 로컬푸드 탭 */}
        {tab === "lf" && !loading && (
          orders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">아직 구매한 상품이 없습니다</p>
              <Link href="/local-food" className="inline-block mt-3 text-sm text-primary hover:underline">
                로컬푸드 둘러보기
              </Link>
            </div>
          ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_TONES[order.status]}`}
                  >
                    {STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>

                {/* 아이템 */}
                <div className="space-y-2 mb-3">
                  {order.items?.map((it) => (
                    <Link
                      key={it.id}
                      href={`/local-food/${it.local_food_id}`}
                      className="flex gap-3 hover:bg-secondary/30 -mx-2 px-2 py-1.5 rounded transition-colors"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {it.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.thumbnail_url}
                            alt={it.title}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{it.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.unit_price.toLocaleString()}원 × {it.quantity}{" "}
                          = {it.subtotal.toLocaleString()}원
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground self-center" />
                    </Link>
                  ))}
                </div>

                {/* 운송장 */}
                {order.tracking_number && (
                  <div className="text-xs bg-secondary/40 rounded-lg px-3 py-2 mb-3">
                    🚚 <strong>{order.tracking_company}</strong> · 운송장{" "}
                    <span className="font-mono">{order.tracking_number}</span>
                  </div>
                )}

                {/* 합계 + 액션 */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="text-sm">
                    <span className="text-muted-foreground">결제금액 </span>
                    <strong className="text-base">{order.amount.toLocaleString()}원</strong>
                  </div>
                  <div className="flex gap-2">
                    {order.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancel(order.id)}
                        disabled={acting === order.id}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        취소
                      </Button>
                    )}
                    {(order.status === "shipped" || order.status === "delivered") && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => refund(order.id)}
                          disabled={acting === order.id}
                        >
                          <RotateCcw className="w-4 h-4 mr-1" />
                          환불
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => confirm(order.id)}
                          disabled={acting === order.id}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          구매확정
                        </Button>
                      </>
                    )}
                    {(order.status === "paid") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refund(order.id)}
                        disabled={acting === order.id}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        환불
                      </Button>
                    )}
                    {/* 구매확정/정산 후 — 후기 남기기 (이미 작성한 주문은 비활성) */}
                    {(order.status === "confirmed" || order.status === "settled") && (
                      reviewedOrders.has(order.id) ? (
                        <Button size="sm" variant="outline" disabled className="gap-1">
                          <Star className="w-4 h-4 fill-amber-400 stroke-amber-400" />
                          후기 작성됨
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            setReviewTarget({ orderId: order.id, sellerId: order.seller_id })
                          }
                          className="bg-amber-500 hover:bg-amber-600 text-white gap-1"
                        >
                          <Star className="w-4 h-4" />
                          후기 남기기
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
        )}

        {/* 후기 작성 모달 — 로컬푸드/공구 source_type 자동 결정 */}
        {reviewTarget && (() => {
          const isGB = gbOrders.some((g) => g.id === reviewTarget.orderId)
          return (
            <ReviewWriteModal
              open={true}
              onClose={() => setReviewTarget(null)}
              reviewedUserId={reviewTarget.sellerId}
              sourceType={isGB ? "group_buying_order" : "local_food_order"}
              sourceId={reviewTarget.orderId}
              onSubmitted={() => {
                setReviewedOrders((prev) => new Set(prev).add(reviewTarget.orderId))
              }}
            />
          )
        })()}
      </main>

      <BottomNav />
    </div>
  )
}
