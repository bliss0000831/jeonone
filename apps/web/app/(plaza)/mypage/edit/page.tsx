"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ChevronLeft, Camera, Loader2, MapPin, Clock, Tag, Globe, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { koreaRegions } from "@/lib/constants/korea-regions"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface UserProfile {
  id: string
  nickname: string | null
  phone: string | null
  avatar_url: string | null
  location: string | null
  bio: string | null
  account_type: string | null
  business_hours: string | null
  specialties: string[] | null
  service_areas: string[] | null
  website: string | null
  kakao_id: string | null
  is_verified_phone: boolean | null
  is_verified_business: boolean | null
  is_verified_license: boolean | null
}

export default function EditProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [formData, setFormData] = useState({
    nickname: "",
    phone: "",
    intro: "", // 자기소개
    avatar_url: "",
    business_hours: "",
    specialties: "", // 콤마 구분 입력
    website: "",
    kakao_id: "",
  })
  
  // 지역 선택 상태 (춘천시 동만 선택)
  const [selectedDong, setSelectedDong] = useState("")

  // 춘천시 동 목록 가져오기
  const chuncheonDongs = koreaRegions
    .find(r => r.name === "강원특별자치도")
    ?.subRegions?.find(r => r.name === "춘천시")
    ?.subRegions || []

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        window.location.href = "/auth/login"
        return
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
      
      if (profileData) {
        setProfile(profileData)

        // 기존 location 파싱 (예: "강원특별자치도 춘천시 효자동")
        if (profileData.location) {
          const parts = profileData.location.split(" ")
          if (parts.length >= 3) setSelectedDong(parts[2])
        }
        
        setFormData({
          nickname: profileData.nickname || "",
          phone: profileData.phone || "",
          intro: profileData.bio || "", // 자기소개는 bio 필드에서 가져오기
          avatar_url: profileData.avatar_url || "",
          business_hours: profileData.business_hours || "",
          specialties: (profileData.specialties || []).join(", "),
          website: profileData.website || "",
          kakao_id: profileData.kakao_id || "",
        })
      }

      setLoading(false)
    }

    fetchProfile()
  }, [supabase, router])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 파일 크기 체크 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("파일 크기는 5MB 이하여야 합니다.")
      return
    }

    setUploading(true)

    try {
      const formDataUpload = new FormData()
      formDataUpload.append("file", file)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formDataUpload,
      })

      const data = await response.json()

      if (response.ok) {
        setFormData(prev => ({ ...prev, avatar_url: data.url }))
      } else {
        toast.error(data.error || "업로드에 실패했습니다.")
      }
    } catch (error) {
      console.error("Upload error:", error)
      toast.error("업로드 중 오류가 발생했습니다.")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!profile) return

    // 닉네임 유효성 검사
    if (!formData.nickname.trim()) {
      toast("닉네임을 입력해주세요.")
      return
    }

    if (formData.nickname.length > 10) {
      toast.error("닉네임은 최대 10자까지 입력할 수 있습니다.")
      return
    }

    setSaving(true)

    try {
      // location 조합 (모든 사용자, 춘천시 고정 · 선택한 동이 있을 때만)
      const location = selectedDong
        ? `강원특별자치도 춘천시 ${selectedDong}`
        : null

      const splitTags = (s: string): string[] | null => {
        const arr = s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
        return arr.length > 0 ? arr : null
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          nickname: formData.nickname.trim(),
          phone: formData.phone.trim() || null,
          location: location,
          bio: formData.intro.trim() || null,
          avatar_url: formData.avatar_url || null,
          business_hours: formData.business_hours.trim() || null,
          specialties: splitTags(formData.specialties),
          website: formData.website.trim() || null,
          kakao_id: formData.kakao_id.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id)

      if (error) {
        console.error("Update error:", error)
        toast.error("저장에 실패했습니다.")
        return
      }

      router.push("/mypage")
    } catch (error) {
      console.error("Save error:", error)
      toast.error("저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center px-4 h-14">
          <button onClick={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-lg ml-2">프로필 정보 편집</h1>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 py-8">
        {/* Profile Image */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-secondary overflow-hidden">
              {formData.avatar_url ? (
                <Image
                  src={formData.avatar_url}
                  alt="프로필"
                  width={112}
                  height={112}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <span className="text-3xl text-muted-foreground">
                    {formData.nickname?.[0]?.toUpperCase() || "?"}
                  </span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg"
            >
              <Camera className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Nickname */}
          <div className="space-y-2">
            <Label htmlFor="nickname">닉네임</Label>
            <Input
              id="nickname"
              value={formData.nickname}
              onChange={(e) => {
                const v = e.target.value
                setFormData(prev => ({ ...prev, nickname: v }))
              }}
              placeholder="닉네임을 입력하세요"
              maxLength={10}
              className={cn("bg-card", formData.nickname && !/^[가-힣a-zA-Z0-9]*$/.test(formData.nickname) && "border-destructive focus-visible:ring-destructive")}
            />
            <div className="flex items-center justify-between gap-2">
              {formData.nickname && !/^[가-힣a-zA-Z0-9]*$/.test(formData.nickname) ? (
                <p className="text-xs text-destructive">특수문자·공백은 사용할 수 없어요</p>
              ) : formData.nickname.length === 0 ? (
                <p className="text-xs text-destructive">닉네임을 입력해주세요</p>
              ) : (
                <p className="text-xs text-muted-foreground">한글, 영어, 숫자만 사용 가능</p>
              )}
              <span className={cn("text-xs tabular-nums flex-shrink-0", formData.nickname.length >= 10 ? "text-destructive" : "text-muted-foreground")}>
                {formData.nickname.length}/10
              </span>
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">연락처</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="010-0000-0000"
              className="bg-card"
            />
          </div>

          {/* 자기소개 */}
          <div className="space-y-2">
            <Label htmlFor="intro">자기소개</Label>
            <Textarea
              id="intro"
              value={formData.intro}
              onChange={(e) => setFormData(prev => ({ ...prev, intro: e.target.value }))}
              placeholder="자기소개를 입력해주세요"
              rows={5}
              className="bg-card resize-none"
            />
            <p className="text-xs text-muted-foreground">
              간단한 자기소개를 작성해보세요.
            </p>
          </div>

          {/* 내 지역 - 춘천시 고정, 동만 선택 (모든 사용자) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <Label>내 지역</Label>
            </div>

            <div className="flex gap-2 items-center">
              {/* 고정된 지역 표시 */}
              <div className="bg-secondary/50 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                강원특별자치도 춘천시
              </div>

              {/* 동 선택 */}
              <Select value={selectedDong} onValueChange={setSelectedDong}>
                <SelectTrigger className="bg-card flex-1">
                  <SelectValue placeholder="동 선택" />
                </SelectTrigger>
                <SelectContent>
                  {chuncheonDongs.map(dong => (
                    <SelectItem key={dong.name} value={dong.name}>{dong.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 선택된 주소 표시 */}
            {selectedDong && (
              <div className="bg-secondary/30 rounded-lg p-3 text-sm text-foreground">
                <strong>선택한 지역:</strong> 강원특별자치도 춘천시 {selectedDong}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              내 프로필에 표시될 동네를 선택해주세요. (선택)
            </p>
          </div>

          {/* 영업시간 (사장님 전용) */}
          {profile?.account_type === "business" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="business_hours">영업시간</Label>
              </div>
              <Input
                id="business_hours"
                value={formData.business_hours}
                onChange={(e) => setFormData((p) => ({ ...p, business_hours: e.target.value }))}
                placeholder="예: 평일 09:00-21:00 · 주말 10:00-22:00"
                className="bg-card"
              />
            </div>
          )}

          {/* 주요 작물·품목 (로컬푸드 생산자 전용) */}
          {profile?.account_type === "producer" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="specialties">주요 작물·품목</Label>
              </div>
              <Input
                id="specialties"
                value={formData.specialties}
                onChange={(e) => setFormData((p) => ({ ...p, specialties: e.target.value }))}
                placeholder="예: 사과, 감자, 고추 (콤마로 구분)"
                className="bg-card"
              />
              <p className="text-xs text-muted-foreground">
                키우시는 작물을 콤마 또는 줄바꿈으로 적어주세요. (최대 5~6개 추천)
              </p>
            </div>
          )}

          {/* 웹사이트 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="website">웹사이트</Label>
            </div>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
              placeholder="https://"
              className="bg-card"
            />
          </div>

          {/* 카카오톡 ID */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="kakao_id">카카오톡 ID</Label>
            </div>
            <Input
              id="kakao_id"
              value={formData.kakao_id}
              onChange={(e) => setFormData((p) => ({ ...p, kakao_id: e.target.value }))}
              placeholder="오픈채팅 링크 또는 ID"
              className="bg-card"
            />
          </div>

        </div>
      </div>

      {/* (helpers rendered inline via JSX) */}

      {/* Footer */}
      <div className="sticky bottom-0 bg-card border-t border-border p-4 safe-area-bottom">
        <Button 
          onClick={handleSave} 
          disabled={saving || !formData.nickname.trim()}
          className="w-full h-12 text-base font-medium"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              저장 중...
            </>
          ) : (
            "적용하기"
          )}
        </Button>
      </div>
    </div>
  )
}
