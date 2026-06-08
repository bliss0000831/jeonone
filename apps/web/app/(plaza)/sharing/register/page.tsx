"use client"

import { useRef, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useBeforeUnload } from "@/hooks/use-before-unload"
import { ArrowLeft, Heart } from "lucide-react"
import Link from "next/link"
import { MediaUploader } from "@/components/media-uploader"
import { RegisterConsentBlock } from "@/components/legal/register-consent-block"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const DEFAULT_CATEGORIES = ["농기구/자재", "종자·모종", "농산물", "생활용품", "의류", "기타"]

export default function SharingRegisterPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [images, setImages] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [consented, setConsented] = useState(false)
  const [subRegion, setSubRegion] = useState("")
  const consentRef = useRef<HTMLDivElement>(null)
  const focusField = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    ref.current?.focus({ preventScroll: true })
  }
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "기타",
    location: ""
  })

  useEffect(() => {
    fetch('/api/categories?type=sharing')
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data.map((c) => c.name))
          setFormData((prev) => ({ ...prev, category: data[0].name }))
        }
      })
      .catch(() => {})
  }, [])


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!formData.title || !formData.description) {
      toast("제목과 설명을 입력해주세요")
      return
    }
    if (!consented) {
      toast("필수 동의에 체크해주세요")
      focusField(consentRef)
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          images: images.length > 0 ? images : null,
          sub_region: subRegion || null,
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("등록되었습니다")
        setFormDirty(false)
        const postId = data.post?.id
        router.push(postId ? `/sharing/${postId}` : "/sharing")
      } else {
        toast.error(data.error || "등록에 실패했습니다")
      }
    } catch (error) {
      console.error("Sharing submit error:", error)
      toast.error("등록에 실패했습니다: " + (error instanceof Error ? error.message : "알 수 없는 오류"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/sharing" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            나눔하기
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
            folder="sharing"
            maxItems={10}
            videoEnabled
          />
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium mb-2">제목 *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="나눔할 물품의 제목을 입력하세요"
            maxLength={100}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{formData.title.length}/100</p>
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
            maxLength={3000}
            rows={5}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            required
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{formData.description.length}/3000</p>
        </div>

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

        {/* Region (sub_region) — 자동 태깅 */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 동의 체크 */}
        <div ref={consentRef}>
          <RegisterConsentBlock serviceKind="sharing" onChange={setConsented} />
        </div>

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "등록 중..." : "나눔 등록하기"}
        </button>
      </form>
    </div>
  )
}
