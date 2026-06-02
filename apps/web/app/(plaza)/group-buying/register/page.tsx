"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useBeforeUnload } from "@/hooks/use-before-unload"
import {ArrowLeft, ShoppingCart} from "lucide-react"
import { MediaUploader } from "@/components/media-uploader"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { RegisterConsentBlock } from "@/components/legal/register-consent-block"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

export default function GroupBuyingRegisterPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [consented, setConsented] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [unauthorizedReason, setUnauthorizedReason] = useState<null | "no-business">(null)
  const [images, setImages] = useState<string[]>([])
  const [subRegion, setSubRegion] = useState("")
  // 마감일 최소값 — 현재 시각 이후만 (과거 선택 차단). 클라에서만 계산해 하이드레이션 불일치 방지.
  const [minDeadline, setMinDeadline] = useState("")
  useEffect(() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    setMinDeadline(d.toISOString().slice(0, 16))
  }, [])
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    product_name: "",
    original_price: "",
    group_price: "",
    min_participants: "2",
    max_participants: "",
    deadline: "",
    location: "",
    delivery_mode: "delivery" as "pickup" | "delivery" | "both",
    delivery_fee: "",
    delivery_fee_mode: "separate" as "included" | "separate" | "free",
    pickup_location: "",
    pickup_time: "",
    account_info: "",  // 사용 안 함 — 항상 null 로 전송 (선결제 도입으로 입금계좌 불필요)
    visibility: "plaza" as "plaza" | "national",
    payment_required: true,
  })

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push("/auth/login")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, role")
        .eq("id", user.id)
        .single()

      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (!isAdmin && profile?.account_type !== "business") {
        setUnauthorizedReason("no-business")
        return
      }

      setIsAuthorized(true)
    }
    checkAuth()
  }, [router])

  // 사업자 미인증 시 차단 모달
  if (unauthorizedReason === "no-business") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="max-w-sm w-full bg-card border border-border rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10">
            <ShoppingCart className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-center text-foreground mb-2">
            공동구매는 사업자만 개설할 수 있어요
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-2 leading-relaxed">
            전자상거래법상 통신판매업 신고증을 보유한 사업자만 공동구매를 주최할 수 있습니다.
          </p>
          <p className="text-xs text-muted-foreground/70 text-center mb-5">
            사업자 인증을 받으시면 공동구매·로컬푸드 등 사업자 전용 기능을 이용하실 수 있어요.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/mypage/account-upgrade"
              className="w-full text-center py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
            >
              사업자 인증하기
            </Link>
            <button
              onClick={() => router.push("/group-buying")}
              className="w-full py-3 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    )
  }



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!formData.title || !formData.description || !formData.product_name || !formData.group_price) {
      toast.error("필수 항목을 모두 입력해주세요")
      return
    }

    // 가격/인원 검증 — 음수·0·소수 방지
    const groupPrice = parseInt(formData.group_price, 10)
    const minParticipants = parseInt(formData.min_participants, 10)
    if (!Number.isFinite(groupPrice) || groupPrice <= 0) {
      toast.error("공구 가격은 1원 이상의 숫자여야 합니다")
      return
    }
    if (formData.original_price) {
      const orig = parseInt(formData.original_price, 10)
      if (!Number.isFinite(orig) || orig < 0) {
          toast.error("정가는 0 이상의 숫자여야 합니다")
        return
      }
    }
    if (!Number.isFinite(minParticipants) || minParticipants < 1) {
      toast.error("최소 인원은 1명 이상이어야 합니다")
      return
    }
    if (formData.max_participants) {
      const max = parseInt(formData.max_participants, 10)
      if (!Number.isFinite(max) || max < minParticipants) {
          toast.error("최대 인원은 최소 인원보다 커야 합니다")
        return
      }
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/group-buying", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          original_price: formData.original_price ? parseInt(formData.original_price) : null,
          group_price: parseInt(formData.group_price),
          min_participants: parseInt(formData.min_participants),
          max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
          deadline: formData.deadline || null,
          images: images.length > 0 ? images : null,
          delivery_mode: formData.delivery_mode,
          delivery_fee: formData.delivery_fee_mode === "free" ? 0 : (formData.delivery_fee ? parseInt(formData.delivery_fee) : 0),
          delivery_fee_mode: formData.delivery_fee_mode,
          pickup_location: null,
          pickup_time: null,
          account_info: null,
          sub_region: subRegion || null,
        })
      })

      if (response.ok) {
        const data = await response.json()
        toast.success("등록되었습니다")
        setFormDirty(false)
        const postId = data.post?.id
        router.push(postId ? `/group-buying/${postId}` : "/group-buying")
      } else {
        const data = await response.json()
        toast.error(data.error || "등록에 실패했습니다")
      }
    } catch (error) {
      toast.error("등록에 실패했습니다")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/group-buying" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-500" />
            공동구매 등록
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* 미디어 업로드 — 사진 + 동영상 + 대표이미지 지정 */}
        <div>
          <label className="block text-sm font-medium mb-2">사진 / 동영상 (최대 10장)</label>
          <MediaUploader
            value={images}
            onChange={setImages}
            folder="group_buying"
            maxItems={10}
            videoEnabled
          />
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium mb-2">공동구매 제목 *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="예: 춘천 사과 공동구매"
            maxLength={80}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{formData.title.length}/80</p>
        </div>

        {/* 상품명 */}
        <div>
          <label className="block text-sm font-medium mb-2">상품명 *</label>
          <input
            type="text"
            value={formData.product_name}
            onChange={(e) => setFormData(prev => ({ ...prev, product_name: e.target.value }))}
            placeholder="예: 춘천 명물 사과 10kg"
            maxLength={80}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        {/* 가격 — M11: 천 단위 콤마 표시 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">정가 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.original_price ? Number(formData.original_price).toLocaleString() : ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "")
                setFormData(prev => ({ ...prev, original_price: raw }))
              }}
              placeholder="30,000"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">공동구매가 (원) *</label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.group_price ? Number(formData.group_price).toLocaleString() : ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "")
                setFormData(prev => ({ ...prev, group_price: raw }))
              }}
              placeholder="20,000"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
        </div>

        {/* 참가자 수 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">최소 인원 *</label>
            <input
              type="number"
              value={formData.min_participants}
              onChange={(e) => setFormData(prev => ({ ...prev, min_participants: e.target.value }))}
              min="2"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">최대 인원</label>
            <input
              type="number"
              value={formData.max_participants}
              onChange={(e) => setFormData(prev => ({ ...prev, max_participants: e.target.value }))}
              placeholder="제한 없음"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* 마감일 */}
        <div>
          <label className="block text-sm font-medium mb-2">모집 마감일</label>
          <input
            type="datetime-local"
            value={formData.deadline}
            min={minDeadline || undefined}
            onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium mb-2">상세 설명 *</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="공동구매 상품에 대해 자세히 설명해주세요"
            maxLength={3000}
            rows={5}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            required
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{formData.description.length}/3000</p>
        </div>

        {/* Region (sub_region) — 자동 태깅 */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 참여 방식 폐기 — 공동구매는 항상 선결제 */}

        {/* 공개 범위 — 광장만 / 전국 */}
        <div>
          <label className="block text-sm font-medium mb-2">공개 범위 *</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "plaza" as const, l: "우리 광장만", d: "동네 사람들만 볼 수 있어요" },
              { v: "national" as const, l: "🌐 전국 공개", d: "다른 광장에서도 참여 가능 (모집 빨라짐)" },
            ]).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, visibility: opt.v }))}
                className={
                  "px-3 py-3 rounded-lg border text-left transition-colors " +
                  (formData.visibility === opt.v
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted")
                }
              >
                <div className={`text-sm font-medium ${formData.visibility === opt.v ? "text-primary" : ""}`}>
                  {opt.l}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{opt.d}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 수령 방식 토글 + 픽업 정보 제거 — 배송 전용 */}

        {/* 배송비 — 로컬푸드 스타일: input + 무료배송 체크박스 */}
        <div>
          <label className="block text-sm font-medium mb-2">배송비 (원)</label>
          <input
            type="number"
            inputMode="numeric"
            value={formData.delivery_fee_mode === "free" ? "" : formData.delivery_fee}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, delivery_fee: e.target.value.replace(/[^0-9]/g, "") }))
            }
            placeholder={formData.delivery_fee_mode === "free" ? "무료배송" : "예: 3000"}
            disabled={formData.delivery_fee_mode === "free"}
            className="w-full px-4 py-2 rounded-lg border border-border bg-background disabled:bg-muted/40 disabled:text-muted-foreground"
          />
          <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.delivery_fee_mode === "free"}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  delivery_fee_mode: e.target.checked ? "free" : "separate",
                  delivery_fee: e.target.checked ? "" : prev.delivery_fee,
                }))
              }
              className="w-4 h-4 rounded border-input"
            />
            무료배송
          </label>
        </div>

        {/* 입금 계좌 필드 제거 — 선결제(에스크로)라 불필요 */}

        {/* 동의 체크 */}
        <RegisterConsentBlock serviceKind="groupBuying" onChange={setConsented} />

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={isSubmitting || !consented}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "등록 중..." : "공동구매 등록하기"}
        </button>
      </form>
    </div>
  )
}
