"use client"

import { useState, useEffect } from "react"
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
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"

type OrderWithItems = LocalFoodOrder & { items: LocalFoodOrderItem[] }

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
  const [loadError, setLoadError] = useState(false)
  const [refundTarget, setRefundTarget] = useState<string | null>(null)
  const [refundReason, setRefundReason] = useState("")

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
    setLoadError(false)
    try {
      const r = await fetch("/api/local-food-orders?role=buyer", { cache: "no-store" })
      if (!r.ok) throw new Error("load failed")
      const lfRes = await r.json()
      setOrders(lfRes?.orders || [])
    } catch (e) {
      console.error("[orders] load failed", e)
      setLoadError(true)
      setOrders([])
    }
    // 후기 작성한 주문 (로컬푸드)
    try {
      const supabase = createClient()
      const { data: myReviews } = await supabase
        .from("reviews")
        .select("source_id")
        .in("source_type", ["local_food_order"])
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
  // 환불 사유 입력 — window.prompt(모바일 웹뷰 먹통) 대신 앱 모달
  const submitRefund = async () => {
    const orderId = refundTarget
    const reason = refundReason.trim()
    if (!orderId || !reason) return
    setRefundTarget(null)
    setActing(orderId)
    const res = await fetch(`/api/local-food-orders/${orderId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
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

        {justOrderId && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 p-3 mb-4">
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              ✅ 결제가 완료되었습니다. 생산자가 발송하면 운송장 번호가 등록됩니다.
            </p>
          </div>
        )}

        {/* 공통 로딩 */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* 로컬푸드 주문 */}
        {!loading && (
          loadError ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">주문 내역을 불러오지 못했어요.</p>
              <button onClick={reload} className="inline-block mt-3 text-sm text-primary hover:underline">
                다시 시도
              </button>
            </div>
          ) : orders.length === 0 ? (
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
                    className={`px-2 py-0.5 rounded-full text-base font-semibold ${STATUS_TONES[order.status]}`}
                  >
                    {STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-sm text-muted-foreground">
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
                        <p className="text-base font-medium line-clamp-1">{it.title}</p>
                        <p className="text-sm text-muted-foreground">
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
                  <div className="text-sm bg-secondary/40 rounded-lg px-3 py-2 mb-3">
                    🚚 <strong>{order.tracking_company}</strong> · 운송장{" "}
                    <span className="font-mono">{order.tracking_number}</span>
                  </div>
                )}

                {/* 합계 + 액션 */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="text-base">
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
                          onClick={() => { setRefundTarget(order.id); setRefundReason("") }}
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
                        onClick={() => { setRefundTarget(order.id); setRefundReason("") }}
                        disabled={acting === order.id}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        환불
                      </Button>
                    )}
                    {/* 구매확정/정산 후 — 후기 남기기 (이미 작성한 주문은 비활성) */}
                    {(order.status === "confirmed" || order.status === "completed" || order.status === "settled") && (
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

        {/* 후기 작성 모달 — 로컬푸드 */}
        {reviewTarget && (
          <ReviewWriteModal
            open={true}
            onClose={() => setReviewTarget(null)}
            reviewedUserId={reviewTarget.sellerId}
            sourceType="local_food_order"
            sourceId={reviewTarget.orderId}
            onSubmitted={() => {
              setReviewedOrders((prev) => new Set(prev).add(reviewTarget.orderId))
            }}
          />
        )}

        {/* 환불 사유 입력 모달 — window.prompt 대체 */}
        {refundTarget && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setRefundTarget(null)} aria-hidden />
            <div className="relative w-full md:w-[420px] bg-card rounded-t-2xl md:rounded-2xl p-5">
              <h3 className="text-base font-bold mb-1">환불 요청</h3>
              <p className="text-sm text-muted-foreground mb-3">환불 사유를 입력해주세요.</p>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                maxLength={200}
                autoFocus
                placeholder="예) 상품이 파손되어 도착했어요"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setRefundTarget(null)} className="flex-1 py-2.5 rounded-xl border border-border font-bold text-muted-foreground hover:bg-secondary">
                  취소
                </button>
                <button onClick={submitRefund} disabled={!refundReason.trim()} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
                  환불 요청
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
