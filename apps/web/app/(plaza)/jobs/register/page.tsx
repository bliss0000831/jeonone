"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useBeforeUnload } from "@/hooks/use-before-unload"
import {ArrowLeft, Briefcase} from "lucide-react"
import { MediaUploader } from "@/components/media-uploader"
import Link from "next/link"
import { RegisterConsentBlock } from "@/components/legal/register-consent-block"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const CATEGORIES = [
  "농사 일손",
  "수확/선별",
  "모내기/이앙",
  "과수/원예",
  "축산",
  "운반/기계",
  "품앗이",
  "기타",
]

const WORK_TYPES = ["단기", "주말", "평일", "장기", "프리랜서"]

const MIN_WAGE_2026 = 10030

export default function JobsRegisterPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consented, setConsented] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  useBeforeUnload(formDirty)
  const [images, setImages] = useState<string[]>([])
  const [subRegion, setSubRegion] = useState("")
  const consentRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const wageRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)
  const focusField = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    ref.current?.focus({ preventScroll: true })
  }
  const [formData, setFormData] = useState({
    kind: "hiring" as "hiring" | "seeking",
    title: "",
    description: "",
    category: "농사 일손",
    workType: "단기",
    hourlyWage: "" as string,
    workDays: "",
    workHours: "",
    location: "",
    contact: "",
  })

  const wageNum = Number(formData.hourlyWage)
  const wageBelowMin = wageNum > 0 && wageNum < MIN_WAGE_2026



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!formData.title) {
      toast("제목을 입력해주세요")
      focusField(titleRef)
      return
    }
    if (!formData.description) {
      toast("설명을 입력해주세요")
      focusField(descRef)
      return
    }
    if (!formData.hourlyWage || Number.isNaN(wageNum) || wageNum <= 0) {
      toast("시급을 정확히 입력해주세요 (원 단위, 0보다 큰 숫자)")
      focusField(wageRef)
      return
    }
    if (!consented) {
      toast("필수 동의에 체크해주세요")
      focusField(consentRef)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
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
      const data = await response.json()

      if (response.status === 429) {
        toast(data.error || "하루 등록 한도(3건)를 초과했습니다")
        return
      }

      if (response.ok) {
        if (data.flagged) {
          toast("등록되었지만 관리자 검토 중입니다. 승인 후 게시됩니다.")
        } else {
          toast.success("공고가 성공적으로 등록되었습니다")
        }
        setFormDirty(false)
        const postId = data.post?.id
        router.push(postId ? `/jobs/${postId}` : "/jobs")
      } else {
        toast.error(data.error || "등록에 실패했습니다")
      }
    } catch (error) {
      toast.error("등록에 실패했습니다: " + (error instanceof Error ? error.message : "알 수 없는 오류"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/jobs" className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-teal-600" />
            구인구직 등록
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Kind 토글 */}
        <div>
          <label className="block text-base font-medium mb-2">종류 *</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "hiring", label: "구인 (사람을 구해요)" },
              { value: "seeking", label: "구직 (일자리를 찾아요)" },
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

        {/* 이미지 */}
        <div>
          <label className="block text-base font-medium mb-2">사진 (최대 10장, 선택)</label>
          <MediaUploader
            value={images}
            onChange={setImages}
            folder="jobs"
            maxItems={10}
            videoEnabled
          />
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-base font-medium mb-2">제목 *</label>
          <input
            ref={titleRef}
            type="text"
            value={formData.title}
            onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            placeholder="예: 주말 카페 홀 서빙 구합니다"
            maxLength={80}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
            required
          />
        </div>

        {/* 카테고리 */}
        <div>
          <label className="block text-base font-medium mb-2">카테고리</label>
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

        {/* 근무형태 */}
        <div>
          <label className="block text-base font-medium mb-2">근무형태</label>
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

        {/* 시급 */}
        <div>
          <label className="block text-base font-medium mb-2">시급 * (원)</label>
          <input
            ref={wageRef}
            type="number"
            min="0"
            step="10"
            value={formData.hourlyWage}
            onChange={(e) => setFormData((p) => ({ ...p, hourlyWage: e.target.value }))}
            placeholder="예: 10030"
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

        {/* 근무일 */}
        <div>
          <label className="block text-base font-medium mb-2">근무일</label>
          <input
            type="text"
            value={formData.workDays}
            onChange={(e) => setFormData((p) => ({ ...p, workDays: e.target.value }))}
            placeholder="예: 월,수,금"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        {/* 근무시간 — 시작/종료 분리 (저장 시 "HH:MM ~ HH:MM" 합쳐 workHours) */}
        <div>
          <label className="block text-base font-medium mb-2">근무시간</label>
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

        {/* 위치 */}
        <div>
          <label className="block text-base font-medium mb-2">근무지</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
            placeholder="예: 춘천시 후평동"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        {/* Region (sub_region) — 자동 태깅 */}
        <RegionFormField value={subRegion} onChange={setSubRegion} />

        {/* 설명 */}
        <div>
          <label className="block text-base font-medium mb-2">상세 설명 *</label>
          <textarea
            ref={descRef}
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            placeholder="업무 내용, 자격 조건, 우대 사항 등을 자세히 작성해주세요"
            maxLength={3000}
            rows={5}
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
            required
          />
        </div>

        {/* 연락처 */}
        <div>
          <label className="block text-base font-medium mb-2">연락처 (선택)</label>
          <input
            type="text"
            value={formData.contact}
            onChange={(e) => setFormData((p) => ({ ...p, contact: e.target.value }))}
            placeholder="예: 010-1234-5678 또는 카톡ID"
            className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div ref={consentRef}>
          <RegisterConsentBlock serviceKind="jobs" onChange={setConsented} />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "등록 중..." : "공고 등록하기"}
        </button>
      </form>
    </div>
  )
}
