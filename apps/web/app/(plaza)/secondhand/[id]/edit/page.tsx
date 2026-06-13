"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Upload, X, ShoppingBag, Loader2 } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { RegionFormField } from "@/components/region-form-field"
import { SECONDHAND_CATEGORIES } from "@/lib/constants/secondhand"
import { SECONDHAND_CONDITIONS } from "@gwangjang/features/secondhand"
import { toast } from "sonner"
import { useBeforeUnload } from "@/hooks/use-before-unload"

export default function SecondhandEditPage() {
  const router = useRouter()
  const params = useParams()
  const postId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [images, setImages] = useState<string[]>([])
  const [subRegion, setSubRegion] = useState("")
  const [listingType, setListingType] = useState<string>("sale")
  // 경매/대여 거래조건
  const [auctionStartPrice, setAuctionStartPrice] = useState("")
  const [auctionBuyNow, setAuctionBuyNow] = useState("")
  const [auctionDays, setAuctionDays] = useState("7")
  const [auctionBidCount, setAuctionBidCount] = useState(0)
  const [rentalDaily, setRentalDaily] = useState("")
  const [rentalDeposit, setRentalDeposit] = useState("")
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: SECONDHAND_CATEGORIES[0] as string,
    price: "",
    isPriceNegotiable: false,
    location: "",
    condition: "" as string,
  })

  useEffect(() => {
    const fetchPost = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login")
        return
      }

      const response = await fetch(`/api/secondhand/${postId}`)
      const data = await response.json()
      const p = data.post || data

      if (!response.ok || !p) {
        toast("글을 찾을 수 없습니다")
        router.push("/secondhand")
        return
      }

      // 권한 — 본인 또는 관리자
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (p.user_id !== user.id && !isAdmin) {
        toast("수정 권한이 없습니다")
        router.push("/secondhand")
        return
      }

      setFormData({
        title: p.title || "",
        description: p.description || "",
        category: p.category || SECONDHAND_CATEGORIES[0],
        price: p.price != null ? String(p.price) : "",
        isPriceNegotiable: !!p.is_price_negotiable,
        location: p.location || "",
        condition: p.condition || "",
      })
      setImages(p.images || [])
      setSubRegion(p.sub_region || "")
      setListingType(p.listing_type || "sale")
      // 경매/대여 거래조건 로드
      try {
        if (p.listing_type === "auction") {
          const { data } = await (supabase as any)
            .from("auction_listings")
            .select("start_price, buy_now_price, end_at, start_at, bid_count")
            .eq("post_id", postId)
            .maybeSingle()
          if (data) {
            setAuctionStartPrice(String(data.start_price ?? ""))
            setAuctionBuyNow(data.buy_now_price ? String(data.buy_now_price) : "")
            setAuctionBidCount(data.bid_count ?? 0)
            const ms = new Date(data.end_at).getTime() - new Date(data.start_at).getTime()
            setAuctionDays(String(Math.max(1, Math.round(ms / 86400000))))
          }
        } else if (p.listing_type === "rental") {
          const { data } = await (supabase as any)
            .from("rental_listings")
            .select("daily_price, deposit")
            .eq("post_id", postId)
            .maybeSingle()
          if (data) {
            setRentalDaily(data.daily_price ? String(data.daily_price) : "")
            setRentalDeposit(data.deposit ? String(data.deposit) : "")
          }
        }
      } catch { /* 무시 — 거래조건 로드 실패해도 제목/설명 수정 가능 */ }
      setIsLoading(false)
    }

    fetchPost()
  }, [postId, router])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (images.length >= 10) break
        try {
          const fd = new FormData()
          fd.append("file", file)
          const response = await fetch("/api/upload", { method: "POST", body: fd })
          const data = await response.json()
          if (response.ok && data.url) {
            setImages((prev) => [...prev, data.url])
            setFormDirty(true)
          } else {
            toast.error(data?.error || "이미지 업로드에 실패했어요")
          }
        } catch (err) {
          console.error("Upload error:", err)
          toast.error("이미지 업로드에 실패했어요")
        }
      }
    } finally {
      setUploading(false)
      // 같은 파일 재선택 가능하도록 input 초기화
      e.target.value = ""
    }
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
    setFormDirty(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (uploading) {
      toast("이미지 업로드가 끝난 후 다시 시도해주세요")
      return
    }

    if (!formData.title || !formData.description) {
      toast("제목과 설명을 입력해주세요")
      return
    }

    const priceNum = formData.price === "" ? 0 : parseInt(formData.price, 10)
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast("올바른 가격을 입력해주세요")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/secondhand/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          price: priceNum,
          isPriceNegotiable: formData.isPriceNegotiable,
          images: images.length > 0 ? images : null,
          location: formData.location,
          condition: formData.condition || null,
          sub_region: subRegion || null,
        }),
      })

      if (response.ok) {
        // 경매/대여 거래조건 수정 — 서버 RPC(소유자·입찰없음 검증)
        const supabase = createClient()
        if (listingType === "auction" && auctionBidCount === 0) {
          const start = parseInt(auctionStartPrice || "0", 10)
          if (!start || start <= 0) { toast.error("경매 시작가를 입력해주세요"); setIsSubmitting(false); return }
          const { data, error } = await (supabase as any).rpc("update_auction_listing", {
            p_post_id: postId,
            p_start_price: start,
            p_buy_now_price: auctionBuyNow ? parseInt(auctionBuyNow, 10) : null,
            p_days: Math.max(1, parseInt(auctionDays || "7", 10)),
          })
          if (error || !(data as any)?.ok) { toast.error((data as any)?.error || error?.message || "경매 조건 수정 실패"); setIsSubmitting(false); return }
        } else if (listingType === "rental") {
          const daily = parseInt(rentalDaily || "0", 10)
          if (!daily || daily <= 0) { toast.error("일 대여료를 입력해주세요"); setIsSubmitting(false); return }
          const { data, error } = await (supabase as any).rpc("update_rental_listing", {
            p_post_id: postId,
            p_daily_price: daily,
            p_deposit: parseInt(rentalDeposit || "0", 10) || 0,
          })
          if (error || !(data as any)?.ok) { toast.error((data as any)?.error || error?.message || "대여 조건 수정 실패"); setIsSubmitting(false); return }
        }
        setFormDirty(false)
        toast.success("수정되었습니다")
        router.replace(`/secondhand/${postId}`)
      } else {
        const data = await response.json()
        toast.error(data.error || "수정에 실패했습니다")
      }
    } catch {
      toast.error("수정에 실패했습니다")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href={`/secondhand/${postId}`} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-600" />
            농기구/자재 수정
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* 이미지 업로드 */}
        <div>
          <label className="block text-sm font-medium mb-2">사진 (최대 10장)</label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((url, index) => (
              <div key={index} className="relative w-20 h-20 flex-shrink-0">
                <Image src={url} alt="" width={80} height={80} className="w-full h-full object-cover rounded-lg" unoptimized />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {images.length < 10 && (
              <label className="w-20 h-20 flex-shrink-0 border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-amber-500 transition-colors">
                {uploading ? (
                  <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                ) : (
                  <Upload className="w-6 h-6 text-muted-foreground" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium mb-2">제목 *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            maxLength={100}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500"
            required
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">{formData.title.length}/100</p>
        </div>

        {/* 카테고리 */}
        <div>
          <label className="block text-sm font-medium mb-2">카테고리</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {SECONDHAND_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* 상품 상태 */}
        <div>
          <label className="block text-sm font-medium mb-2">상품 상태</label>
          <div className="flex flex-wrap gap-2">
            {SECONDHAND_CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    condition: prev.condition === c ? "" : c,
                  }))
                }
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  formData.condition === c
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-background text-foreground border-border hover:border-amber-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">선택 안 해도 됩니다.</p>
        </div>

        {/* 가격 — 일반 판매에서만. 경매/대여는 거래 조건을 여기서 수정 불가 */}
        {listingType === "sale" ? (
          <div>
            <label className="block text-sm font-medium mb-2">가격 (원) *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₩</span>
              <input
                type="text"
                inputMode="numeric"
                value={formData.price ? Number(formData.price).toLocaleString() : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "")
                  setFormData((prev) => ({ ...prev, price: raw }))
                }}
                placeholder="0 (무료나눔/가격제안)"
                className="w-full pl-8 pr-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isPriceNegotiable}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, isPriceNegotiable: e.target.checked }))
                }
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-sm">가격 제안 환영</span>
            </label>
          </div>
        ) : listingType === "auction" ? (
          auctionBidCount > 0 ? (
            <div>
              <label className="block text-sm font-medium mb-2">경매 상품</label>
              <div className="rounded-lg bg-muted/60 border border-border p-3 text-sm text-foreground/80 leading-relaxed">
                이미 입찰이 있어 시작가·기간 등 거래 조건은 수정할 수 없습니다. 여기서는 제목·설명·사진·카테고리만 수정됩니다.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="font-bold text-primary">🔨 경매 설정</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">시작가(원)</label>
                  <input value={auctionStartPrice} onChange={(e) => setAuctionStartPrice(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric" placeholder="예: 1000000"
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">경매 기간(일)</label>
                  <select value={auctionDays} onChange={(e) => setAuctionDays(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                    {["1", "3", "5", "7", "10", "14"].map((d) => <option key={d} value={d}>{d}일</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-muted-foreground mb-1">즉시구매가(원, 선택)</label>
                  <input value={auctionBuyNow} onChange={(e) => setAuctionBuyNow(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric" placeholder="비워두면 즉시구매 없음"
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {auctionStartPrice ? `입찰 단위 ${Math.max(1000, Math.round((parseInt(auctionStartPrice || "0", 10) * 0.05) / 1000) * 1000).toLocaleString()}원(자동) · ` : ""}
                저장 시 지금부터 선택한 기간으로 다시 시작됩니다.
              </p>
            </div>
          )
        ) : (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="font-bold text-primary">🚜 대여 설정</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">일 대여료(원)</label>
                <input value={rentalDaily} onChange={(e) => setRentalDaily(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" placeholder="예: 50000"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">보증금(원)</label>
                <input value={rentalDeposit} onChange={(e) => setRentalDeposit(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" placeholder="예: 200000"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">변경은 이후 새 예약부터 적용됩니다(기존 예약은 그대로).</p>
          </div>
        )}

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium mb-2">설명 *</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            rows={6}
            maxLength={3000}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            required
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">{formData.description.length}/3000</p>
        </div>

        {/* Region (sub_region) */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 위치 */}
        <div>
          <label className="block text-sm font-medium mb-2">거래 희망 장소</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "수정 중..." : "수정 완료"}
        </button>
      </form>
    </div>
  )
}
