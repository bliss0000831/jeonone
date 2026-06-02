"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useSiteBranding } from "@/components/site-branding-client"
import { plazaCityName } from "@/lib/plaza/city-name"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { Wrench, Plus, Search, MapPin, CalendarDays, Loader2 } from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"
import { PageHero } from "@/components/page-hero"

type ServiceRequestItem = {
  id: string
  user_id: string
  title: string
  content: string
  region: string | null
  district: string | null
  dong: string | null
  service_type: string | null
  budget_min: number | null
  budget_max: number | null
  desired_date: string | null
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

const SERVICE_TYPE_LABEL: Record<string, string> = {
  interior: "인테리어",
  moving: "이사",
  cleaning: "청소",
  repair: "수리",
}

const SERVICE_TYPE_COLOR: Record<string, string> = {
  interior: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  moving: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  cleaning: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  repair: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
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

export default function ServiceRequestsPage() {
  const { name: plazaName } = useSiteBranding()
  const cityName = plazaCityName(plazaName)
  const [items, setItems] = useState<ServiceRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "matched" | "closed">("all")
  const [serviceTypeFilter, setServiceTypeFilter] = useState<"all" | "interior" | "moving" | "cleaning" | "repair">("all")

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      const res = await fetch("/api/service-requests")
      const json = await res.json()
      if (Array.isArray(json.requests)) setItems(json.requests)
      setLoading(false)
    }
    init()
  }, [])

  const filtered = useMemo(() => {
    let arr = [...items]
    if (statusFilter !== "all") arr = arr.filter((r) => r.status === statusFilter)
    if (serviceTypeFilter !== "all") arr = arr.filter((r) => r.service_type === serviceTypeFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.content.toLowerCase().includes(q) ||
          r.district?.toLowerCase().includes(q) ||
          r.dong?.toLowerCase().includes(q)
      )
    }
    return arr
  }, [items, search, statusFilter, serviceTypeFilter])

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <PageHero
          pageKey="service-requests"
          bannerImage="/banners/service-requests-banner.jpg"
          eyebrow={`${cityName} · 전문가에게 요청`}
          icon={<Wrench className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-300" />}
          title="도와"
          titleAccent="주세요"
          accentGradient="from-emerald-300 to-teal-300"
          subtitle="홈서비스가 필요할 때, 전문가에게 도움을 요청하세요"
          action={
            user ? (
              <Link
                href="/service-requests/new"
                className="flex items-center gap-1 px-4 py-2 bg-emerald-500 text-white rounded-full text-sm font-medium hover:bg-emerald-600 transition-colors shadow-lg shadow-black/20"
              >
                <Plus className="w-4 h-4" />
                글쓰기
              </Link>
            ) : null
          }
        >
          <div className="rounded-xl overflow-hidden border border-white/50 bg-white/70 dark:bg-slate-900/55 backdrop-blur-2xl shadow-xl ring-1 ring-black/5 p-3 flex flex-col gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="제목, 내용, 동네 검색"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/80 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {(["all", "interior", "moving", "cleaning", "repair"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setServiceTypeFilter(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                    serviceTypeFilter === s
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-white/80 dark:bg-slate-900/60 border border-white/80 dark:border-slate-700/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "all" ? "전체" : SERVICE_TYPE_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {(["all", "open", "matched", "closed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === s
                      ? "bg-emerald-500 text-white shadow-sm"
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
          <div className="flex flex-col items-center justify-center py-20 text-center bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
            <Wrench className="w-12 h-12 text-emerald-300 dark:text-emerald-700 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {items.length === 0 ? "아직 등록된 요청이 없어요" : "조건에 맞는 요청이 없습니다"}
            </p>
            {user && items.length === 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1">첫 번째 요청을 올려보세요</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((r) => {
              const authorName = r.author?.nickname || r.author?.full_name || "익명"
              const statusInfo = STATUS_LABEL[r.status]
              const region = [r.district, r.dong].filter(Boolean).join(" ")
              const serviceTypeColor = r.service_type ? SERVICE_TYPE_COLOR[r.service_type] : ""
              const serviceTypeLabel = r.service_type ? SERVICE_TYPE_LABEL[r.service_type] : ""
              return (
                <Link
                  key={r.id}
                  href={`/service-requests/${r.id}`}
                  prefetch={false}
                  className="block rounded-2xl border border-border bg-card hover:border-emerald-300 hover:shadow-md transition-all p-4 group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      {serviceTypeLabel && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${serviceTypeColor}`}>
                          {serviceTypeLabel}
                        </span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {new Date(r.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground line-clamp-1 mb-1 group-hover:text-emerald-600 transition-colors">
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
                    {(r.budget_min || r.budget_max) && (
                      <span className="font-medium text-foreground">{formatBudget(r.budget_min, r.budget_max)}</span>
                    )}
                    {r.desired_date && (
                      <span className="inline-flex items-center gap-0.5">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(r.desired_date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
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
