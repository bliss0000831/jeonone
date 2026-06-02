"use client"

import { useState, useEffect, use } from "react"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { ArrowLeft, X, Leaf, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import Image from "next/image"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const DEFAULT_CATEGORIES = ["채소", "과일", "쌀/잡곡", "축산물", "수산물", "가공식품", "기타"]
const units = ["1kg", "500g", "100g", "1개", "1팩", "1박스", "1봉"]

export default function LocalFoodEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [subRegion, setSubRegion] = useState("")

  const [form, setForm] = useState({
    title: "",
    description: "",
    content: "",
    price: "",
    original_price: "",
    unit: "1kg",
    category: "채소",
    location: "",
    district: "",
    farm_name: "",
    shipping_fee: "",
    free_shipping: false,
    status: "available",
  })

  // 카테고리 마스터 (등록 페이지와 동일한 소스)
  useEffect(() => {
    fetch("/api/categories?type=local_food")
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data.map((c) => c.name))
        }
      })
      .catch(() => {})
  }, [])

  // 인증 + 기존 글 로드 + 권한 체크
  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/auth/login?redirect=/local-food/${id}/edit`)
        return
      }
      setUser(user)

      // 기존 글 로드
      const res = await fetch(`/api/local-food/${id}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok || !data.post) {
        toast("게시글을 찾을 수 없습니다")
        router.push("/local-food")
        return
      }
      const post = data.post

      // 권한 체크 — 본인 또는 관리자만 수정 가능
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (post.user_id !== user.id && !isAdmin) {
        toast("수정 권한이 없습니다")
        router.push(`/local-food/${id}`)
        return
      }

      setForm({
        title: post.title || "",
        description: post.description || "",
        content: post.content || "",
        price: post.price != null ? String(post.price) : "",
        original_price: post.original_price != null ? String(post.original_price) : "",
        unit: post.unit || "1kg",
        category: post.category || "채소",
        location: post.location || "",
        district: post.district || "",
        farm_name: post.farm_name || "",
        shipping_fee: post.shipping_fee != null ? String(post.shipping_fee) : "",
        free_shipping: !!post.free_shipping,
        status: post.status || "available",
      })
      setImages(Array.isArray(post.images) ? post.images : [])
      setSubRegion(post.sub_region || "")
      setIsLoading(false)
    }
    init()
  }, [id, router])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
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
          setImages((prev) => [...prev, data.url])
        } else {
          console.error("Upload error:", data.error)
        }
      } catch (err) {
        console.error("Upload error:", err)
      }
    }
    setIsUploading(false)
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.title.trim()) {
      toast("상품명을 입력해주세요")
      return
    }
    if (!form.price) {
      toast("가격을 입력해주세요")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/local-food/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: parseInt(form.price),
          original_price: form.original_price ? parseInt(form.original_price) : null,
          shipping_fee: form.free_shipping ? 0 : (form.shipping_fee ? parseInt(form.shipping_fee) : 0),
          free_shipping: form.free_shipping,
          images,
          sub_region: subRegion || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setIsSubmitting(false)
        toast.error(data.error || "수정에 실패했습니다")
        return
      }
      router.push(`/local-food/${id}`)
    } catch (error) {
      console.error("Local food edit error:", error)
      setIsSubmitting(false)
      toast.error("수정 중 오류가 발생했습니다")
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      {/* Mobile Header */}
      <div className="sticky top-[57px] z-40 bg-background border-b border-border md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-medium">로컬 푸드 수정</h1>
          <div className="w-9" />
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="hidden md:flex items-center gap-2 mb-6">
          <Leaf className="w-6 h-6 text-green-500" />
          <h1 className="text-xl font-bold text-foreground">로컬 푸드 수정</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload */}
          <div>
            <Label className="mb-2 block">상품 이미지 (최대 10장)</Label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {images.map((url, index) => (
                <div
                  key={index}
                  className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden border border-border"
                >
                  <Image src={url} alt="" fill className="object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {images.length < 10 && (
                <label className="w-24 h-24 flex-shrink-0 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                  {isUploading ? (
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">사진 추가</span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>

          {/* Category */}
          <div>
            <Label className="mb-2 block">카테고리</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, category: cat }))}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    form.category === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title" className="mb-2 block">상품명 *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="예: 춘천 직접 재배한 유기농 토마토"
              maxLength={60}
              required
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{(form.title || "").length}/60</p>
          </div>

          {/* Origin — 원산지 (location 재활용) */}
          <div>
            <Label htmlFor="origin" className="mb-2 block">원산지</Label>
            <Input
              id="origin"
              value={form.location}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, location: e.target.value }))
              }
              placeholder="예: 강원도 춘천시"
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{(form.location || "").length}/60</p>
          </div>

          {/* Farm name */}
          <div>
            <Label htmlFor="farm_name" className="mb-2 block">판매처 (선택)</Label>
            <Input
              id="farm_name"
              value={form.farm_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, farm_name: e.target.value }))
              }
              placeholder="예: 행복농원"
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground text-right mt-1">
              {(form.farm_name || "").length}/60 · 비워두면 작성자 닉네임으로 표시
            </p>
          </div>

          {/* Shipping fee */}
          <div>
            <Label htmlFor="shipping_fee" className="mb-2 block">배송비 (원)</Label>
            <Input
              id="shipping_fee"
              type="number"
              inputMode="numeric"
              value={form.free_shipping ? "" : form.shipping_fee}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, shipping_fee: e.target.value.replace(/[^0-9]/g, "") }))
              }
              placeholder={form.free_shipping ? "무료" : "예: 3000"}
              disabled={form.free_shipping}
            />
            <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.free_shipping}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, free_shipping: e.target.checked }))
                }
                className="w-4 h-4 rounded border-input"
              />
              무료배송
            </label>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="mb-2 block">간단 설명</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="상품의 특징을 간단히 소개해주세요"
            />
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price" className="mb-2 block">판매가 *</Label>
              <div className="relative">
                <Input
                  id="price"
                  type="number"
                  value={form.price}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                  placeholder="10000"
                  className="pr-8"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  원
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="original_price" className="mb-2 block">정가 (선택)</Label>
              <div className="relative">
                <Input
                  id="original_price"
                  type="number"
                  value={form.original_price}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, original_price: e.target.value }))
                  }
                  placeholder="15000"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  원
                </span>
              </div>
            </div>
          </div>

          {/* Unit */}
          <div>
            <Label className="mb-2 block">판매 단위</Label>
            <div className="flex flex-wrap gap-2">
              {units.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, unit: u }))}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    form.unit === u
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Status (수정 페이지에만 — 판매중/품절 토글) */}
          <div>
            <Label className="mb-2 block">상태</Label>
            <div className="flex gap-2">
              {[
                { v: "available", label: "판매중" },
                { v: "sold_out", label: "품절" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, status: opt.v }))}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    form.status === opt.v
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Region (sub_region) */}
          <RegionFormField value={subRegion} onChange={setSubRegion} />

          {/* Content */}
          <div>
            <Label htmlFor="content" className="mb-2 block">상세 설명</Label>
            <Textarea
              id="content"
              value={form.content}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content: e.target.value }))
              }
              placeholder="상품에 대한 상세 설명을 작성해주세요"
              rows={6}
            />
          </div>

          {/* Submit */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12"
              onClick={() => router.push(`/local-food/${id}`)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12 text-base font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting ? "저장 중..." : "수정 저장"}
            </Button>
          </div>
        </form>
      </main>

      <BottomNav />
    </div>
  )
}
