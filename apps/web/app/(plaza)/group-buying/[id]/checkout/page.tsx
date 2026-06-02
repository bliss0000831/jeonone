"use client"

import { useState, useEffect, use } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import {
  ArrowLeft, Loader2, ShoppingCart, Minus, Plus,
  ShieldCheck, Truck, MapPin, Coins, Users, Clock,
} from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AddressSearch } from "@/components/address-search"
import { calculateFee } from "@/lib/local-food-orders"
import { formatPhoneInput } from "@gwangjang/features/auth"
import { toast } from "sonner"

interface GBPost {
  id: string
  user_id: string
  title: string
  product_name: string
  group_price: number
  images: string[] | null
  status: string
  payment_required: boolean
  delivery_mode: "pickup" | "delivery" | "both"
  pickup_location: string | null
  pickup_time: string | null
  deadline: string | null
  current_participants: number
  min_participants: number
  max_participants: number | null
}

const MEMO_PRESETS = [
  { v: "", l: "선택 안 함" },
  { v: "문 앞에 두고 가주세요", l: "문 앞에 두고 가주세요" },
  { v: "경비실에 맡겨주세요", l: "경비실에 맡겨주세요" },
  { v: "택배함에 넣어주세요", l: "택배함에 넣어주세요" },
  { v: "배송 전 미리 연락주세요", l: "배송 전 미리 연락주세요" },
  { v: "custom", l: "직접 입력" },
]

