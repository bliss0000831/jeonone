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
            중고거래 수정
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

        {/* 가격 */}
        <div>
          <label className="block text-sm font-medium mb-2">가격 (원) *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₩</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={formData.price}
              onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
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
