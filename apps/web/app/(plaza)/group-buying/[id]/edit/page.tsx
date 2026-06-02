"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Upload, X, ShoppingCart, Loader2 } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

export default function GroupBuyingEditPage() {
  const router = useRouter()
  const params = useParams()
  const postId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [subRegion, setSubRegion] = useState("")
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
    delivery_fee: "",
    delivery_fee_mode: "separate" as "included" | "separate" | "free",
  })

  useEffect(() => {
    const fetchPost = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push("/auth/login")
        return
      }

      // business 계정 확인
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, role")
        .eq("id", user.id)
        .single()

      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (!isAdmin && profile?.account_type !== "business") {
        toast("사장님 계정만 수정할 수 있습니다")
        router.push("/group-buying")
        return
      }

      const response = await fetch(`/api/group-buying/${postId}`)
      const data = await response.json()

      if (!response.ok || !data.post) {
        toast("글을 찾을 수 없습니다")
        router.push("/group-buying")
        return
      }

      // 소유권 확인
      if (!isAdmin && data.post.user_id !== user.id) {
        toast("수정 권한이 없습니다")
        router.push("/group-buying")
        return
      }

      const post = data.post
      setFormData({
        title: post.title || "",
        description: post.description || "",
        product_name: post.product_name || "",
        original_price: post.original_price?.toString() || "",
        group_price: post.group_price?.toString() || "",
        min_participants: post.min_participants?.toString() || "2",
        max_participants: post.max_participants?.toString() || "",
        deadline: post.deadline ? new Date(post.deadline).toISOString().slice(0, 16) : "",
        location: post.location || "",
        delivery_fee: post.delivery_fee != null ? String(post.delivery_fee) : "",
        delivery_fee_mode: (post.delivery_fee_mode as any) || "separate",
      })
      setImages(post.images || [])
      setSubRegion(post.sub_region || "")
      setIsLoading(false)
    }

    fetchPost()
  }, [postId, router])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    for (const file of Array.from(files)) {
      if (images.length >= 10) break
      
      try {
        const formData = new FormData()
        formData.append("file", file)

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })

        const data = await response.json()

        if (response.ok && data.url) {
          setImages(prev => [...prev, data.url])
        }
      } catch (err) {
        console.error("Upload error:", err)
      }
    }
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!formData.title || !formData.description || !formData.product_name || !formData.group_price) {
      toast("필수 항목을 모두 입력해주세요")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/group-buying/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          original_price: formData.original_price ? parseInt(formData.original_price) : null,
          group_price: parseInt(formData.group_price),
          min_participants: parseInt(formData.min_participants),
          max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
          deadline: formData.deadline || null,
          delivery_fee: formData.delivery_fee_mode === "free" ? 0 : (formData.delivery_fee ? parseInt(formData.delivery_fee) : 0),
          delivery_fee_mode: formData.delivery_fee_mode,
          images: images.length > 0 ? images : null,
          sub_region: subRegion || null
        })
      })

      if (response.ok) {
        toast.success("수정되었습니다")
        router.replace("/group-buying")
      } else {
        const data = await response.json()
        toast.error(data.error || "수정에 실패했습니다")
      }
    } catch (error) {
      toast.error("수정에 실패했습니다")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href={`/group-buying/${postId}`} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-500" />
            공동구매 수정
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* 이미지 업로드 */}
        <div>
          <label className="block text-sm font-medium mb-2">상품 사진 (최대 10장)</label>
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
              <label className="w-20 h-20 flex-shrink-0 border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
                <Upload className="w-6 h-6 text-muted-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium mb-2">공동구매 제목 *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="예: 춘천 사과 공동구매"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        {/* 상품명 */}
        <div>
          <label className="block text-sm font-medium mb-2">상품명 *</label>
          <input
            type="text"
            value={formData.product_name}
            onChange={(e) => setFormData(prev => ({ ...prev, product_name: e.target.value }))}
            placeholder="예: 춘천 명물 사과 10kg"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        {/* 가격 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">정가 (원)</label>
            <input
              type="number"
              value={formData.original_price}
              onChange={(e) => setFormData(prev => ({ ...prev, original_price: e.target.value }))}
              placeholder="30000"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">공동구매가 (원) *</label>
            <input
              type="number"
              value={formData.group_price}
              onChange={(e) => setFormData(prev => ({ ...prev, group_price: e.target.value }))}
              placeholder="20000"
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
            rows={5}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            required
          />
        </div>

        {/* 배송비 — 로컬푸드 스타일 */}
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

        {/* Region (sub_region) */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "수정 중..." : "수정 완료"}
        </button>
      </form>
    </div>
  )
}
