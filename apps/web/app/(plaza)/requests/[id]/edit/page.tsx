"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { HandHeart, ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"
import { RegionFormField } from "@/components/region-form-field"
import { toast } from "sonner"

const PROPERTY_TYPES = ["아파트", "빌라", "오피스텔", "원룸", "투룸", "주택", "상가", "사무실", "토지"]
const TRANSACTION_TYPES = ["매매", "전세", "월세"]
const STATUS_OPTIONS = [
  { v: "open", label: "모집중" },
  { v: "matched", label: "매칭됨" },
  { v: "closed", label: "종료" },
]

export default function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subRegion, setSubRegion] = useState("")

  const [form, setForm] = useState({
    title: "",
    content: "",
    region: "",
    district: "",
    dong: "",
    property_type: "",
    transaction_type: "",
    budget_min: "",
    budget_max: "",
    move_in_date: "",
    status: "open",
  })

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/auth/login?next=/requests/${id}/edit`)
        return
      }
      setUser(user)

      // 기존 글 로드
      const res = await fetch(`/api/property-requests/${id}`)
      const json = await res.json()
      if (!res.ok || !json.request) {
        toast("요청을 찾을 수 없습니다")
        router.push("/requests")
        return
      }
      const req = json.request

      // 권한 체크 — 본인 또는 관리자
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      const isAdmin =
        profile?.role === "admin" || profile?.role === "superadmin"
      if (req.user_id !== user.id && !isAdmin) {
        toast("수정 권한이 없습니다")
        router.push(`/requests/${id}`)
        return
      }

      // 예산은 원 단위로 저장됨 → 만원 단위로 표시
      setForm({
        title: req.title || "",
        content: req.content || "",
        region: req.region || "",
        district: req.district || "",
        dong: req.dong || "",
        property_type: req.property_type || "",
        transaction_type: req.transaction_type || "",
        budget_min:
          req.budget_min != null ? String(Math.round(req.budget_min / 10000)) : "",
        budget_max:
          req.budget_max != null ? String(Math.round(req.budget_max / 10000)) : "",
        move_in_date: req.move_in_date ? req.move_in_date.slice(0, 10) : "",
        status: req.status || "open",
      })
      setSubRegion(req.sub_region || "")
      setLoading(false)
    }
    init()
  }, [id, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.title.trim() || !form.content.trim()) {
      setError("제목과 내용을 입력해주세요")
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        region: form.region || null,
        district: form.district || null,
        dong: form.dong || null,
        property_type: form.property_type || null,
        transaction_type: form.transaction_type || null,
        budget_min: form.budget_min ? Number(form.budget_min) * 10000 : null,
        budget_max: form.budget_max ? Number(form.budget_max) * 10000 : null,
        move_in_date: form.move_in_date || null,
        status: form.status,
        sub_region: subRegion || null,
      }
      const res = await fetch(`/api/property-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "수정 실패")
      router.push(`/requests/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다")
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link
          href={`/requests/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 돌아가기
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-sm">
            <HandHeart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">요청 수정</h1>
            <p className="text-xs text-muted-foreground">조건을 수정하고 저장해주세요</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">제목 *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              maxLength={80}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">상세 내용 *</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={6}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
            />
          </div>

          {/* Region (sub_region) */}
          <RegionFormField value={subRegion} onChange={setSubRegion} />

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">지역</label>
              <input
                type="text"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">시/군/구</label>
              <input
                type="text"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">동/읍/면</label>
              <input
                type="text"
                value={form.dong}
                onChange={(e) => setForm({ ...form, dong: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">거래 유형</label>
            <div className="flex flex-wrap gap-1.5">
              {TRANSACTION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, transaction_type: form.transaction_type === t ? "" : t })
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    form.transaction_type === t
                      ? "bg-rose-500 text-white"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">매물 유형</label>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, property_type: form.property_type === t ? "" : t })
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    form.property_type === t
                      ? "bg-rose-500 text-white"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">최소 예산 (만원)</label>
              <input
                type="number"
                value={form.budget_min}
                onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">최대 예산 (만원)</label>
              <input
                type="number"
                value={form.budget_max}
                onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
                min={0}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">희망 입주일</label>
            <input
              type="date"
              value={form.move_in_date}
              onChange={(e) => setForm({ ...form, move_in_date: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">상태</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => setForm({ ...form, status: s.v })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    form.status === s.v
                      ? "bg-rose-500 text-white"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/requests/${id}`)}
              disabled={submitting}
              className="flex-1 py-3 border border-border rounded-xl font-medium text-sm hover:bg-secondary/40 transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              수정 저장
            </button>
          </div>
        </form>
      </main>

      <BottomNav />
    </div>
  )
}
