"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Upload, X, Heart, Loader2 } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const categories = ["의류", "가전", "가구", "생활용품", "식품", "도서", "유아용품", "기타"]

export default function SharingEditPage() {
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
    category: "기타",
    location: ""
  })

  useEffect(() => {
    const fetchPost = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push("/auth/login")
        return
      }

      const response = await fetch(`/api/sharing/${postId}`)
      const data = await response.json()

      if (!response.ok || !data.post) {
        toast("글을 찾을 수 없습니다")
        router.push("/sharing")
        return
      }

      // 권한 — 본인 또는 관리자
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (data.post.user_id !== user.id && !isAdmin) {
        toast("수정 권한이 없습니다")
        router.push("/sharing")
        return
      }

      setFormData({
        title: data.post.title || "",
        description: data.post.description || "",
        category: data.post.category || "기타",
        location: data.post.location || ""
      })
      setImages(data.post.images || [])
      setSubRegion(data.post.sub_region || "")
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

    if (!formData.title || !formData.description) {
      toast("제목과 설명을 입력해주세요")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/sharing/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          images: images.length > 0 ? images : null,
          sub_region: subRegion || null
        })
      })

      if (response.ok) {
        const { toast } = await import("sonner")
        toast.success("수정되었습니다")
        router.replace("/sharing")
        router.refresh()
      } else {
        const data = await response.json()
        const { toast } = await import("sonner")
        toast.error(data.error || "수정에 실패했습니다")
      }
    } catch (error) {
      const { toast } = await import("sonner")
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
          <Link href={`/sharing/${postId}`} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            나눔 수정
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 space-y-6">
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
          <label className="block text-sm font-medium mb-2">제목 *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="나눔할 물품의 제목을 입력하세요"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        {/* 카테고리 */}
        <div>
          <label className="block text-sm font-medium mb-2">카테고리</label>
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

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium mb-2">설명 *</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="나눔할 물품에 대해 설명해주세요"
            rows={5}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            required
          />
        </div>

        {/* Region (sub_region) */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 위치 */}
        <div>
          <label className="block text-sm font-medium mb-2">거래 희망 장소</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
            placeholder="예: 춘천시 후평동"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
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
