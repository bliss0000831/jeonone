"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { ArrowLeft, Loader2, Leaf, Minus, Plus, ShieldCheck, Truck, Coins } from "lucide-react"
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

interface FoodPost {
  id: string
  user_id: string
  title: string
  unit: string | null
  price: number
  status: string
  images: string[]
}

const MEMO_PRESETS = [
  { v: "", l: "선택 안 함" },
  { v: "문 앞에 두고 가주세요", l: "문 앞에 두고 가주세요" },
  { v: "경비실에 맡겨주세요", l: "경비실에 맡겨주세요" },
  { v: "택배함에 넣어주세요", l: "택배함에 넣어주세요" },
  { v: "배송 전 미리 연락주세요", l: "배송 전 미리 연락주세요" },
  { v: "부재시 문 앞에 두고 가주세요", l: "부재시 문 앞에 두고 가주세요" },
  { v: "custom", l: "직접 입력" },
]

export default function LocalFoodCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [post, setPost] = useState<FoodPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [addr, setAddr] = useState({
    recipient_name: "",
    phone: "",
    postcode: "",
    addr1: "",
    addr2: "",
  })
  const [memoPreset, setMemoPreset] = useState<string>("")
  const [memoCustom, setMemoCustom] = useState("")
  const [error, setError] = useState<string | null>(null)
  // H7: 구매 동의 체크박스
  const [agreedPurchase, setAgreedPurchase] = useState(false)
  // 포인트
  const [availablePoints, setAvailablePoints] = useState<number>(0)
  const [maxPct, setMaxPct] = useState<number>(30)
  const [pointsInput, setPointsInput] = useState<string>("")

  // 최종 메모 = 프리셋 (직접입력이면 memoCustom)
  const memo =
    memoPreset === "custom" ? memoCustom : memoPreset === "" ? "" : memoPreset

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/auth/login?redirect=/local-food/${id}/checkout`)
        return
      }
      setUser(user)

      // 상품 로드
      const res = await fetch(`/api/local-food/${id}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok || !data.post) {
        toast("상품을 찾을 수 없습니다")
        router.push("/local-food")
        return
      }
      const p = data.post as FoodPost
      if (p.user_id === user.id) {
        toast("본인 상품은 구매할 수 없습니다")
        router.push(`/local-food/${id}`)
        return
      }
      if (p.status === "sold_out") {
        toast("품절된 상품입니다")
        router.push(`/local-food/${id}`)
        return
      }
      setPost(p)

      // 본인 정보로 배송지 자동 채움
      // 1차: 회원가입 시 입력한 user_metadata (full_name, phone) — 가장 신뢰할 수 있음
      // 2차: profiles 테이블 (이전 가입자 호환)
      const meta = (user.user_metadata || {}) as { full_name?: string; phone?: string }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle()
      const realName = meta.full_name || profile?.full_name || ""
      const phoneNum = meta.phone || profile?.phone || ""
      if (realName || phoneNum) {
        setAddr((prev) => ({
          ...prev,
          recipient_name: realName,
          phone: formatPhoneInput(phoneNum),
        }))
      }

      // 포인트 잔액 + 사용 정책
      const [balRes, settingRes] = await Promise.all([
        fetch("/api/points/balance", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        supabase
          .from("point_redemption_settings")
          .select("enabled, max_redemption_pct")
          .eq("category", "local_food")
          .maybeSingle(),
      ])
      if (balRes?.available) setAvailablePoints(balRes.available)
      if ((settingRes as any)?.data?.max_redemption_pct) {
        setMaxPct((settingRes as any).data.max_redemption_pct)
      }

      setLoading(false)
    }
    init()
  }, [id, router])

  const subtotal = post ? post.price * quantity : 0
  const fee = calculateFee(subtotal)
  const isFreeShipping = !!(post as any)?.free_shipping || !((post as any)?.shipping_fee)
  const shippingFee: number = isFreeShipping ? 0 : ((post as any)?.shipping_fee as number) || 0

  // 포인트 사용 — 한도: min(잔액, subtotal × maxPct%)
  const maxPointsByPct = Math.floor((subtotal * maxPct) / 100)
  const maxPoints = Math.max(0, Math.min(availablePoints, maxPointsByPct))
  const requestedPoints = Math.max(0, Math.floor(Number(pointsInput) || 0))
  const pointsApplied = Math.min(requestedPoints, maxPoints)
  const total = Math.max(0, subtotal + shippingFee - pointsApplied) // 실 결제 금액

  const submit = async () => {
    if (submitting) return          // idempotency guard — prevent double-submission
    setError(null)
    if (!addr.recipient_name.trim() || !addr.phone.trim() || !addr.addr1.trim()) {
      setError("받는 사람·연락처·주소를 모두 입력해주세요")
      return
    }
    if (quantity < 1) {
      setError("수량은 1 이상이어야 합니다")
      return
    }
    setSubmitting(true)
    try {
      // H8: 주문 직전 상품 상태 재확인 — 재고 변동·품절 방지
      const checkRes = await fetch(`/api/local-food/${id}`, { cache: "no-store" })
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        if (!checkData.post || checkData.post.status !== "available") {
          setError("죄송합니다. 해당 상품이 품절되었거나 판매 중지되었습니다.")
          setSubmitting(false)
          return
        }
      }
      // C6: idempotency key — 재시도 시 중복 주문 방지
      const idempotencyKey = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const res = await fetch("/api/local-food-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ local_food_id: id, quantity }],
          delivery_addr: addr,
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

      // ⚠️ TODO: PortOne 연동 시 → window.PortOne.requestPayment(...) 호출 후 webhook 으로 paid 전환
      // 현재는 mock-pay 엔드포인트로 즉시 결제 완료 처리 (개발용)
      const payRes = await fetch(`/api/local-food-orders/${orderId}/mock-pay`, {
        method: "POST",
      })
      const payData = await payRes.json()
      if (!payRes.ok) {
        setError(payData.error || "결제 처리 실패")
        setSubmitting(false)
        return
      }
      // 주문 완료 페이지로
      router.push(`/mypage/orders?just=${orderId}`)
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

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-0">
      <Header user={user} />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link
          href={`/local-food/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 돌아가기
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">주문/결제</h1>
            <p className="text-xs text-muted-foreground">택배 배송으로 받습니다</p>
          </div>
        </div>

        {/* 상품 카드 */}
        <div className="rounded-xl border border-border bg-card p-4 mb-5 flex gap-3">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {post.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.images[0]}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Leaf className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm line-clamp-2">{post.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {post.price.toLocaleString()}원{post.unit ? ` / ${post.unit}` : ""}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-secondary"
                aria-label="수량 감소"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-medium w-6 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-secondary"
                aria-label="수량 증가"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 배송지 */}
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
                // 지번 주소 우선 (배송 안정성)
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
              placeholder="동/호수, 건물명 등"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">배송 메모 (선택)</Label>
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
                placeholder="배송 시 요청사항을 입력해주세요"
                rows={2}
                className="mt-2"
                maxLength={500}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* 포인트 사용 — 항상 노출 (잔액 0 일 때도 안내) */}
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
                  // 한도 초과 시 자동 클램핑
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
                size="default"
                onClick={() => setPointsInput(String(maxPoints))}
                disabled={maxPoints === 0}
                className="whitespace-nowrap"
              >
                전체 사용
              </Button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                결제액의 {maxPct}% 까지 (최대 {maxPoints.toLocaleString()}P)
              </span>
              {pointsApplied > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  -{pointsApplied.toLocaleString()}원 할인
                </span>
              )}
            </div>
            {availablePoints === 0 && (
              <p className="text-[11px] text-muted-foreground">
                💡 글 작성·댓글·매물 등록 등 활동을 하면 포인트가 적립됩니다.{" "}
                <Link href="/mypage/points" className="text-primary hover:underline">
                  포인트 내역 보기
                </Link>
              </p>
            )}
          </div>
        </div>

        {/* 결제 정보 */}
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
                {isFreeShipping ? "무료배송" : `+${shippingFee.toLocaleString()}원`}
              </span>
            </div>
            {pointsApplied > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span className="flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5" />
                  포인트 사용
                </span>
                <span>-{pointsApplied.toLocaleString()}원</span>
              </div>
            )}
            <div className="border-t border-border pt-2 mt-2 flex justify-between text-base font-bold">
              <span>총 결제 금액</span>
              <span className="text-primary">{total.toLocaleString()}원</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400 pt-1">
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3" />
                구매확정 시 적립
              </span>
              <span className="font-semibold">
                +{Math.floor(total * 0.01).toLocaleString()} P (1%)
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              플랫폼 수수료 {fee.toLocaleString()}원은 정산 시 생산자에게서 차감됩니다.
            </p>
          </div>
        </div>

        {/* 안내 */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-3 mb-5">
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            🚧 <strong>개발 단계 안내</strong> — 현재는 실 결제가 아닌 테스트 결제로 진행됩니다.
            사업자 등록·PortOne 연동 후 실제 결제로 전환됩니다.
          </p>
        </div>

        {/* H7: 구매 동의 */}
        <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreedPurchase}
            onChange={(e) => setAgreedPurchase(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            주문 내용을 확인하였으며,{" "}
            <Link href="/terms" className="underline hover:text-primary">이용약관</Link> 및{" "}
            <Link href="/privacy" className="underline hover:text-primary">개인정보 처리방침</Link>에
            동의합니다. (필수)
          </span>
        </label>

        {error && (
          <div className="px-3 py-2 mb-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}
      </main>

      {/* 결제 버튼 — 하단 고정 */}
      <div className="fixed bottom-0 left-0 right-0 md:relative md:max-w-2xl md:mx-auto bg-background border-t border-border md:border-0 px-4 py-3 md:py-0 md:pb-6 z-40">
        <Button
          size="lg"
          onClick={submit}
          disabled={submitting || !agreedPurchase}
          className="w-full h-12 text-base font-medium bg-primary hover:bg-primary/90 gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "결제 진행 중..." : `${total.toLocaleString()}원 결제하기`}
        </Button>
      </div>

      <BottomNav />
    </div>
  )
}
