"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { Wrench, ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"

const SERVICE_TYPES = [
  { value: "interior", label: "인테리어" },
  { value: "moving", label: "이사" },
  { value: "cleaning", label: "청소" },
  { value: "repair", label: "수리" },
]

export default function NewServiceRequestPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    serviceType: "",
    title: "",
    content: "",
    region: "강원",
    district: "춘천시",
    dong: "",
    budgetMin: "",
    budgetMax: "",
    desiredDate: "",
  })

  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login?next=/service-requests/new")
        return
      }
      setUser(user)
      setChecking(false)
    }
    check()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.serviceType) {
      setError("서비스 유형을 선택해주세요")
      return
    }
    if (!form.title.trim() || !form.content.trim()) {
      setError("제목과 내용을 입력해주세요")
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        serviceType: form.serviceType,
        title: form.title.trim(),
        content: form.content.trim(),
        region: form.region || null,
        district: form.district || null,
        dong: form.dong || null,
        budgetMin: form.budgetMin ? Number(form.budgetMin) * 10000 : null,
        budgetMax: form.budgetMax ? Number(form.budgetMax) * 10000 : null,
        desiredDate: form.desiredDate || null,
      }
      const res = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "요청 등록 실패")
      router.push(`/service-requests/${json.request.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다")
      setSubmitting(false)
    }
  }

  if (checking) {
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
          href="/service-requests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 목록으로
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">도와주세요</h1>
            <p className="text-xs text-muted-foreground">홈서비스가 필요할 때, 전문가에게 도움을 요청하세요</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">서비스 유형 *</label>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm({ ...form, serviceType: form.serviceType === t.value ? "" : t.value })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    form.serviceType === t.value
                      ? "bg-emerald-500 text-white"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">제목 *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="예: 거실 인테리어 도움 필요합니다"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{form.title.length}/80</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">상세 내용 *</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="필요한 서비스, 규모, 예산 등을 자세히 적어주세요"
              rows={6}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
              maxLength={3000}
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{(form.content || "").length}/3000</p>
          </div>

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
                placeholder="예: 석사동"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">최소 예산 (만원)</label>
              <input
                type="number"
                value={form.budgetMin}
                onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
                placeholder="예: 100"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">최대 예산 (만원)</label>
              <input
                type="number"
                value={form.budgetMax}
                onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
                placeholder="예: 500"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
                min={0}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">희망 서비스 날짜</label>
            <input
              type="date"
              value={form.desiredDate}
              onChange={(e) => setForm({ ...form, desiredDate: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-sm text-emerald-600 dark:text-emerald-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            요청 등록하기
          </button>
        </form>
      </main>

      <BottomNav />
    </div>
  )
}
