"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useBeforeUnload } from "@/hooks/use-before-unload"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import {ChevronLeft, Plus, Truck, Package, Building, Car, Box, MoreHorizontal} from "lucide-react"
import { MediaUploader } from "@/components/media-uploader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AddressSearch } from "@/components/address-search"
import { cn } from "@/lib/utils"
import { koreaRegions } from "@/lib/constants/korea-regions"
import { RegisterConsentBlock } from "@/components/legal/register-consent-block"
import { toast } from "sonner"

const categories = [
  { value: "가정이사", label: "가정이사", icon: Truck, description: "가정집 이사 전문" },
  { value: "원룸이사", label: "원룸이사", icon: Package, description: "원룸, 소형 이사" },
  { value: "사무실이사", label: "사무실이사", icon: Building, description: "사무실, 상업 이사" },
  { value: "용달이사", label: "용달이사", icon: Car, description: "용달차 이사" },
  { value: "포장이사", label: "포장이사", icon: Box, description: "포장부터 운반까지" },
  { value: "기타", label: "기타", icon: MoreHorizontal, description: "기타 이사 서비스" },
]

export default function MovingRegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [consented, setConsented] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [user, setUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  
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

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push("/auth/login")
        return
      }
      
      setUser(user)

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (!isAdmin && profile?.account_type !== "moving") {
        toast("이사 전문가 권한이 필요합니다")
        router.push("/")
        return
      }

      setUserProfile(profile)
      if (profile?.phone) {
        setFormData(prev => ({ ...prev, contact_phone: profile.phone ?? "" }))
      }
    }
    checkAuth()
  }, [router])

  const selectedRegion = koreaRegions.find(r => r.name === formData.service_region)
  const districts = selectedRegion?.subRegions?.map(r => r.name) || []
  const selectedDistrict = selectedRegion?.subRegions?.find(r => r.name === formData.service_district)
  const dongs = selectedDistrict?.subRegions?.map(r => r.name) || []



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (!formData.title || !formData.content) {
      toast("제목과 내용을 입력해주세요")
      return
    }

    setLoading(true)
    const supabase = createClient()

    const plaza = getCurrentPlazaClient()
    if (!plaza) {
      toast("광장 도메인에서 등록해주세요")
      return
    }

    const { error } = await supabase
      .from("moving_posts")
      .insert({
        plaza_id: plaza,
        user_id: user.id,
        title: formData.title,
        content: formData.content,
        category: formData.category,
        service_region: formData.service_region || null,
        service_district: formData.service_district || null,
        contact_phone: formData.contact_phone || null,
        min_price: formData.min_price ? parseInt(formData.min_price) : null,
        max_price: formData.max_price ? parseInt(formData.max_price) : null,
        price_unit: formData.price_unit,
          career_years: formData.career_years ? parseInt(formData.career_years) : null,
        images: images,
      })

    if (error) {
      console.error("Error:", error)
      toast.error("등록 중 오류가 발생했습니다")
    } else {
      toast.success("등록되었습니다")
      setFormDirty(false)
      router.push("/mypage")
    }
    setLoading(false)
  }

  if (!user || !userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500" />
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
          <h1 className="font-semibold">이사 서비스 등록</h1>
          <div className="w-10" />
        </div>
      </header>

      <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="p-4 space-y-6 max-w-2xl mx-auto">
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
          <p className="text-xs text-muted-foreground text-right mt-1">{formData.title.length}/100</p>
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium mb-2">상세 설명</label>
          <Textarea
            value={formData.content}
            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
            placeholder="제공하는 서비스에 대해 자세히 설명해주세요"
            maxLength={3000}
            rows={6}
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{formData.content.length}/3000</p>
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium mb-2">이미지 (최대 10장)</label>
          <MediaUploader
            value={images}
            onChange={setImages}
            folder="moving"
            maxItems={10}
            videoEnabled
          />
        </div>

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

        {/* 동의 체크 */}
        <RegisterConsentBlock serviceKind="service" onChange={setConsented} />

        {/* Submit */}
        <Button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600" disabled={loading || !consented}>
          {loading ? "등록 중..." : "등록하기"}
        </Button>
      </form>
    </div>
  )
}
