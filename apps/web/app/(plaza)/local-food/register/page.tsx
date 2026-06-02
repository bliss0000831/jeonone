"use client"

import { useState, useEffect } from "react"
import { useBeforeUnload } from "@/hooks/use-before-unload"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import {ArrowLeft, Leaf} from "lucide-react"
import { MediaUploader } from "@/components/media-uploader"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import Image from "next/image"
import { RegisterConsentBlock } from "@/components/legal/register-consent-block"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const DEFAULT_CATEGORIES = ["채소", "과일", "쌀/잡곡", "축산물", "수산물", "가공식품", "기타"]
const units = ["1kg", "500g", "100g", "1개", "1팩", "1박스", "1봉"]

export default function LocalFoodRegisterPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [images, setImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [subRegion, setSubRegion] = useState("")
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)

  useEffect(() => {
    fetch('/api/categories?type=local_food')
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data.map((c) => c.name))
        }
      })
      .catch(() => {})
  }, [])
  
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
  })

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push("/auth/login?redirect=/local-food/register")
        return
      }
      
      setUser(user)

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, role")
        .eq("id", user.id)
        .single()

      setUserAccountType(profile?.account_type || null)

      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (!isAdmin && profile?.account_type !== "producer") {
        toast("생산자 또는 관리자 권한이 필요합니다")
        router.push("/local-food")
      }
    }
    checkAuth()
  }, [router])



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
      const response = await fetch("/api/local-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: parseInt(form.price),
          original_price: form.original_price ? parseInt(form.original_price) : null,
          shipping_fee: form.free_shipping ? 0 : (form.shipping_fee ? parseInt(form.shipping_fee) : 0),
          free_shipping: form.free_shipping,
          images,
          sub_region: subRegion || null,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setIsSubmitting(false)
        toast.error(data.error || "등록에 실패했습니다")
        return
      }

      const postId = data?.post?.id

      toast.success("등록되었습니다")
      setFormDirty(false)
      if (postId) {
        window.location.href = `/local-food/${postId}`
      } else {
        window.location.href = "/local-food"
      }
    } catch (error) {
      console.error("Local food registration error:", error)
      setIsSubmitting(false)
      toast.error("등록 중 오류가 발생했습니다")
    }
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
          <h1 className="font-medium">로컬 푸드 등록</h1>
          <div className="w-9" />
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="hidden md:flex items-center gap-2 mb-6">
          <Leaf className="w-6 h-6 text-green-500" />
          <h1 className="text-xl font-bold text-foreground">로컬 푸드 등록</h1>
        </div>

        <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="space-y-6">
          {/* Image Upload */}
          <div>
            <Label className="mb-2 block">상품 이미지 (최대 10장)</Label>
            <MediaUploader
            value={images}
            onChange={setImages}
            folder="local_food"
            maxItems={10}
            videoEnabled
          />
          </div>

          {/* Category */}
          <div>
            <Label className="mb-2 block">카테고리</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, category: cat }))}
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
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="예: 춘천 직접 재배한 유기농 토마토"
              maxLength={60}
              required
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{form.title.length}/60</p>
          </div>

          {/* Origin — 원산지 (location 컬럼 재활용) */}
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
          </div>

          {/* Farm name */}
          <div>
            <Label htmlFor="farm_name" className="mb-2 block">
              판매처 (선택)
            </Label>
            <Input
              id="farm_name"
              value={form.farm_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, farm_name: e.target.value }))
              }
              placeholder="예: 행복농원"
              maxLength={60}
            />
            <p className="text-xs text-gray-500 mt-1">
              비워두면 카드에 작성자 닉네임으로 표시됩니다.
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
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="상품의 특징을 간단히 소개해주세요"
              maxLength={100}
            />
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price" className="mb-2 block">판매가 *</Label>
              <div className="relative">
                <Input
                  id="price"
                  type="text"
                  inputMode="numeric"
                  value={form.price ? Number(form.price).toLocaleString() : ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "")
                    setForm(prev => ({ ...prev, price: raw }))
                  }}
                  placeholder="10,000"
                  className="pr-8"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">원</span>
              </div>
            </div>
            <div>
              <Label htmlFor="original_price" className="mb-2 block">정가 (선택)</Label>
              <div className="relative">
                <Input
                  id="original_price"
                  type="text"
                  inputMode="numeric"
                  value={form.original_price ? Number(form.original_price).toLocaleString() : ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "")
                    setForm(prev => ({ ...prev, original_price: raw }))
                  }}
                  placeholder="15,000"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">원</span>
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
                  onClick={() => setForm(prev => ({ ...prev, unit: u }))}
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

          {/* Region (sub_region) — 자동 태깅 */}
          <RegionFormField value={subRegion} onChange={setSubRegion} />

          {/* Content */}
          <div>
            <Label htmlFor="content" className="mb-2 block">상세 설명</Label>
            <Textarea
              id="content"
              value={form.content}
              onChange={(e) => setForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="상품에 대한 상세 설명을 작성해주세요"
              maxLength={3000}
              rows={6}
            />
          </div>

          {/* 동의 체크 */}
          <RegisterConsentBlock serviceKind="localFood" onChange={setConsented} />

          {/* Submit */}
          <Button
            type="submit"
            className="w-full h-12 text-base font-medium"
            disabled={isSubmitting || !consented}
          >
            {isSubmitting ? "등록 중..." : "상품 등록하기"}
          </Button>
        </form>
      </main>

      <BottomNav />
    </div>
  )
}
