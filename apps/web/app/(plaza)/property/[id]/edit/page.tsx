"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Info, Instagram, Youtube } from "lucide-react"
import { AddressSearch } from "@/components/address-search"
import { AddressMapPreview } from "@/components/address-map-preview"
import { ImageUpload } from "@/components/image-upload"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { User } from "@supabase/supabase-js"
import { isValidInstagramPostUrl, normalizeInstagramUrl } from "@/lib/integrations/instagram"
import { isValidYouTubeUrl, normalizeYouTubeUrl } from "@/lib/integrations/youtube"
import { AiVideoModal, AiVideoTriggerCard } from "@/components/ai-video-modal"
import { AI_VIDEO_UI_ENABLED } from "@/lib/ai-video/pricing"
import { PropertyPanoramaUploader } from "@/components/property-panorama-uploader"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"
import { useBeforeUnload } from "@/hooks/use-before-unload"

const propertyTypes = ["아파트", "빌라", "오피스텔", "원룸", "투룸", "주택", "펜션", "상가", "사무실", "토지"]
const transactionTypes = ["매매", "전세", "월세"]

// 가격 미리보기 함수 (만원 단위 입력 → 표시 형식)
const formatPricePreview = (value: string) => {
  const num = parseInt(value) || 0
  if (num === 0) return ""
  if (num >= 10000) {
    const uk = Math.floor(num / 10000)
    const man = num % 10000
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억`
  }
  return `${num.toLocaleString()}만원`
}
const features = [
  "역세권", "주차가능", "엘리베이터", "풀옵션", "반려동물가능", 
  "남향", "동향", "서향", "북향", "신축", "리모델링", "테라스",
  "복층", "분리형", "보안", "학군우수", "대로변", "코너"
]
const directions = ["동향", "서향", "남향", "북향", "남동향", "남서향", "북동향", "북서향"]

interface EditPropertyPageProps {
  params: Promise<{ id: string }>
}

export default function EditPropertyPage({ params }: EditPropertyPageProps) {
  const { id } = use(params)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [fetching, setFetching] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<{ account_type?: string | null; role?: string | null } | null>(null)
  const [videoModalOpen, setVideoModalOpen] = useState(false)
  const [subRegion, setSubRegion] = useState("")
  const router = useRouter()
  const supabase = createClient()

  // 계정 유형에 따른 색상 설정
  const isAgent = userProfile?.account_type === "agent"
  const themeClasses = {
    primary: isAgent ? "bg-blue-500" : "bg-green-500",
    primaryHover: isAgent ? "hover:bg-blue-600" : "hover:bg-green-600",
    border: isAgent ? "border-blue-500" : "border-green-500",
    borderHover: isAgent ? "hover:border-blue-300" : "hover:border-green-300",
    text: isAgent ? "text-blue-500" : "text-green-500",
    ring: isAgent ? "focus:ring-blue-500/50" : "focus:ring-green-500/50",
  }

  const [formData, setFormData] = useState({
    propertyType: "",
    transactionType: "",
    price: "",
    deposit: "",
    monthlyRent: "",
    maintenanceFee: "",
    area: "",
    floor: "",
    totalFloors: "",
    rooms: "1",
    bathrooms: "1",
    direction: "",
    parking: false,
    elevator: false,
    petAllowed: false,
    address: "",
    addressDetail: "",
    lat: null as number | null,
    lng: null as number | null,
    title: "",
    description: "",
    features: [] as string[],
    moveInDate: "",
    images: [] as string[],
    instagramPostUrl: "",
    youtubePostUrl: "",
    panoramaImages: [] as Array<{ url: string; title?: string | null }>,
  })

  useEffect(() => {
    const fetchProperty = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (!user) {
        router.push(`/auth/login?redirect=/property/${id}/edit`)
        return
      }

      // 사용자 프로필 가져오기 (관리자 여부 포함)
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, role")
        .eq("id", user.id)
        .single()

      setUserProfile(profile)

      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"

      const plaza = getCurrentPlazaClient()
      let propQ: any = supabase
        .from("properties")
        .select("*")
        .eq("id", id)
      if (plaza) propQ = propQ.eq("plaza_id", plaza)
      const { data: property } = await propQ.maybeSingle()

      if (!property || (!isAdmin && property.user_id !== user.id)) {
        toast("수정 권한이 없습니다")
        router.push("/my-properties")
        return
      }

      setFormData({
        propertyType: property.property_type || "",
        transactionType: property.transaction_type || "",
        price: property.price?.toString() || "",
        deposit: property.transaction_type === "월세" ? property.price?.toString() || "" : "",
        monthlyRent: property.monthly_rent?.toString() || "",
        maintenanceFee: property.maintenance_fee?.toString() || "",
        area: property.area_sqm?.toString() || "",
        floor: property.floor_info || "",
        totalFloors: property.total_floors?.toString() || "",
        rooms: property.rooms?.toString() || "1",
        bathrooms: property.bathrooms?.toString() || "1",
        direction: property.direction || "",
        parking: property.parking || false,
        elevator: property.elevator || false,
        petAllowed: property.pet_allowed || false,
        address: property.address || "",
        addressDetail: property.address_detail || "",
        lat: property.lat ?? null,
        lng: property.lng ?? null,
        title: property.title || "",
        description: property.description || "",
        features: property.features || [],
        moveInDate: property.move_in_date || "",
        images: property.images || [],
        instagramPostUrl: property.instagram_post_url || "",
        youtubePostUrl: property.youtube_post_url || "",
        panoramaImages: Array.isArray(property.panorama_images) ? property.panorama_images : [],
      })
      setSubRegion(property.sub_region || "")

      setFetching(false)
    }
    
    fetchProperty()
  }, [id, router, supabase])

  const updateFormData = (key: string, value: string | string[] | boolean | number | null) => {
    setFormData({ ...formData, [key]: value })
  }

  const toggleFeature = (feature: string) => {
    const current = formData.features
    if (current.includes(feature)) {
      updateFormData("features", current.filter(f => f !== feature))
    } else {
      updateFormData("features", [...current, feature])
    }
  }

  const handleSubmit = async () => {
    if (!user) {
      router.push(`/auth/login?redirect=/property/${id}/edit`)
      return
    }

    if (!formData.propertyType || !formData.transactionType || !formData.price || !formData.address || !formData.title || !formData.area) {
      toast("필수 항목을 모두 입력해주세요")
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          property_type: formData.propertyType,
          transaction_type: formData.transactionType,
          price: parseInt(formData.transactionType === "월세" ? formData.deposit : formData.price) || 0,
          monthly_rent: formData.transactionType === "월세" ? parseInt(formData.monthlyRent) || 0 : null,
          maintenance_fee: parseInt(formData.maintenanceFee) || 0,
          area_sqm: parseFloat(formData.area) || 0,
          floor_info: formData.floor || null,
          total_floors: parseInt(formData.totalFloors) || null,
          rooms: parseInt(formData.rooms) || 1,
          bathrooms: parseInt(formData.bathrooms) || 1,
          direction: formData.direction || null,
          parking: formData.parking,
          elevator: formData.elevator,
          pet_allowed: formData.petAllowed,
          move_in_date: /^\d{4}-\d{2}-\d{2}$/.test(formData.moveInDate) ? formData.moveInDate : null,
          address: formData.address,
          address_detail: formData.addressDetail || null,
          lat: formData.lat,
          lng: formData.lng,
          description: formData.description || null,
          features: formData.features.length > 0 ? formData.features : null,
          images: formData.images.length > 0 ? formData.images : null,
          instagram_post_url: normalizeInstagramUrl(formData.instagramPostUrl),
          youtube_post_url: normalizeYouTubeUrl(formData.youtubePostUrl),
          panorama_images: formData.panoramaImages,
          sub_region: subRegion || null,
        })
      })

      const data = await response.json()

      if (response.ok) {
        setFormDirty(false)
        router.push(`/property/${id}`)
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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24" onChange={() => setFormDirty(true)}>
      {/* Header */}
      <header className={cn("safe-top sticky top-0 z-50 bg-card border-b", isAgent ? "border-blue-200" : "border-green-200")}>
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-secondary rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-foreground">매물 수정</h1>
              <span className={cn("text-xs px-2 py-0.5 rounded-full text-white", themeClasses.primary)}>
                {isAgent ? "공인중개사" : "일반"}
              </span>
            </div>
            <div className="w-9" />
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={cn(
                  "flex-1 h-1.5 rounded-full transition-colors",
                  s <= step ? themeClasses.primary : "bg-border"
                )}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span className={step === 1 ? `${themeClasses.text} font-medium` : ""}>기본정보</span>
            <span className={step === 2 ? `${themeClasses.text} font-medium` : ""}>상세정보</span>
            <span className={step === 3 ? `${themeClasses.text} font-medium` : ""}>사진/설명</span>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Step 1: 기본정보 */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Property Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                매물 유형 <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {propertyTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateFormData("propertyType", type)}
                    className={cn(
                      "py-2.5 px-3 rounded-lg text-sm font-medium transition-colors border",
                      formData.propertyType === type
                        ? `${themeClasses.primary} text-white ${themeClasses.border}`
                        : `bg-card text-foreground border-border ${themeClasses.borderHover}`
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Transaction Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                거래 유형 <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {transactionTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateFormData("transactionType", type)}
                    className={cn(
                      "py-3 rounded-lg text-sm font-medium transition-colors border",
                      formData.transactionType === type
                        ? `${themeClasses.primary} text-white ${themeClasses.border}`
                        : `bg-card text-foreground border-border ${themeClasses.borderHover}`
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                가격 <span className="text-destructive">*</span>
              </label>
              {formData.transactionType === "월세" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        placeholder="보증금"
                        value={formData.deposit}
                        onChange={(e) => updateFormData("deposit", e.target.value)}
                        className="w-full px-4 py-3 pr-14 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">만원</span>
                    </div>
                    {formatPricePreview(formData.deposit) && (
                      <span className="text-sm font-medium text-primary whitespace-nowrap min-w-[80px]">
                        = {formatPricePreview(formData.deposit)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        placeholder="월세"
                        value={formData.monthlyRent}
                        onChange={(e) => updateFormData("monthlyRent", e.target.value)}
                        className="w-full px-4 py-3 pr-14 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">만원</span>
                    </div>
                    {formatPricePreview(formData.monthlyRent) && (
                      <span className="text-sm font-medium text-primary whitespace-nowrap min-w-[80px]">
                        = {formatPricePreview(formData.monthlyRent)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder={formData.transactionType === "전세" ? "전세금" : "매매가"}
                      value={formData.price}
                      onChange={(e) => updateFormData("price", e.target.value)}
                      className="w-full px-4 py-3 pr-14 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">만원</span>
                  </div>
                  {formatPricePreview(formData.price) && (
                    <span className="text-sm font-medium text-primary whitespace-nowrap min-w-[80px]">
                      = {formatPricePreview(formData.price)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                주소 <span className="text-destructive">*</span>
              </label>
              <div className="mb-2">
                <AddressSearch
                  value={formData.address}
                  onChange={(address) => {
                    setFormData((prev) => ({
                      ...prev,
                      address,
                      lat: null,
                      lng: null,
                    }))
                  }}
                  placeholder="주소를 검색해주세요"
                />
              </div>
              <input
                type="text"
                placeholder="상세주소 입력 (예: 123동 456호)"
                value={formData.addressDetail}
                onChange={(e) => updateFormData("addressDetail", e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-3"
              />
              <AddressMapPreview
                address={formData.address}
                onCoordsResolved={(coords) => {
                  setFormData((prev) => ({
                    ...prev,
                    lat: coords?.lat ?? null,
                    lng: coords?.lng ?? null,
                  }))
                }}
              />
            </div>

            {/* Region (sub_region) */}
            <RegionFormField value={subRegion} onChange={setSubRegion} />

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                제목 <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="매물 제목을 입력하세요"
                value={formData.title}
                onChange={(e) => updateFormData("title", e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <Button onClick={() => setStep(2)} className={cn("w-full py-6 text-base font-semibold text-white", themeClasses.primary, themeClasses.primaryHover)}>
              다음 단계
            </Button>
          </div>
        )}

        {/* Step 2: 상세정보 */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Area */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                면적 <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="전용면적"
                  value={formData.area}
                  onChange={(e) => updateFormData("area", e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">㎡</span>
              </div>
            </div>

            {/* Floor Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">층수</label>
                <input
                  type="text"
                  placeholder="예: 5층"
                  value={formData.floor}
                  onChange={(e) => updateFormData("floor", e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">전체 층수</label>
                <input
                  type="number"
                  placeholder="예: 15"
                  value={formData.totalFloors}
                  onChange={(e) => updateFormData("totalFloors", e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            {/* Rooms & Bathrooms */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">방 개수</label>
                <select
                  value={formData.rooms}
                  onChange={(e) => updateFormData("rooms", e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>{n}개</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">욕실 개수</label>
                <select
                  value={formData.bathrooms}
                  onChange={(e) => updateFormData("bathrooms", e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}개</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Direction */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">방향</label>
              <div className="grid grid-cols-4 gap-2">
                {directions.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => updateFormData("direction", formData.direction === dir ? "" : dir)}
                    className={cn(
                      "py-2 rounded-lg text-sm font-medium transition-colors border",
                      formData.direction === dir
                        ? `${themeClasses.primary} text-white ${themeClasses.border}`
                        : `bg-card text-foreground border-border ${themeClasses.borderHover}`
                    )}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            {/* Maintenance Fee */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">관리비</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="없으면 0"
                  value={formData.maintenanceFee}
                  onChange={(e) => updateFormData("maintenanceFee", e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">만원</span>
              </div>
            </div>

            {/* Options */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">옵션</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: "parking", label: "주차가능" },
                  { key: "elevator", label: "엘리베이터" },
                  { key: "petAllowed", label: "반려동물" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateFormData(key, !formData[key as keyof typeof formData])}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                      formData[key as keyof typeof formData]
                        ? `${themeClasses.primary} text-white ${themeClasses.border}`
                        : `bg-card text-foreground border-border ${themeClasses.borderHover}`
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Move-in Date */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">입주가능일</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {["즉시입주", "협의가능"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateFormData("moveInDate", option)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                      formData.moveInDate === option
                        ? `${themeClasses.primary} text-white ${themeClasses.border}`
                        : `bg-card text-foreground border-border ${themeClasses.borderHover}`
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={/^\d{4}-\d{2}-\d{2}$/.test(formData.moveInDate) ? formData.moveInDate : ""}
                onChange={(e) => updateFormData("moveInDate", e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1 py-6 text-base font-semibold">
                이전
              </Button>
              <Button onClick={() => setStep(3)} className={cn("flex-1 py-6 text-base font-semibold text-white", themeClasses.primary, themeClasses.primaryHover)}>
                다음 단계
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: 사진/설명 */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Photos */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                사진 등록
              </label>
              <ImageUpload
                images={formData.images}
                onChange={(images) => updateFormData("images", images)}
                maxImages={10}
              />
              <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>첫 번째 사진이 대표 이미지로 사용됩니다.</span>
              </p>
            </div>

            {/* 360° 가상 투어 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                360° 가상 투어 (선택)
              </label>
              <PropertyPanoramaUploader
                value={formData.panoramaImages}
                onChange={(panoramaImages) =>
                  setFormData((prev) => ({ ...prev, panoramaImages }))
                }
              />
            </div>

            {/* AI 홍보영상 생성 — 기능 비활성 상태에서 사용자 노출 X */}
            {AI_VIDEO_UI_ENABLED && isAgent && (
              <AiVideoTriggerCard
                onClick={() => setVideoModalOpen(true)}
                imagesCount={formData.images.length}
              />
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                상세 설명
              </label>
              <textarea
                placeholder="매물에 대한 상세 설명을 입력하세요&#10;&#10;예시:&#10;- 채광이 좋고 조용한 위치&#10;- 대중교통 접근성 우수&#10;- 주변 편의시설 다양"
                value={formData.description}
                onChange={(e) => updateFormData("description", e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            {/* Instagram Post URL */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-3">
                <Instagram className="w-4 h-4 text-pink-500" />
                인스타그램 게시물 URL <span className="text-xs text-muted-foreground font-normal">(선택)</span>
              </label>
              <input
                type="url"
                placeholder="https://www.instagram.com/p/Abc123/ 또는 /reel/..."
                value={formData.instagramPostUrl}
                onChange={(e) => updateFormData("instagramPostUrl", e.target.value)}
                className={cn(
                  "w-full px-4 py-3 rounded-lg border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2",
                  formData.instagramPostUrl && !isValidInstagramPostUrl(formData.instagramPostUrl)
                    ? "border-destructive focus:ring-destructive/40"
                    : `border-border ${themeClasses.ring}`,
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                매물 홍보용 인스타 포스트를 매물 페이지 안에 바로 임베드합니다 (로그인 없이 재생 가능).
                {formData.instagramPostUrl && !isValidInstagramPostUrl(formData.instagramPostUrl) && (
                  <span className="block text-destructive mt-0.5">올바른 Instagram 포스트/릴스 URL이 아닙니다.</span>
                )}
              </p>
            </div>

            {/* YouTube URL */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-3">
                <Youtube className="w-4 h-4 text-red-500" />
                유튜브 영상 URL <span className="text-xs text-muted-foreground font-normal">(선택)</span>
              </label>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=... 또는 /shorts/..."
                value={formData.youtubePostUrl}
                onChange={(e) => updateFormData("youtubePostUrl", e.target.value)}
                className={cn(
                  "w-full px-4 py-3 rounded-lg border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2",
                  formData.youtubePostUrl && !isValidYouTubeUrl(formData.youtubePostUrl)
                    ? "border-destructive focus:ring-destructive/40"
                    : `border-border ${themeClasses.ring}`,
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                매물 소개 영상 (쇼츠 포함) — 상세페이지 유튜브 버튼을 눌러 재생할 수 있습니다.
                {formData.youtubePostUrl && !isValidYouTubeUrl(formData.youtubePostUrl) && (
                  <span className="block text-destructive mt-0.5">올바른 YouTube 영상 URL이 아닙니다.</span>
                )}
              </p>
            </div>

            {/* Features */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                특징 (선택)
              </label>
              <div className="flex flex-wrap gap-2">
                {features.map((feature) => (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggleFeature(feature)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
                      formData.features.includes(feature)
                        ? `${themeClasses.primary} text-white ${themeClasses.border}`
                        : `bg-card text-foreground border-border ${themeClasses.borderHover}`
                    )}
                  >
                    {feature}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1 py-6 text-base font-semibold">
                이전
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className={cn("flex-1 py-6 text-base font-semibold text-white", themeClasses.primary, themeClasses.primaryHover)}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    수정 중...
                  </>
                ) : (
                  "수정 완료"
                )}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* AI 홍보영상 생성 모달 */}
      <AiVideoModal
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        images={formData.images}
        propertyId={id}
        property={{
          title: formData.title,
          propertyType: formData.propertyType,
          transactionType: formData.transactionType,
          price: formData.price,
          deposit: formData.deposit,
          monthlyRent: formData.monthlyRent,
          address: formData.address,
          addressDetail: formData.addressDetail,
          area: formData.area,
          floor: formData.floor,
          totalFloors: formData.totalFloors,
          description: formData.description,
        }}
      />
    </div>
  )
}