export default function GBCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [post, setPost] = useState<GBPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [quantity, setQuantity] = useState(1)
  // 배송 전용 — 픽업 옵션 제거. 기존 setter 는 사용 안 함.
  const [receiveMethod] = useState<"pickup" | "delivery">("delivery")
  const [addr, setAddr] = useState({
    recipient_name: "",
    phone: "",
    postcode: "",
    addr1: "",
    addr2: "",
  })
  const [memoPreset, setMemoPreset] = useState("")
  const [memoCustom, setMemoCustom] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [availablePoints, setAvailablePoints] = useState(0)
  const [maxPct, setMaxPct] = useState(30)
  const [pointsInput, setPointsInput] = useState("")

  const memo = memoPreset === "custom" ? memoCustom : memoPreset

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/auth/login?redirect=/group-buying/${id}/checkout`)
        return
      }
      setUser(user)

      const { data } = await supabase
        .from("group_buying_posts")
        .select("*")
        .eq("id", id)
        .single()
      if (!data) {
        toast("글을 찾을 수 없습니다")
        router.push("/group-buying")
        return
      }
      const p = data as GBPost
      if (p.user_id === user.id) {
        toast("본인 글에는 참여할 수 없습니다")
        router.push(`/group-buying/${id}`)
        return
      }
      if (p.status !== "recruiting") {
        toast("모집이 종료되었습니다")
        router.push(`/group-buying/${id}`)
        return
      }
      setPost(p)
      // 수령 모드 자동 결정
      // 배송 전용 — delivery_mode 무시

      // 자동 채움
      const meta = (user.user_metadata || {}) as { full_name?: string; phone?: string }
      const { data: profile } = await supabase
        .from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle()
      setAddr((prev) => ({
        ...prev,
        recipient_name: meta.full_name || profile?.full_name || "",
        phone: formatPhoneInput(meta.phone || profile?.phone || ""),
      }))

      // 포인트
      const [bal, settingRes] = await Promise.all([
        fetch("/api/points/balance", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        supabase
          .from("point_redemption_settings")
          .select("max_redemption_pct")
          .eq("category", "group_buying")
          .maybeSingle(),
      ])
      if (bal?.available) setAvailablePoints(bal.available)
      if ((settingRes as any)?.data?.max_redemption_pct) {
        setMaxPct((settingRes as any).data.max_redemption_pct)
      }
      setLoading(false)
    }
    init()
  }, [id, router])

  const subtotal = post ? post.group_price * quantity : 0
  const fee = calculateFee(subtotal)
  const feeMode = (post as any)?.delivery_fee_mode as "separate" | "included" | "free" | undefined
  const isFreeShipping = feeMode === "free" || feeMode === "included" || !((post as any)?.delivery_fee)
  const shippingFee: number = isFreeShipping ? 0 : ((post as any)?.delivery_fee as number) || 0
  const shippingLabel = feeMode === "free"
    ? "무료배송"
    : feeMode === "included"
      ? "상품가 포함"
      : shippingFee > 0
        ? `+${shippingFee.toLocaleString()}원`
        : "무료배송"
  const maxPointsByPct = Math.floor((subtotal * maxPct) / 100)
  const maxPoints = Math.max(0, Math.min(availablePoints, maxPointsByPct))
  const requestedPoints = Math.max(0, Math.floor(Number(pointsInput) || 0))
  const pointsApplied = Math.min(requestedPoints, maxPoints)
  const total = Math.max(0, subtotal + shippingFee - pointsApplied)

  const submit = async () => {
    if (submitting) return          // idempotency guard — prevent double-submission
    setError(null)
    if (receiveMethod === "delivery") {
      if (!addr.recipient_name.trim() || !addr.phone.trim() || !addr.addr1.trim()) {
        const msg = "받는 사람·연락처·주소를 모두 입력해주세요"
        setError(msg)
        toast.error(msg) // 고정 버튼 위 에러가 화면 밖일 수 있어 즉시 토스트로도 안내
        return
      }
    }
    setSubmitting(true)
    try {
      // 주문 직전 상태 재확인 — 마감/중단된 공구 결제 방지
      const checkRes = await fetch(`/api/group-buying/${id}`, { cache: "no-store" })
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        const st = checkData?.post?.status ?? checkData?.status
        if (st && st !== "recruiting") {
          setError("죄송합니다. 모집이 마감되었거나 중단된 공동구매입니다.")
          setSubmitting(false)
          return
        }
      }
      // 재시도 시 중복 주문 방지 — idempotency key (서버가 동일 키 중복 주문 차단)
      const idempotencyKey = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const res = await fetch("/api/group-buying-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: id,
          quantity,
          receive_method: receiveMethod,
          delivery_addr: receiveMethod === "delivery" ? addr : null,
          buyer_memo: memo.trim() || null,
          points_used: pointsApplied,
          idempotency_key: idempotencyKey,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "주문 생성 실패")
        setSubmitting(false)
        return
      }
      const orderId = data.order.id
      const payRes = await fetch(`/api/group-buying-orders/${orderId}/mock-pay`, {
        method: "POST",
      })
      const payData = await payRes.json()
      if (!payRes.ok) {
        setError(payData.error || "결제 처리 실패")
        setSubmitting(false)
        return
      }
      router.push(`/mypage/orders?type=group-buying&just=${orderId}`)
    } catch (e) {
      console.error(e)
      setError("주문 처리 중 오류")
      setSubmitting(false)
    }
  }

  if (loading || !post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const daysLeft = post.deadline
    ? Math.ceil((new Date(post.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-0">
      <Header user={user} />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link
          href={`/group-buying/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 돌아가기
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-sm">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">공구 참여 결제</h1>
            <p className="text-xs text-muted-foreground">미달 시 자동 환불됩니다</p>
          </div>
        </div>

        {/* 모집 현황 */}
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-3 mb-4 text-xs">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <Users className="w-4 h-4" />
            <span>
              <strong>{post.current_participants}명</strong> 참여 중 ·
              최소 <strong>{post.min_participants}명</strong> 모이면 성사
            </span>
          </div>
          {daysLeft !== null && (
            <div className="flex items-center gap-2 mt-1.5 text-rose-700 dark:text-rose-300">
              <Clock className="w-4 h-4" />
              <span>{daysLeft > 0 ? `D-${daysLeft}` : "오늘 마감"} 까지 모집</span>
            </div>
          )}
        </div>

        {/* 상품 */}
        <div className="rounded-xl border border-border bg-card p-4 mb-5 flex gap-3">
          <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {post.images?.[0] ? (
              <Image src={post.images[0]} alt="" fill className="object-cover" unoptimized />
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm line-clamp-2">{post.product_name || post.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {post.group_price.toLocaleString()}원
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-secondary"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-medium w-6 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-secondary"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 수령 방식 토글 + 픽업 안내 완전 제거 — 배송 전용 */}

        {/* 배송지 */}
        {receiveMethod === "delivery" && (
          <div className="space-y-4 mb-5">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-emerald-600" />
              배송지
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="recipient" className="text-xs">받는 사람 *</Label>
                <Input
                  id="recipient"
                  value={addr.recipient_name}
                  onChange={(e) => setAddr({ ...addr, recipient_name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="phone" className="text-xs">연락처 *</Label>
                <Input
                  id="phone"
                  value={addr.phone}
                  onChange={(e) => setAddr({ ...addr, phone: formatPhoneInput(e.target.value) })}
                  inputMode="tel"
                  placeholder="010-1234-5678"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">주소 *</Label>
              <AddressSearch
                value={addr.addr1}
                onChange={(_full, data) => {
                  if (!data) return
                  const base = data.jibunAddress || data.roadAddress || data.address
                  const withBuilding = data.buildingName
                    ? `${base} (${data.buildingName})`
                    : base
                  setAddr((prev) => ({
                    ...prev,
                    postcode: data.zonecode || "",
                    addr1: withBuilding,
                  }))
                }}
                placeholder="주소 검색하기"
              />
            </div>
            <div>
              <Label htmlFor="postcode" className="text-xs">우편번호</Label>
              <Input
                id="postcode"
                value={addr.postcode}
                readOnly
                placeholder="주소 검색 시 자동 입력"
                className="mt-1 bg-muted/40"
              />
            </div>
            <div>
              <Label htmlFor="addr2" className="text-xs">상세 주소</Label>
              <Input
                id="addr2"
                value={addr.addr2}
                onChange={(e) => setAddr({ ...addr, addr2: e.target.value })}
                placeholder="동/호수 등"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">배송 메모</Label>
              <select
                value={memoPreset}
                onChange={(e) => {
                  setMemoPreset(e.target.value)
                  if (e.target.value !== "custom") setMemoCustom("")
                }}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
              >
                {MEMO_PRESETS.map((p) => (
                  <option key={p.v} value={p.v}>{p.l}</option>
                ))}
              </select>
              {memoPreset === "custom" && (
                <Textarea
                  value={memoCustom}
                  onChange={(e) => setMemoCustom(e.target.value)}
                  rows={2}
                  className="mt-2"
                  maxLength={500}
                />
              )}
            </div>
          </div>
        )}

        {/* 포인트 */}
        <div className="rounded-xl border border-border bg-card p-4 mb-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-amber-500" />
            포인트 사용
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>보유 포인트</span>
              <span className="font-semibold text-foreground">
                {availablePoints.toLocaleString()} P
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="numeric"
                value={pointsInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "")
                  const num = Math.min(Number(v) || 0, maxPoints)
                  setPointsInput(num === 0 ? "" : String(num))
                }}
                placeholder={maxPoints === 0 ? "사용 가능한 포인트 없음" : "0"}
                className="flex-1 text-right font-mono"
                disabled={maxPoints === 0}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setPointsInput(String(maxPoints))}
                disabled={maxPoints === 0}
                className="whitespace-nowrap"
              >
                전체 사용
              </Button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>최대 {maxPct}% (={maxPoints.toLocaleString()}P)</span>
              {pointsApplied > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  -{pointsApplied.toLocaleString()}원 할인
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 결제 요약 */}
        <div className="rounded-xl border border-border bg-card p-4 mb-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            결제 금액
          </h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">상품 합계</span>
              <span>{subtotal.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">배송비</span>
              <span className={isFreeShipping ? "text-emerald-600 font-semibold" : ""}>
                {shippingLabel}
              </span>
            </div>
            {pointsApplied > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span className="flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5" /> 포인트 사용
                </span>
                <span>-{pointsApplied.toLocaleString()}원</span>
              </div>
            )}
            <div className="border-t border-border pt-2 mt-2 flex justify-between text-base font-bold">
              <span>총 결제 금액</span>
              <span className="text-primary">{total.toLocaleString()}원</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              플랫폼 수수료 {fee.toLocaleString()}원은 정산 시 주최자에게서 차감됩니다.
            </p>
          </div>
        </div>

        {/* 안내 */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-3 mb-5 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          🛡 <strong>안심 결제 안내</strong>
          <br />
          마감일까지 최소 인원 ({post.min_participants}명) 미달 시 자동 환불됩니다.
          모집 성사되면 주최자가 발송 또는 픽업 안내를 진행합니다.
          <br />
          🚧 현재는 테스트 결제 — 사업자등록·PortOne 연동 후 실 결제로 전환됩니다.
        </div>

        {error && (
          <div className="px-3 py-2 mb-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 md:relative md:max-w-2xl md:mx-auto bg-background border-t border-border md:border-0 px-4 py-3 md:py-0 md:pb-6 z-40">
        <Button
          size="lg"
          onClick={submit}
          disabled={submitting}
          className="w-full h-12 text-base font-medium bg-rose-500 hover:bg-rose-600 text-white gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "결제 진행 중..." : `${total.toLocaleString()}원 결제하고 참여`}
        </Button>
      </div>

      <BottomNav />
    </div>
  )
}
