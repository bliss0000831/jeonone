"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useBeforeUnload } from "@/hooks/use-before-unload"
import {ArrowLeft, Store} from "lucide-react"
import { MediaUploader } from "@/components/media-uploader"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { RegisterConsentBlock } from "@/components/legal/register-consent-block"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const DEFAULT_CATEGORIES = ["음식점", "카페", "편의점", "미용실", "의류", "약국", "병원", "학원", "헬스장", "기타"]

export default function NewStoreRegisterPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [subRegion, setSubRegion] = useState("")
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
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
    fetch('/api/categories?type=new_store')
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data.map((c) => c.name))
          setFormData((prev) => ({ ...prev, category: data[0].name }))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push("/auth/login")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, role")
        .eq("id", user.id)
        .single()

      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (!isAdmin && profile?.account_type !== "business") {
        toast("사장님 계정만 신장개업을 등록할 수 있습니다")
        router.push("/new-store")
        return
      }

      setIsAuthorized(true)
    }
    checkAuth()
  }, [router])



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!formData.store_name || !formData.description || !formData.address) {
      toast("필수 항목을 모두 입력해주세요")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/new-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          opening_date: formData.opening_date || null,
          images: images.length > 0 ? images : null,
          sub_region: subRegion || null,
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("등록되었습니다")
        setFormDirty(false)
        const postId = data.post?.id
        router.push(postId ? `/new-store/${postId}` : "/new-store")
      } else {
        toast.error(data.error || "등록에 실패했습니다")
      }
    } catch (error) {
      console.error("New-store submit error:", error)
      toast.error("등록에 실패했습니다: " + (error instanceof Error ? error.message : "알 수 없는 오류"))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/new-store" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Store className="w-5 h-5 text-amber-500" />
            신장개업 등록
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* 미디어 업로드 — 사진 + 동영상 + 대표이미지 지정 */}
        <div>
          <label className="block text-sm font-medium mb-2">사진 / 동영상 (최대 10장)</label>
          <MediaUploader
            value={images}
            onChange={setImages}
            folder="new_store"
            maxItems={10}
            videoEnabled
          />
        </div>

        {/* 매장명 */}
        <div>
          <label className="block text-sm font-medium mb-2">매장명 *</label>
          <input
            type="text"
            value={formData.store_name}
            onChange={(e) => setFormData(prev => ({ ...prev, store_name: e.target.value }))}
            placeholder="매장 이름을 입력하세요"
            maxLength={60}
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

        {/* Region (sub_region) — 자동 태깅 */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

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
            maxLength={3000}
            rows={5}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            required
          />
        </div>

        {/* 동의 체크 */}
        <RegisterConsentBlock serviceKind="newStore" onChange={setConsented} />

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={isSubmitting || !consented}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "등록 중..." : "신장개업 등록하기"}
        </button>
      </form>
    </div>
  )
}
