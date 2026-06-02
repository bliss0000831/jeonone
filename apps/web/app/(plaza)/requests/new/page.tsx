"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { HandHeart, ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"

const PROPERTY_TYPES = ["아파트", "빌라", "오피스텔", "원룸", "투룸", "주택", "상가", "사무실", "토지"]
const TRANSACTION_TYPES = ["매매", "전세", "월세"]

export default function NewRequestPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [accountType, setAccountType] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: "",
    content: "",
    region: "강원",
    district: "춘천시",
    dong: "",
    propertyType: "",
    transactionType: "",
    budgetMin: "",
    budgetMax: "",
    moveInDate: "",
  })

  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login?next=/requests/new")
        return
      }
      setUser(user)
      const { data: p } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle()
      setAccountType(p?.account_type ?? null)
      setChecking(false)
    }
    check()
  }, [router])

  const isAgent = accountType === "agent"

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
        propertyType: form.propertyType || null,
        transactionType: form.transactionType || null,
        budgetMin: form.budgetMin ? Number(form.budgetMin) * 10000 : null,
        budgetMax: form.budgetMax ? Number(form.budgetMax) * 10000 : null,
        moveInDate: form.moveInDate || null,
      }
      const res = await fetch("/api/property-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "요청 등록 실패")
      router.push(`/requests/${json.request.id}`)
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

  if (isAgent) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Header user={user} />
        <main className="max-w-xl mx-auto px-4 py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <HandHeart className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold mb-2">공인중개사 계정은 요청글을 작성할 수 없습니다</h2>
          <p className="text-sm text-muted-foreground mb-6">
            대신 다른 이웃의 요청에 매물을 추천해보세요
          </p>
          <Link
            href="/requests"
            className="inline-flex items-center gap-1 px-4 py-2 bg-rose-500 text-white rounded-full text-sm font-medium"
          >
            요청 목록 보기
          </Link>
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link
          href="/requests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 목록으로
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center shadow-sm">
            <HandHeart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">구해주세요</h1>
            <p className="text-xs text-muted-foreground">원하는 매물 조건을 자세히 적어주세요</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">제목 *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="예: 석사동 근처 투룸 전세 찾아요"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              maxLength={80}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">상세 내용 *</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="희망 조건, 예산, 선호 환경 등을 자세히 적어주세요"
              rows={6}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
            />
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

          <div>
            <label className="block text-sm font-medium mb-2">거래 유형</label>
            <div className="flex flex-wrap gap-1.5">
              {TRANSACTION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, transactionType: form.transactionType === t ? "" : t })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    form.transactionType === t
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
                  onClick={() => setForm({ ...form, propertyType: form.propertyType === t ? "" : t })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    form.propertyType === t
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
                value={form.budgetMin}
                onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
                placeholder="예: 3000"
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
                placeholder="예: 5000"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
                min={0}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">희망 입주일</label>
            <input
              type="date"
              value={form.moveInDate}
              onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandHeart className="w-4 h-4" />}
            요청 등록하기
          </button>
        </form>
      </main>

      <BottomNav />
    </div>
  )
}
