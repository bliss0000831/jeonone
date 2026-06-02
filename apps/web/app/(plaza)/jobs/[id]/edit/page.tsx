"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Upload, X, Briefcase, Loader2 } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const CATEGORIES = [
  "음식점/카페/매장",
  "물류/배달",
  "사무/콜센터",
  "과외/교육",
  "행사/이벤트",
  "단순노무",
  "전문직/기술직",
  "IT/디자인",
  "홍보/마케팅",
  "기타",
]
const WORK_TYPES = ["단기", "주말", "평일", "장기", "프리랜서"]
const MIN_WAGE_2026 = 10030

export default function JobsEditPage() {
  const router = useRouter()
  const params = useParams()
  const postId = params.id as string

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [subRegion, setSubRegion] = useState("")
  const [formData, setFormData] = useState({
    kind: "hiring" as "hiring" | "seeking",
    title: "",
    description: "",
    category: "음식점/카페/매장",
    workType: "단기",
    hourlyWage: "" as string,
    workDays: "",
    workHours: "",
    location: "",
    contact: "",
  })

  const wageNum = Number(formData.hourlyWage)
  const wageBelowMin = wageNum > 0 && wageNum < MIN_WAGE_2026

  useEffect(() => {
    const fetchPost = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }

      const response = await fetch(`/api/jobs/${postId}`)
      const data = await response.json()
      if (!response.ok || !data.post) {
        toast("글을 찾을 수 없습니다")
        router.push("/jobs")
        return
      }
      // 권한 — 본인 또는 관리자
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (data.post.user_id !== user.id && !isAdmin) {
        toast("수정 권한이 없습니다")
        router.push("/jobs")
        return
      }

      setFormData({
        kind: data.post.kind || "hiring",
        title: data.post.title || "",
        description: data.post.description || "",
        category: data.post.category || "기타",
        workType: data.post.work_type || "단기",
        hourlyWage: data.post.hourly_wage != null ? String(data.post.hourly_wage) : "",
        workDays: data.post.work_days || "",
        workHours: data.post.work_hours || "",
        location: data.post.location || "",
        contact: data.post.contact || "",
      })
      setImages(data.post.images || [])
      setSubRegion(data.post.sub_region || "")
      setIsLoading(false)
    }
    fetchPost()
  }, [postId, router])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (images.length >= 10) break
      try {
        const fd = new FormData()
        fd.append("file", file)
        const response = await fetch("/api/upload", { method: "POST", body: fd })
        const data = await response.json()
        if (response.ok && data.url) setImages((prev) => [...prev, data.url])
      } catch (err) {
        console.error("Upload error:", err)
      }
    }
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!formData.title || !formData.description) {
      toast("제목과 설명을 입력해주세요")
      return
    }
    if (!formData.hourlyWage || Number.isNaN(wageNum) || wageNum <= 0) {
      toast("시급을 정확히 입력해주세요")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/jobs/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: formData.kind,
          title: formData.title,
          description: formData.description,
          category: formData.category,
          workType: formData.workType,
          hourlyWage: wageNum,
          workDays: formData.workDays,
          workHours: formData.workHours,
          location: formData.location,
          contact: formData.contact,
          images: images.length > 0 ? images : null,
          sub_region: subRegion || null,
        }),
      })
      if (response.ok) {
        toast.success("수정되었습니다")
        router.replace(`/jobs/${postId}`)
      } else {
        const data = await response.json()
        toast.error(data.error || "수정에 실패했습니다")
      }
    } catch {
      toast.error("수정에 실패했습니다")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href={`/jobs/${postId}`} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-teal-600" />
            구인구직 수정
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Kind */}
        <div>
          <label className="block text-sm font-medium mb-2">종류 *</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "hiring", label: "구인" },
              { value: "seeking", label: "구직" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormData((p) => ({ ...p, kind: opt.value as any }))}
                className={`py-3 rounded-lg border text-sm font-medium transition-colors ${
                  formData.kind === opt.value
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-background text-foreground border-border hover:border-teal-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium mb-2">사진 (최대 10장)</label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((url, index) => (
              <div key={index} className="relative w-20 h-20 flex-shrink-0">
                <Image src={url} alt="" width={80} height={80} className="w-full h-full object-cover rounded-lg" unoptimized />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {images.length < 10 && (
              <label className="w-20 h-20 flex-shrink-0 border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
                <Upload className="w-6 h-6 text-muted-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">제목 *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">카테고리</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">근무형태</label>
          <select
            value={formData.workType}
            onChange={(e) => setFormData((p) => ({ ...p, workType: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            {WORK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">시급 * (원)</label>
          <input
            type="number"
            min="0"
            step="10"
            value={formData.hourlyWage}
            onChange={(e) => setFormData((p) => ({ ...p, hourlyWage: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
            required
          />
          {wageNum > 0 && (
            <div className="mt-1 text-sm text-muted-foreground">
              입력: ₩{wageNum.toLocaleString("ko-KR")}
            </div>
          )}
          {wageBelowMin && (
            <div className="mt-1 text-sm text-amber-600">
              경고: 2026년 최저시급(₩{MIN_WAGE_2026.toLocaleString("ko-KR")}) 미만입니다
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">근무일</label>
          <input
            type="text"
            value={formData.workDays}
            onChange={(e) => setFormData((p) => ({ ...p, workDays: e.target.value }))}
            placeholder="예: 월,수,금"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">근무시간</label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={(formData.workHours.match(/^(\d{1,2}:\d{2})/) || [])[1] || ""}
              onChange={(e) => {
                const start = e.target.value
                const m = formData.workHours.match(/~\s*(\d{1,2}:\d{2})/)
                const end = m ? m[1] : ""
                setFormData((p) => ({
                  ...p,
                  workHours: start && end ? `${start} ~ ${end}` : start || end || "",
                }))
              }}
              className="flex-1 px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <span className="text-muted-foreground">~</span>
            <input
              type="time"
              value={(formData.workHours.match(/~\s*(\d{1,2}:\d{2})/) || [])[1] || ""}
              onChange={(e) => {
                const end = e.target.value
                const m = formData.workHours.match(/^(\d{1,2}:\d{2})/)
                const start = m ? m[1] : ""
                setFormData((p) => ({
                  ...p,
                  workHours: start && end ? `${start} ~ ${end}` : start || end || "",
                }))
              }}
              className="flex-1 px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </div>

        {/* Region (sub_region) */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        <div>
          <label className="block text-sm font-medium mb-2">근무지</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">상세 설명 *</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            rows={5}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">연락처 (선택)</label>
          <input
            type="text"
            value={formData.contact}
            onChange={(e) => setFormData((p) => ({ ...p, contact: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "수정 중..." : "수정 완료"}
        </button>
      </form>
    </div>
  )
}
