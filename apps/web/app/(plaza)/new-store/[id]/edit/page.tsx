"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Upload, X, Store, Loader2 } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const DEFAULT_CATEGORIES = ["음식점", "카페", "편의점", "미용실", "의류", "약국", "병원", "학원", "헬스장", "기타"]

export default function NewStoreEditPage() {
  const router = useRouter()
  const params = useParams()
  const postId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [subRegion, setSubRegion] = useState("")

  useEffect(() => {
    fetch('/api/categories?type=new_store')
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data.map((c) => c.name))
        }
      })
      .catch(() => {})
  }, [])
  const [formData, setFormData] = useState({
    store_name: "",
    description: "",
    category: "음식점",
    address: "",
    phone: "",
    opening_date: "",
    opening_event: ""
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
        router.push("/new-store")
        return
      }

      const response = await fetch(`/api/new-store/${postId}`)
      const data = await response.json()

      if (!response.ok || !data.post) {
        toast("글을 찾을 수 없습니다")
        router.push("/new-store")
        return
      }

      // 소유권 확인
      if (!isAdmin && data.post.user_id !== user.id) {
        toast("수정 권한이 없습니다")
        router.push("/new-store")
        return
      }

      const post = data.post
      setFormData({
        store_name: post.store_name || "",
        description: post.description || "",
        category: post.category || "음식점",
        address: post.address || "",
        phone: post.phone || "",
        opening_date: post.opening_date || "",
        opening_event: post.opening_event || ""
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

    if (!formData.store_name || !formData.description || !formData.address) {
      toast("필수 항목을 모두 입력해주세요")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/new-store/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          opening_date: formData.opening_date || null,
          images: images.length > 0 ? images : null,
          sub_region: subRegion || null
        })
      })

      if (response.ok) {
        toast.success("수정되었습니다")
        router.replace("/new-store")
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
          <Link href={`/new-store/${postId}`} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Store className="w-5 h-5 text-amber-500" />
            신장개업 수정
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* 이미지 업로드 */}
        <div>
          <label className="block text-sm font-medium mb-2">매장 사진 (최대 10장)</label>
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

        {/* 매장명 */}
        <div>
          <label className="block text-sm font-medium mb-2">매장명 *</label>
          <input
            type="text"
            value={formData.store_name}
            onChange={(e) => setFormData(prev => ({ ...prev, store_name: e.target.value }))}
            placeholder="매장 이름을 입력하세요"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        {/* 카테고리 */}
        <div>
          <label className="block text-sm font-medium mb-2">업종</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Region (sub_region) */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 주소 */}
        <div>
          <label className="block text-sm font-medium mb-2">매장 위치 *</label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
            placeholder="매장 주소를 입력하세요"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        {/* 전화번호 */}
        <div>
          <label className="block text-sm font-medium mb-2">전화번호</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="033-000-0000"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* 오픈일 */}
        <div>
          <label className="block text-sm font-medium mb-2">오픈일</label>
          <input
            type="date"
            value={formData.opening_date}
            onChange={(e) => setFormData(prev => ({ ...prev, opening_date: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* 오픈 이벤트 */}
        <div>
          <label className="block text-sm font-medium mb-2">오픈 이벤트</label>
          <input
            type="text"
            value={formData.opening_event}
            onChange={(e) => setFormData(prev => ({ ...prev, opening_event: e.target.value }))}
            placeholder="예: 오픈 기념 전 메뉴 20% 할인!"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium mb-2">매장 소개 *</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="매장에 대해 소개해주세요"
            rows={5}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            required
          />
        </div>

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
