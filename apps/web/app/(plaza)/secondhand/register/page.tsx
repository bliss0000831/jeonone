"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
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

    const priceNum = formData.price === "" ? 0 : parseInt(formData.price, 10)
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast("올바른 가격을 입력해주세요 (0 이상의 숫자)")
      focusField(priceRef)
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
