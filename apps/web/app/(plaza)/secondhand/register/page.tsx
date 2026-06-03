"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { useBeforeUnload } from "@/hooks/use-before-unload"
import {ArrowLeft, ShoppingBag, Gift} from "lucide-react"
import { MediaUploader } from "@/components/media-uploader"
import Link from "next/link"
import { SECONDHAND_CATEGORIES } from "@/lib/constants/secondhand"
import { SECONDHAND_CONDITIONS } from "@gwangjang/features/secondhand"
import { RegisterConsentBlock } from "@/components/legal/register-consent-block"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

export default function SecondhandRegisterPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [images, setImages] = useState<string[]>([])
  const [consented, setConsented] = useState(false)
  const [postAsSharing, setPostAsSharing] = useState(false)
  const [subRegion, setSubRegion] = useState("")
  // 거래방식 — ?type=auction|rental 이면 경매/대여 모드
  const [listingType, setListingType] = useState<"sale" | "auction" | "rental">("sale")
  const [auctionStartPrice, setAuctionStartPrice] = useState("")
  const [auctionDays, setAuctionDays] = useState("7")
  // 대여 모드
  const [rentalDaily, setRentalDaily] = useState("")
  const [rentalDeposit, setRentalDeposit] = useState("")
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("type")
    if (t === "auction" || t === "rental") setListingType(t)
  }, [])
  const titleRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)
  // 검증 실패 시 해당 필드로 포커스+스크롤 — 토스트만으로는 어느 칸이 문제인지 모름
  const focusField = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    ref.current?.focus({ preventScroll: true })
  }
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: SECONDHAND_CATEGORIES[0] as string,
    price: "",
    isPriceNegotiable: false,
    location: "",
    condition: "" as string,
    brand: "",
    model_year: "",
    horsepower: "",
    usage_hours: "",
  })



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!formData.title) {
      toast("제목을 입력해주세요")
      focusField(titleRef)
      return
    }
    if (!formData.description) {
      toast("설명을 입력해주세요")
      focusField(descRef)
      return
    }

    const priceNum = listingType === "auction"
      ? parseInt(auctionStartPrice || "0", 10)
      : listingType === "rental"
      ? parseInt(rentalDaily || "0", 10)
      : (formData.price === "" ? 0 : parseInt(formData.price, 10))
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast("올바른 가격을 입력해주세요 (0 이상의 숫자)")
      focusField(priceRef)
      return
    }
    if (listingType === "auction" && priceNum <= 0) {
      toast("경매 시작가를 입력해주세요")
      return
    }
    if (listingType === "rental" && priceNum <= 0) {
      toast("일 대여료를 입력해주세요")
      return
    }

    // 0원 + "나눔으로 올리기" 체크 → 나눔 게시판으로
    const shouldPostToSharing = priceNum === 0 && postAsSharing

    setIsSubmitting(true)
    try {
      const endpoint = shouldPostToSharing ? "/api/sharing" : "/api/secondhand"
      const payload = shouldPostToSharing
        ? {
            title: formData.title,
            description: formData.description,
            category: formData.category,
            images: images.length > 0 ? images : null,
            location: formData.location,
            sub_region: subRegion || null,
          }
        : {
            title: formData.title,
            description: formData.description,
            category: formData.category,
            price: priceNum,
            isPriceNegotiable: formData.isPriceNegotiable,
            images: images.length > 0 ? images : null,
            location: formData.location,
            condition: formData.condition || null,
            brand: formData.brand || null,
            model_year: formData.model_year || null,
            horsepower: formData.horsepower || null,
            usage_hours: formData.usage_hours || null,
            listing_type: listingType,
            sub_region: subRegion || null,
          }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (response.status === 429) {
        toast("하루 3건 한도를 초과했습니다. 내일 다시 시도해주세요.")
        return
      }

      if (response.ok) {
        if (data.flagged) {
          toast("등록되었으나 관리자 검토 중입니다. 검토 후 게시됩니다.")
        } else if (shouldPostToSharing) {
          toast.success("나눔 글이 성공적으로 등록되었습니다 💝")
        } else {
          toast.success("중고거래 글이 성공적으로 등록되었습니다")
        }
        setFormDirty(false)
        const postId = data.post?.id
        if (shouldPostToSharing) {
          router.push(postId ? `/sharing/${postId}` : "/sharing")
        } else if (listingType === "auction" && postId) {
          // 경매 등록 — auction_listings 생성
          try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            const days = Math.max(1, parseInt(auctionDays || "7", 10))
            const endAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()
            const { data: au } = await (supabase as any).from("auction_listings").insert({
              post_id: postId,
              seller_id: user?.id,
              plaza_id: getCurrentPlazaClient(),
              start_price: priceNum,
              current_price: priceNum,
              bid_increment: Math.max(1000, Math.round(priceNum * 0.05 / 1000) * 1000),
              end_at: endAt,
            }).select("id").single()
            toast.success("경매가 등록되었습니다 🔨")
            router.push((au as any)?.id ? `/auction/${(au as any).id}` : "/auction")
          } catch {
            router.push("/auction")
          }
        } else if (listingType === "rental" && postId) {
          // 대여 등록 — rental_listings 생성
          try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            const { data: rl } = await (supabase as any).from("rental_listings").insert({
              post_id: postId,
              owner_id: user?.id,
              plaza_id: getCurrentPlazaClient(),
              daily_price: priceNum,
              deposit: parseInt(rentalDeposit || "0", 10) || 0,
            }).select("id").single()
            toast.success("대여 상품이 등록되었습니다 🚜")
            router.push((rl as any)?.id ? `/rental/${(rl as any).id}` : "/rental")
          } catch {
            router.push("/rental")
          }
        } else {
          router.push(postId ? `/secondhand/${postId}` : "/secondhand")
        }
      } else {
        toast.error(data.error || "등록에 실패했습니다")
      }
    } catch (error) {
      console.error("Secondhand submit error:", error)
      toast.error("등록에 실패했습니다: " + (error instanceof Error ? error.message : "알 수 없는 오류"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/secondhand" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-600" />
            중고거래 등록
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* 하루 3건 제한 안내 */}
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
          업자/스팸 방지를 위해 <strong>하루 최대 3건</strong>까지만 등록할 수 있습니다.
        </div>

        {/* 미디어 업로드 — 사진 + 동영상 + 대표이미지 지정 */}
        <div>
          <label className="block text-sm font-medium mb-2">사진 / 동영상 (최대 10장)</label>
          <MediaUploader
            value={images}
            onChange={setImages}
            folder="secondhand"
            maxItems={10}
            videoEnabled
          />
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium mb-2">제목 *</label>
          <input
            ref={titleRef}
            type="text"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="판매할 물품의 제목을 입력하세요"
            maxLength={100}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500"
            required
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{formData.title.length}/100</p>
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

        {/* 경매 설정 (경매 모드) */}
        {listingType === "auction" && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-1.5 font-bold text-primary mb-3">🔨 경매 설정</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">시작가(원)</label>
                <input
                  value={auctionStartPrice}
                  onChange={(e) => setAuctionStartPrice(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="예: 1000000"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">경매 기간(일)</label>
                <select
                  value={auctionDays}
                  onChange={(e) => setAuctionDays(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {["1", "3", "5", "7", "10", "14"].map((d) => <option key={d} value={d}>{d}일</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">마감 5분 전 입찰 시 자동 5분 연장됩니다.</p>
          </div>
        )}

        {/* 대여 설정 (대여 모드) */}
        {listingType === "rental" && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-1.5 font-bold text-primary mb-3">🚜 대여 설정</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">일 대여료(원)</label>
                <input value={rentalDaily} onChange={(e) => setRentalDaily(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" placeholder="예: 50000"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">보증금(원)</label>
                <input value={rentalDeposit} onChange={(e) => setRentalDeposit(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" placeholder="예: 200000"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">대여 신청은 일 단위로 받습니다. 보증금은 반납 후 환급.</p>
          </div>
        )}

        {/* 농기구 정보 (선택) */}
        <div>
          <label className="block text-sm font-medium mb-2">농기구 정보 <span className="text-muted-foreground font-normal">(선택)</span></label>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={formData.brand}
              onChange={(e) => setFormData((p) => ({ ...p, brand: e.target.value }))}
              placeholder="제조사 (예: 대동)"
              className="px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              value={formData.model_year}
              onChange={(e) => setFormData((p) => ({ ...p, model_year: e.target.value.replace(/[^0-9]/g, "") }))}
              inputMode="numeric"
              placeholder="연식 (예: 2019)"
              className="px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              value={formData.horsepower}
              onChange={(e) => setFormData((p) => ({ ...p, horsepower: e.target.value.replace(/[^0-9]/g, "") }))}
              inputMode="numeric"
              placeholder="마력 (예: 45)"
              className="px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              value={formData.usage_hours}
              onChange={(e) => setFormData((p) => ({ ...p, usage_hours: e.target.value.replace(/[^0-9]/g, "") }))}
              inputMode="numeric"
              placeholder="사용시간 (h)"
              className="px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
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
          <p className="text-xs text-muted-foreground mt-1">
            선택 안 해도 됩니다.
          </p>
        </div>

        {/* 가격 */}
        <div>
          <label className="block text-sm font-medium mb-2">가격 (원) *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₩</span>
            <input
              ref={priceRef}
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
          <p className="text-xs text-muted-foreground mt-1">
            0 원 입력 시 무료나눔으로 표시됩니다.
          </p>
          {(() => {
            const priceStr = formData.price.trim()
            const priceNum = priceStr === "" ? 0 : parseInt(priceStr, 10)
            const isFree = !Number.isNaN(priceNum) && priceNum === 0
            if (isFree) {
              return (
                <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={postAsSharing}
                      onChange={(e) => setPostAsSharing(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-rose-500 flex-shrink-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <Gift className="w-4 h-4 text-rose-500" />
                        <span className="text-sm font-medium text-foreground">나눔 게시판에 올리기</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        체크하면 중고거래가 아닌 <strong className="text-rose-600">나눔 게시판</strong>으로 등록됩니다.
                      </p>
                    </div>
                  </label>
                </div>
              )
            }
            return null
          })()}
          {!postAsSharing && (
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
          )}
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium mb-2">설명 *</label>
          <textarea
            ref={descRef}
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="상품 상태, 구매 시기, 거래 방법 등을 자세히 적어주세요"
            maxLength={3000}
            rows={6}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            required
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{formData.description.length}/3000</p>
        </div>

        {/* 위치 */}
        <div>
          <label className="block text-sm font-medium mb-2">거래 희망 장소</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
            placeholder="예: 춘천시 후평동"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {/* Region (sub_region) — 자동 태깅 */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 동의 체크 */}
        <RegisterConsentBlock serviceKind="secondhand" onChange={setConsented} />

        {/* 제출 */}
        <button
          type="submit"
          disabled={isSubmitting || !consented}
          className={`w-full py-3 text-white rounded-lg font-medium transition-colors disabled:opacity-50 ${
            postAsSharing
              ? "bg-rose-500 hover:bg-rose-600"
              : "bg-amber-500 hover:bg-amber-600"
          }`}
        >
          {isSubmitting
            ? "등록 중..."
            : postAsSharing
            ? "나눔 등록하기 💝"
            : "판매 등록하기"}
        </button>
      </form>
    </div>
  )
}
