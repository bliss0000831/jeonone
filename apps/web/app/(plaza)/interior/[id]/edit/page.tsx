"use client"

import { useState, useEffect, use } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ChevronLeft, Plus, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AddressSearch } from "@/components/address-search"
import { cn } from "@/lib/utils"
import { koreaRegions } from "@/lib/constants/korea-regions"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

// 목록 필터(/interior)의 시공종류 옵션과 동일 (전체 제외)
const categories = [
  { value: "전체리모델링", label: "전체 리모델링" },
  { value: "부분시공", label: "부분 시공" },
  { value: "주방", label: "주방" },
  { value: "욕실", label: "욕실" },
  { value: "도배장판", label: "도배/장판" },
  { value: "바닥재", label: "바닥재" },
  { value: "타일", label: "타일" },
  { value: "붙박이장", label: "붙박이장" },
  { value: "조명전기", label: "조명/전기" },
  { value: "페인팅", label: "페인팅" },
  { value: "샷시창호", label: "샷시/창호" },
  { value: "발코니확장", label: "발코니 확장" },
  { value: "기타", label: "기타" },
]

// 목록 필터의 공간 옵션과 동일 (전체 제외)
const spaces = [
  { value: "아파트", label: "아파트" },
  { value: "빌라", label: "빌라/주택" },
  { value: "원룸", label: "원룸/오피스텔" },
  { value: "상가", label: "상가" },
  { value: "사무실", label: "사무실" },
]

// 본문에 붙여둔 [공간] 태그를 파싱/제거
const SPACE_TAG_RE = /\n*\[공간\][ \t]*([^\n]+)\s*$/

function extractSpaceFromContent(content: string): { content: string; space: string } {
  const m = content.match(SPACE_TAG_RE)
  if (!m) return { content, space: "" }
  return { content: content.replace(SPACE_TAG_RE, "").trimEnd(), space: m[1].trim() }
}

interface EditInteriorPageProps {
  params: Promise<{ id: string }>
}

export default function EditInteriorPage({ params }: EditInteriorPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [user, setUser] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "전체리모델링",
    spaces: [] as string[],
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
        router.push(`/auth/login?redirect=/interior/${id}/edit`)
        return
      }
      
      setUser(user)

      const { data: post, error } = await supabase
        .from("interior_posts")
        .select("*")
        .eq("id", id)
        .single()

      if (error || !post) {
        toast("포스트를 찾을 수 없습니다")
        router.push("/interior")
        return
      }

      if (post.user_id !== user.id) {
        toast("수정 권한이 없습니다")
        router.push(`/interior/${id}`)
        return
      }

      const { content: rawContent, space: extractedSpace } = extractSpaceFromContent(post.content || "")
      setFormData({
        title: post.title || "",
        content: rawContent,
        category: post.category || "전체리모델링",
        spaces: extractedSpace
          ? extractedSpace.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    if (images.length + files.length > 10) {
      toast("최대 10장까지 업로드할 수 있습니다.")
      return
    }
    
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
    
    if (!formData.title || !formData.content || !formData.category) {
      toast("필수 항목을 입력해주세요.")
      return
    }
    
    setLoading(true)

    // 공간은 별도 컬럼이 없으므로 본문에 "[공간] X, Y" 태그로 붙여 검색 필터에 걸리게 한다
    const contentWithSpace = formData.spaces.length > 0
      ? `${formData.content}\n\n[공간] ${formData.spaces.join(", ")}`
      : formData.content

    try {
      const response = await fetch(`/api/interior/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          content: contentWithSpace,
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
        router.push(`/interior/${id}`)
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

  const selectedRegion = koreaRegions.find(r => r.name === formData.service_region)
  const districts = selectedRegion?.subRegions?.map(r => r.name) || []
  const selectedDistrict = selectedRegion?.subRegions?.find(r => r.name === formData.service_district)
  const dongs = selectedDistrict?.subRegions?.map(r => r.name) || []

  if (fetching) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="safe-top sticky top-0 z-40 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold">인테리어 서비스 수정</h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Category */}
        <div>
          <label className="block text-sm font-medium mb-2">시공 종류 *</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, category: cat.value }))}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-sm transition-colors",
                  formData.category === cat.value
                    ? "border-purple-500 bg-purple-500 text-white"
                    : "border-border text-foreground hover:border-purple-300"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Space (복수 선택) */}
        <div>
          <label className="block text-sm font-medium mb-2">공간 (복수 선택)</label>
          <div className="flex flex-wrap gap-2">
            {spaces.map((sp) => {
              const selected = formData.spaces.includes(sp.value)
              return (
                <button
                  key={sp.value}
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    spaces: prev.spaces.includes(sp.value)
                      ? prev.spaces.filter((s) => s !== sp.value)
                      : [...prev.spaces, sp.value],
                  }))}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-sm transition-colors",
                    selected
                      ? "border-purple-500 bg-purple-500 text-white"
                      : "border-border text-foreground hover:border-purple-300"
                  )}
                >
                  {sp.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium mb-2">사진 (최대 10장)</label>
          <div className="flex flex-wrap gap-2">
            {images.map((url, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden">
                <Image src={url} alt="" fill className="object-cover" unoptimized />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 p-1 bg-black/50 rounded-full"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            {images.length < 10 && (
              <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-purple-500 transition-colors">
                <Plus className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground mt-1">
                  {uploading ? "..." : "추가"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            )}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">제목 *</label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="서비스 제목을 입력하세요"
            maxLength={100}
          />
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium mb-2">서비스 소개 *</label>
          <Textarea
            value={formData.content}
            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
            placeholder="제공하는 서비스에 대해 자세히 설명해주세요"
            rows={6}
          />
        </div>

        {/* Region (sub_region) */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 사업장 위치 — AddressSearch 단일 (앱·register 와 동일) */}
        <div>
          <label className="block text-sm font-medium mb-2">사업장 위치</label>
          <AddressSearch
            value={[formData.service_region, formData.service_district, formData.service_dong].filter(Boolean).join(" ")}
            onChange={(_addr, data) => {
              setFormData(prev => ({
                ...prev,
                service_region: data?.sido ?? "",
                service_district: data?.sigungu ?? "",
                service_dong: data?.bname ?? "",
              }))
            }}
            placeholder="주소를 검색해주세요"
          />
        </div>

        {/* Price */}
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
              className="px-3 py-2 rounded-lg border border-border bg-background"
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
            type="tel"
            value={formData.contact_phone}
            onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
            placeholder="010-0000-0000"
          />
        </div>

        {/* Submit Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border">
          <div className="max-w-2xl mx-auto">
            <Button type="submit" className="w-full bg-purple-500 hover:bg-purple-600 text-white" disabled={loading}>
              {loading ? "수정 중..." : "수정 완료"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
