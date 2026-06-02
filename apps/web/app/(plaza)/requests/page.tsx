"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { HandHeart, Plus, Search, MapPin, CalendarDays, Loader2, Lock } from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"
import { PageHero } from "@/components/page-hero"

type RequestItem = {
  id: string
  user_id: string
  title: string
  content: string
  region: string | null
  district: string | null
  dong: string | null
  property_type: string | null
  transaction_type: string | null
  budget_min: number | null
  budget_max: number | null
  move_in_date: string | null
  status: "open" | "matched" | "closed"
  views: number
  created_at: string
  author: {
    id: string
    nickname: string | null
    full_name: string | null
    avatar_url: string | null
    account_type: string | null
  } | null
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  open: { label: "모집중", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  matched: { label: "매칭됨", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  closed: { label: "종료", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
}

function formatBudget(min: number | null, max: number | null): string {
  const fmt = (n: number) => {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(n % 100_000_000 === 0 ? 0 : 1)}억`
    if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`
    return n.toLocaleString()
  }
  if (min && max) return `${fmt(min)}~${fmt(max)}`
  if (min) return `${fmt(min)}~`
  if (max) return `~${fmt(max)}`
  return "예산 협의"
}

export default function RequestsPage() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const [items, setItems] = useState<RequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [accountType, setAccountType] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "matched" | "closed">("all")

  // 유저 정보 초기 로드
  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("account_type")
          .eq("id", user.id)
          .maybeSingle()
        setAccountType(p?.account_type ?? null)
      }
    }
    loadUser()
  }, [])

  // 서버사이드 필터링: statusFilter 변경 시 API 재호출
  useEffect(() => {
    const loadItems = async () => {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      const res = await fetch(`/api/property-requests?${params}`)
      const json = await res.json()
      if (Array.isArray(json.requests)) setItems(json.requests)
      setLoading(false)
    }
    loadItems()
  }, [statusFilter])

  const filtered = useMemo(() => {
    // status 필터는 서버사이드로 이동 → 클라이언트는 텍스트 검색만
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q) ||
        r.district?.toLowerCase().includes(q) ||
        r.dong?.toLowerCase().includes(q)
    )
  }, [items, search])

  const canWrite = !!user && accountType !== "agent"

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <PageHero
          pageKey="requests"
          bannerImage="/banners/requests-banner.jpg"
          eyebrow={`${cityName} · 공인중개사에게 요청`}
          icon={<HandHeart className="w-7 h-7 sm:w-8 sm:h-8 text-rose-300" />}
          title="이런 집"
          titleAccent="구해주세요"
          accentGradient="from-rose-300 to-pink-300"
          subtitle="원하는 조건을 남기면 동네 중개사가 먼저 찾아와요"
          action={
            canWrite ? (
              <Link
                href="/requests/new"
                className="flex items-center gap-1 px-4 py-2 bg-rose-500 text-white rounded-full text-sm font-medium hover:bg-rose-600 transition-colors shadow-lg shadow-black/20"
              >
                <Plus className="w-4 h-4" />
                요청하기
              </Link>
            ) : user && accountType === "agent" ? (
              <div className="flex items-center gap-1 px-3 py-2 bg-white/15 backdrop-blur-sm border border-white/20 text-white/90 rounded-full text-xs">
                <Lock className="w-3.5 h-3.5" />
                공인중개사는 응답만
              </div>
            ) : null
          }
        >
          <div className="rounded-xl overflow-hidden border border-white/50 bg-white/70 dark:bg-slate-900/55 backdrop-blur-2xl shadow-xl ring-1 ring-black/5 p-3 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="제목, 내용, 동네 검색"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/80 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {(["all", "open", "matched", "closed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === s
                      ? "bg-rose-500 text-white shadow-sm"
                      : "bg-white/80 dark:bg-slate-900/60 border border-white/80 dark:border-slate-700/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "all" ? "전체" : STATUS_LABEL[s].label}
                </button>
              ))}
            </div>
          </div>
        </PageHero>

        {/* 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
            <HandHeart className="w-12 h-12 text-rose-300 dark:text-rose-700 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {items.length === 0 ? "아직 등록된 요청이 없어요" : "조건에 맞는 요청이 없습니다"}
            </p>
            {canWrite && items.length === 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1">첫 번째 요청을 올려보세요</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((r) => {
              const authorName = r.author?.nickname || r.author?.full_name || "익명"
              const statusInfo = STATUS_LABEL[r.status]
              const region = [r.district, r.dong].filter(Boolean).join(" ")
              return (
                <Link
                  key={r.id}
                  href={`/requests/${r.id}`}
                  prefetch={false}
                  className="block rounded-2xl border border-border bg-card hover:border-rose-300 hover:shadow-md transition-all p-4 group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusInfo.className}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {new Date(r.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground line-clamp-1 mb-1 group-hover:text-rose-600 transition-colors">
                    {r.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{r.content}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {region && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />
                        {region}
                      </span>
                    )}
                    {(r.property_type || r.transaction_type) && (
                      <span className="inline-flex items-center gap-1">
                        {r.transaction_type && <span className="text-rose-600 font-medium">{r.transaction_type}</span>}
                        {r.property_type}
                      </span>
                    )}
                    {(r.budget_min || r.budget_max) && (
                      <span className="font-medium text-foreground">{formatBudget(r.budget_min, r.budget_max)}</span>
                    )}
                    {r.move_in_date && (
                      <span className="inline-flex items-center gap-0.5">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(r.move_in_date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{authorName}</span>
                    <span>조회 {r.views}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
