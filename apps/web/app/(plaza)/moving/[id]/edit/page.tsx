"use client"

import { useState, useEffect, use } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ChevronLeft, Plus, X, Truck, Package, Building, Car, MoreHorizontal, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AddressSearch } from "@/components/address-search"
import { cn } from "@/lib/utils"
import { koreaRegions } from "@/lib/constants/korea-regions"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const categories = [
  { value: "가정이사", label: "가정이사", icon: Truck, description: "가정집 이사 전문" },
  { value: "원룸이사", label: "원룸이사", icon: Package, description: "원룸, 소형 이사" },
  { value: "사무실이사", label: "사무실이사", icon: Building, description: "사무실, 상업 이사" },
  { value: "용달이사", label: "용달이사", icon: Car, description: "용달차 이사" },
  { value: "기타", label: "기타", icon: MoreHorizontal, description: "기타 이사 서비스" },
]

interface EditMovingPageProps {
  params: Promise<{ id: string }>
}

export default function EditMovingPage({ params }: EditMovingPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [user, setUser] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "가정이사",
    service_region: "",
    service_district: "",
    service_dong: "",
    contact_phone: "",
    min_price: "",
    max_price: "",
    price_unit: "만원",
    career_years: "",
  })
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [subRegion, setSubRegion] = useState("")

  useEffect(() => {
    const fetchPost = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/auth/login?redirect=/moving/${id}/edit`)
        return
      }
      
      setUser(user)

      const { data: post, error } = await supabase
        .from("moving_posts")
        .select("*")
        .eq("id", id)
        .single()

      if (error || !post) {
        toast("포스트를 찾을 수 없습니다")
        router.push("/moving")
        return
      }

      if (post.user_id !== user.id) {
        toast("수정 권한이 없습니다")
        router.push(`/moving/${id}`)
        return
      }

      setFormData({
        title: post.title || "",
        content: post.content || "",
        category: post.category || "가정이사",
        service_region: post.service_region || "",
        service_district: post.service_district || "",
        service_dong: post.service_dong || "",
        contact_phone: post.contact_phone || "",
        min_price: post.min_price?.toString() || "",
        max_price: post.max_price?.toString() || "",
        price_unit: post.price_unit || "만원",
        career_years: post.career_years?.toString() || "",
      })
      setImages(post.images || [])
      setSubRegion((post as any).sub_region || "")
      setFetching(false)
    }

    fetchPost()
  }, [id, router])

  const selectedRegion = koreaRegions.find(r => r.name === formData.service_region)
  const districts = selectedRegion?.subRegions?.map(r => r.name) || []
  const selectedDistrict = selectedRegion?.subRegions?.find(r => r.name === formData.service_district)
  const dongs = selectedDistrict?.subRegions?.map(r => r.name) || []

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    setUploading(true)
    
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData()
        formData.append("file", file)
        
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })
        
        const data = await response.json()
        
        if (!response.ok) {
          console.error('Upload error:', data.error)
          continue
        }
        
        setImages(prev => [...prev, data.url])
      } catch (error) {
        console.error('Upload error:', error)
      }
    }
    setUploading(false)
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title || !formData.content) {
      toast("제목과 내용을 입력해주세요")
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/moving/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          category: formData.category,
          service_region: formData.service_region || null,
          service_district: formData.service_district || null,
          service_dong: formData.service_dong || null,
          contact_phone: formData.contact_phone || null,
          min_price: formData.min_price ? parseInt(formData.min_price) : null,
          max_price: formData.max_price ? parseInt(formData.max_price) : null,
          price_unit: formData.price_unit,
          career_years: formData.career_years ? parseInt(formData.career_years) : null,
          images: images.length > 0 ? images : null,
          sub_region: subRegion || null,
        })
      })

      const data = await response.json()

      if (response.ok) {
        router.push(`/moving/${id}`)
      } else {
        toast.error(data.error || "수정에 실패했습니다")
      }
    } catch (error) {
      console.error("수정 실패:", error)
      toast.error("수정에 실패했습니다")
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold">이사 서비스 수정</h1>
          <div className="w-10" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-6 max-w-2xl mx-auto pb-24">
        {/* Category Selection */}
        <div>
          <label className="block text-sm font-medium mb-3">카테고리</label>
          <div className="grid grid-cols-3 gap-2">
            {categories.map((cat) => {
              const Icon = cat.icon
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, category: cat.value }))}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors",
                    formData.category === cat.value
                      ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                      : "border-border hover:border-yellow-300"
                  )}
                >
                  <Icon className={cn("w-6 h-6", formData.category === cat.value ? "text-yellow-500" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", formData.category === cat.value ? "text-yellow-600" : "text-foreground")}>
                    {cat.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">제목</label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="서비스 제목을 입력하세요"
            maxLength={100}
          />
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium mb-2">상세 설명</label>
          <Textarea
            value={formData.content}
            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
            placeholder="제공하는 서비스에 대해 자세히 설명해주세요"
            rows={6}
          />
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium mb-2">이미지 (최대 10장)</label>
          <div className="flex gap-2 flex-wrap">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20">
                <Image src={img} alt="" width={80} height={80} className="w-full h-full object-cover rounded-lg" unoptimized />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {images.length < 10 && (
              <label className="w-20 h-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-yellow-500 transition-colors">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" multiple />
                {uploading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-500" />
                ) : (
                  <Plus className="w-6 h-6 text-muted-foreground" />
                )}
              </label>
            )}
          </div>
        </div>

        {/* Region (sub_region) */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* Service Region */}
        <div>
          <label className="block text-sm font-medium mb-2">서비스 지역</label>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={formData.service_region}
              onChange={(e) => setFormData(prev => ({ ...prev, service_region: e.target.value, service_district: "", service_dong: "" }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">시/도 선택</option>
              {koreaRegions.map((region) => (
                <option key={region.name} value={region.name}>{region.name}</option>
              ))}
            </select>
            <select
              value={formData.service_district}
              onChange={(e) => setFormData(prev => ({ ...prev, service_district: e.target.value, service_dong: "" }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              disabled={!formData.service_region}
            >
              <option value="">시/군/구 선택</option>
              {districts.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
            <select
              value={formData.service_dong}
              onChange={(e) => setFormData(prev => ({ ...prev, service_dong: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              disabled={!formData.service_district}
            >
              <option value="">읍/면/동 선택</option>
              {dongs.map((dong) => (
                <option key={dong} value={dong}>{dong}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Price Range */}
        <div>
          <label className="block text-sm font-medium mb-2">가격 범위</label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={formData.min_price}
              onChange={(e) => setFormData(prev => ({ ...prev, min_price: e.target.value }))}
              placeholder="최소"
              className="flex-1"
            />
            <span className="text-muted-foreground">~</span>
            <Input
              type="number"
              value={formData.max_price}
              onChange={(e) => setFormData(prev => ({ ...prev, max_price: e.target.value }))}
              placeholder="최대"
              className="flex-1"
            />
            <select
              value={formData.price_unit}
              onChange={(e) => setFormData(prev => ({ ...prev, price_unit: e.target.value }))}
              className="px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="만원">만원</option>
              <option value="원">원</option>
            </select>
          </div>
        </div>

        {/* Career */}
        <div>
          <label className="block text-sm font-medium mb-2">경력 (년)</label>
          <Input
            type="number"
            value={formData.career_years}
            onChange={(e) => setFormData(prev => ({ ...prev, career_years: e.target.value }))}
            placeholder="예: 8"
            min={0}
            max={99}
          />
        </div>

        {/* Contact */}
        <div>
          <label className="block text-sm font-medium mb-2">연락처</label>
          <Input
            value={formData.contact_phone}
            onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
            placeholder="010-0000-0000"
          />
        </div>

        {/* Submit */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border">
          <div className="max-w-2xl mx-auto">
            <Button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600" disabled={loading}>
              {loading ? "수정 중..." : "수정 완료"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
