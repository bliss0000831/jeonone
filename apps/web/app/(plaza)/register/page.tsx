"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { AddressSearch } from "@/components/address-search"
import { AddressMapPreview } from "@/components/address-map-preview"
import { ImageUpload } from "@/components/image-upload"
import { Button } from "@/components/ui/button"
import { BottomNav } from "@/components/bottom-nav"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { User } from "@supabase/supabase-js"
import { isValidInstagramPostUrl, normalizeInstagramUrl } from "@/lib/integrations/instagram"
import { isValidYouTubeUrl, normalizeYouTubeUrl } from "@/lib/integrations/youtube"
import { Instagram, Youtube } from "lucide-react"
import { AiVideoModal, AiVideoTriggerCard } from "@/components/ai-video-modal"
import { AI_VIDEO_UI_ENABLED } from "@/lib/ai-video/pricing"
import { PropertyPanoramaUploader } from "@/components/property-panorama-uploader"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

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

export default function RegisterPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<{ account_type: string | null } | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [videoModalOpen, setVideoModalOpen] = useState(false)
  const [subRegion, setSubRegion] = useState("")
  const router = useRouter()
  const supabase = createClient()

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

  // 법적 동의 — 공인중개사법·전상법 면책 근거. 4개 다 체크해야 등록 활성화.
  const [consents, setConsents] = useState({
    isOwner: false,
    notForBroker: false,
    truthful: false,
    repeatNotice: false,
  })
  const isAgent = userProfile?.account_type === "agent"
  // 공인중개사는 직거래 제약 동의 면제 (중개 자체가 업이므로). 일반회원만 4개 강제.
  const allConsented = isAgent || (consents.isOwner && consents.notForBroker && consents.truthful && consents.repeatNotice)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (!user) {
        setAuthChecking(false)
        router.push("/auth/login?redirect=/register")
        return
      }
      // 프로필 조회해서 account_type 가져오기
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .single()
      setUserProfile(profile)
      setAuthChecking(false)
    }
    checkUser()
  }, [router, supabase.auth])

  const updateFormData = (key: string, value: string | string[] | boolean | number | null) => {
    setFormData({ ...formData, [key]: value })
  }

  // 단계별 필수 필드 검증
  const canProceedFromStep = (s: number): boolean => {
    if (s === 1) {
      if (!formData.propertyType || !formData.transactionType || !formData.address) return false
      // 가격 필수 체크
      if (formData.transactionType === "월세") {
        if (!formData.deposit && !formData.monthlyRent) return false
      } else {
        if (!formData.price) return false
      }
      return true
    }
    if (s === 2) {
      return !!formData.area
    }
    return true
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
      router.push("/auth/login?redirect=/register")
      return
    }

    // ── 광장 가드 setLoading 전에 (영구 비활성화 방지)
    const plaza = getCurrentPlazaClient()
    if (!plaza) {
      toast("광장 도메인에서 등록해주세요")
      return
    }

    setLoading(true)

    try {
      // 가격 — 음수/NaN 검증, 만원 단위 저장
      const safeInt = (v: string | undefined): number | null => {
        if (!v) return 0
        const n = parseInt(v, 10)
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return null  // 음수·overflow 거절
        return n
      }
      let price = 0
      let monthlyRent: number | null = null

      if (formData.transactionType === "월세") {
        const dep = safeInt(formData.deposit)
        const mr = safeInt(formData.monthlyRent)
        if (dep === null || mr === null) {
          toast("보증금/월세 금액이 올바르지 않습니다")
          setLoading(false)
          return
        }
        price = dep
        monthlyRent = mr
      } else {
        const p = safeInt(formData.price)
        if (p === null) {
          toast("가격이 올바르지 않습니다")
          setLoading(false)
          return
        }
        price = p
      }
      if (price <= 0) {
        toast("가격은 0보다 커야 합니다")
        setLoading(false)
        return
      }

      // 서버 API 경유 — 월 2건 제한 검증 + seller_type 서버 결정
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          property_type: formData.propertyType,
          transaction_type: formData.transactionType,
          price,
          monthly_rent: monthlyRent,
          maintenance_fee: formData.maintenanceFee ? parseInt(formData.maintenanceFee) : null,
          area_sqm: parseFloat(formData.area),
          floor_info: formData.floor || null,
          total_floors: formData.totalFloors ? parseInt(formData.totalFloors) : null,
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
          description: formData.description,
          features: formData.features && formData.features.length > 0 ? formData.features : null,
          images: formData.images && formData.images.length > 0 ? formData.images : null,
          instagram_post_url: normalizeInstagramUrl(formData.instagramPostUrl) || null,
          youtube_post_url: normalizeYouTubeUrl(formData.youtubePostUrl) || null,
          panorama_images: formData.panoramaImages.length > 0 ? formData.panoramaImages : null,
          sub_region: subRegion || null,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        // 월 한도 초과 등 친절한 메시지
        if (data?.code === "monthly_limit_exceeded") {
          toast.error(data.error)
        } else {
          toast.error("매물 등록에 실패했습니다: " + (data?.error || res.statusText))
        }
      } else {
        toast.success("등록되었습니다")
        const propertyId = data.property?.id
        router.push(propertyId ? `/property/${propertyId}` : "/")
      }
    } catch (err) {
      console.error("Error:", err)
      toast.error("매물 등록 중 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  // 계정 유형에 따른 색상 설정
  const themeClasses = {
    primary: isAgent ? "bg-blue-500" : "bg-green-500",
    primaryHover: isAgent ? "hover:bg-blue-600" : "hover:bg-green-600",
    primaryLight: isAgent ? "bg-blue-50 dark:bg-blue-950" : "bg-green-50 dark:bg-green-950",
    border: isAgent ? "border-blue-500" : "border-green-500",
    borderHover: isAgent ? "hover:border-blue-500" : "hover:border-green-500",
    text: isAgent ? "text-blue-500" : "text-green-500",
    ring: isAgent ? "focus:ring-blue-500/50" : "focus:ring-green-500/50",
  }

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-8">
      {/* Header */}
      <header className={cn("safe-top sticky top-0 z-50 bg-card border-b", isAgent ? "border-blue-200" : "border-green-200")}>
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-foreground">매물 등록</h1>
              <span className={cn("text-xs px-2 py-0.5 rounded-full text-white", themeClasses.primary)}>
                {isAgent ? "공인중개사" : "일반"}
              </span>
            </div>
            <div className="w-9" />
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "flex-1 h-1 rounded-full transition-colors",
                  s <= step ? themeClasses.primary : "bg-secondary"
                )}
              />
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span className={step >= 1 ? `${themeClasses.text} font-medium` : ""}>기본정보</span>
            <span className={step >= 2 ? `${themeClasses.text} font-medium` : ""}>상세정보</span>
            <span className={step >= 3 ? `${themeClasses.text} font-medium` : ""}>사진/설명</span>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Step 1: Basic Info */}
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
                    onClick={() => updateFormData("propertyType", type)}
                    className={cn(
                      "py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors",
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
                    onClick={() => updateFormData("transactionType", type)}
                    className={cn(
                      "py-3 px-4 rounded-lg border text-sm font-medium transition-colors",
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
                {formData.transactionType === "월세" ? "보증금" : "가격"} <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.transactionType === "월세" ? formData.deposit : formData.price}
                    onChange={(e) => updateFormData(formData.transactionType === "월세" ? "deposit" : "price", e.target.value)}
                    className="w-full px-4 py-3 pr-14 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">만원</span>
                </div>
                {formatPricePreview(formData.transactionType === "월세" ? formData.deposit : formData.price) && (
                  <span className="text-sm font-medium text-primary whitespace-nowrap min-w-[80px]">
                    = {formatPricePreview(formData.transactionType === "월세" ? formData.deposit : formData.price)}
                  </span>
                )}
              </div>
            </div>

            {/* Monthly Rent (for 월세) */}
            {formData.transactionType === "월세" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  월세 <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder="0"
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
            )}

            {/* Maintenance Fee */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                관리비
              </label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0"
                  value={formData.maintenanceFee}
                  onChange={(e) => updateFormData("maintenanceFee", e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">만원</span>
              </div>
            </div>

            {/* Region (sub_region) — 자동 태깅 */}
            <RegionFormField value={subRegion} onChange={setSubRegion} />

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                주소 <span className="text-destructive">*</span>
              </label>
              <div className="mb-2">
                <AddressSearch
                  value={formData.address}
                  onChange={(address) => {
                    // 주소가 바뀌면 기존 좌표는 무효화 (재검증)
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
          </div>
        )}

        {/* Step 2: Detail Info */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Area */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                전용면적 <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0"
                  value={formData.area}
                  onChange={(e) => updateFormData("area", e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">m²</span>
              </div>
            </div>

            {/* Floor */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">해당 층</label>
                <input
                  type="text"
                  placeholder="예: 5층, 저층, 고층"
                  value={formData.floor}
                  onChange={(e) => updateFormData("floor", e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">전체 층</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.totalFloors}
                    onChange={(e) => updateFormData("totalFloors", e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">층</span>
                </div>
              </div>
            </div>

            {/* Rooms & Bathrooms */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">방 개수</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="1"
                    value={formData.rooms}
                    onChange={(e) => updateFormData("rooms", e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">개</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">욕실 개수</label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="1"
                    value={formData.bathrooms}
                    onChange={(e) => updateFormData("bathrooms", e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">개</span>
                </div>
              </div>
            </div>

            {/* Direction */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">방향</label>
              <div className="grid grid-cols-4 gap-2">
                {["남향", "동향", "서향", "북향"].map((dir) => (
                  <button
                    key={dir}
                    onClick={() => updateFormData("direction", formData.direction === dir ? "" : dir)}
                    className={cn(
                      "py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors",
                      formData.direction === dir
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:border-primary"
                    )}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            {/* Options — 토글 형태 (앱과 동일) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">옵션</label>
              <div className="space-y-2 rounded-lg border border-border bg-card divide-y divide-border">
                {[
                  { key: "parking", label: "주차 가능" },
                  { key: "elevator", label: "엘리베이터" },
                  { key: "petAllowed", label: "반려동물 가능" },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                  >
                    <span className="text-sm font-medium text-foreground">{opt.label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={(formData as any)[opt.key]}
                      onClick={() => updateFormData(opt.key as any, !(formData as any)[opt.key])}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        (formData as any)[opt.key]
                          ? "bg-primary"
                          : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                          (formData as any)[opt.key] ? "translate-x-5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </label>
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
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:border-primary/50"
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
              <p className="mt-2 text-xs text-muted-foreground">
                버튼을 선택하거나 날짜를 직접 지정하세요
              </p>
            </div>

            {/* Features */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">특징 (복수선택)</label>
              <div className="flex flex-wrap gap-2">
                {features.map((feature) => (
                  <button
                    key={feature}
                    onClick={() => toggleFeature(feature)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                      formData.features.includes(feature)
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}
                  >
                    {feature}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Photos & Description */}
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

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                제목 <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="매물의 특징을 짧게 작성해주세요"
                value={formData.title}
                onChange={(e) => updateFormData("title", e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={80}
              />
              <p className="mt-1 text-xs text-muted-foreground text-right">
                {formData.title.length}/80
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                상세설명 <span className="text-destructive">*</span>
              </label>
              <textarea
                placeholder="매물에 대한 자세한 설명을 작성해주세요. 예: 위치, 교통, 주변환경, 매물 상태 등"
                value={formData.description}
                onChange={(e) => updateFormData("description", e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                maxLength={3000}
              />
              <p className="mt-1 text-xs text-muted-foreground text-right">
                {formData.description.length}/3000
              </p>
            </div>

            {/* Instagram 포스트 URL (선택) */}
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
                  "w-full px-4 py-3 rounded-lg border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50",
                  formData.instagramPostUrl && !isValidInstagramPostUrl(formData.instagramPostUrl)
                    ? "border-destructive focus:ring-destructive/40"
                    : "border-border",
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                매물 홍보용 인스타 포스트를 매물 페이지 안에 바로 임베드합니다 (로그인 없이 재생 가능).
                {formData.instagramPostUrl && !isValidInstagramPostUrl(formData.instagramPostUrl) && (
                  <span className="block text-destructive mt-0.5">올바른 Instagram 포스트/릴스 URL이 아닙니다.</span>
                )}
              </p>
            </div>

            {/* YouTube URL (선택) */}
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
                  "w-full px-4 py-3 rounded-lg border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50",
                  formData.youtubePostUrl && !isValidYouTubeUrl(formData.youtubePostUrl)
                    ? "border-destructive focus:ring-destructive/40"
                    : "border-border",
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                매물 소개 영상 (쇼츠 포함) — 상세페이지 유튜브 버튼을 눌러 재생할 수 있습니다.
                {formData.youtubePostUrl && !isValidYouTubeUrl(formData.youtubePostUrl) && (
                  <span className="block text-destructive mt-0.5">올바른 YouTube 영상 URL이 아닙니다.</span>
                )}
              </p>
            </div>

            {/* Terms Notice */}
            <div className="p-4 bg-secondary/50 rounded-xl">
              <p className="text-sm text-muted-foreground">
                매물 등록 시 허위 매물 등록, 중개업자 사칭 등은 관련 법률에 따라 처벌받을 수 있습니다.
                등록된 매물은 관리자 검토 후 노출됩니다.
              </p>
            </div>

            {/* 법적 동의 — 일반회원 직거래만 표시 (공인중개사는 면제) */}
            {!isAgent && (
              <div className="p-4 border border-border rounded-xl space-y-3">
                <p className="text-sm font-semibold text-foreground">필수 동의 사항</p>
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={consents.isOwner}
                    onChange={(e) => setConsents((c) => ({ ...c, isOwner: e.target.checked }))}
                  />
                  <span>본인은 등록하는 부동산의 <strong>소유자 또는 임차인 본인</strong>임을 확인합니다</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={consents.notForBroker}
                    onChange={(e) => setConsents((c) => ({ ...c, notForBroker: e.target.checked }))}
                  />
                  <span><strong>타인을 위한 중개 목적이 아님</strong>을 확인합니다 (공인중개사법 위반 시 처벌 대상)</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={consents.truthful}
                    onChange={(e) => setConsents((c) => ({ ...c, truthful: e.target.checked }))}
                  />
                  <span>등록 정보는 <strong>사실에 부합</strong>하며, 허위 정보로 인한 책임은 본인에게 있습니다</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={consents.repeatNotice}
                    onChange={(e) => setConsents((c) => ({ ...c, repeatNotice: e.target.checked }))}
                  />
                  <span>동일 매물을 <strong>반복·다수 게시</strong>할 경우 중개행위로 간주되어 계정이 제한될 수 있음을 인지합니다</span>
                </label>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-40">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {step > 1 && (
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setStep(step - 1)}
              disabled={loading}
            >
              이전
            </Button>
          )}
          {step < 3 ? (
            <Button
              size="lg"
              className={cn("flex-1 text-white", themeClasses.primary, themeClasses.primaryHover)}
              onClick={() => setStep(step + 1)}
              disabled={!canProceedFromStep(step)}
            >
              다음
            </Button>
          ) : (
            <Button
              size="lg"
              className={cn("flex-1 text-white", themeClasses.primary, themeClasses.primaryHover)}
              onClick={handleSubmit}
              disabled={loading || !allConsented || !formData.title || !formData.description || !formData.propertyType || !formData.transactionType || !formData.address || !formData.area}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  등록 중...
                </>
              ) : (
                "등록하기"
              )}
            </Button>
          )}
        </div>
      </div>

      <BottomNav />

      {/* AI 홍보영상 생성 모달 */}
      <AiVideoModal
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        images={formData.images}
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
