"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { Wrench, ArrowLeft, MapPin, CalendarDays, Loader2, Trash2, MessageSquare, Send, CheckCircle2, MoreVertical, Pencil } from "lucide-react"
import Link from "next/link"
import { User } from "@supabase/supabase-js"
import { ReportButton } from "@/components/report-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useConfirm } from "@/components/confirm-provider"
import { toast } from "sonner"

type ServiceReqData = {
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
  author: { id: string; nickname: string | null; full_name: string | null; avatar_url: string | null; account_type: string | null } | null
}

type Response = {
  id: string
  user_id: string
  content: string
  created_at: string
  author: { id: string; nickname: string | null; full_name: string | null; avatar_url: string | null; account_type: string | null } | null
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

const SERVICE_TYPE_EXPERT: Record<string, string> = {
  interior: "인테리어 전문가",
  moving: "이사 전문가",
  cleaning: "청소 전문가",
  repair: "수리 전문가",
}

function formatBudget(min: number | null, max: number | null): string {
  const fmt = (n: number) => {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(n % 100_000_000 === 0 ? 0 : 1)}억`
    if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`
    return `${n.toLocaleString()}원`
  }
  if (min && max) return `${fmt(min)} ~ ${fmt(max)}`
  if (min) return `${fmt(min)} 이상`
  if (max) return `${fmt(max)} 이하`
  return "예산 협의"
}

export default function ServiceRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const confirm = useConfirm()
  const [user, setUser] = useState<User | null>(null)
  const [accountType, setAccountType] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [req, setReq] = useState<ServiceReqData | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)
  const [responseText, setResponseText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("account_type, role")
          .eq("id", user.id)
          .maybeSingle()
        setAccountType(p?.account_type ?? null)
        if (p?.role === "admin" || p?.role === "superadmin") setIsAdmin(true)
      }
      await reload()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const reload = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/service-requests/${id}`)
      const json = await res.json()
      if (res.ok) {
        setReq(json.request)
        setResponses(json.responses || [])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      router.push(`/auth/login?next=/service-requests/${id}`)
      return
    }
    if (!responseText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/service-requests/${id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: responseText.trim() }),
      })
      if (res.ok) {
        setResponseText("")
        await reload()
      } else {
        const j = await res.json()
        toast.error(j.error || "응답 실패")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!(await confirm({ description: "정말 삭제하시겠습니까?", destructive: true }))) return
    setDeleting(true)
    const res = await fetch(`/api/service-requests/${id}`, { method: "DELETE" })
    if (res.ok) router.push("/service-requests")
    else {
      const j = await res.json()
      toast.error(j.error || "삭제 실패")
      setDeleting(false)
    }
  }

  const handleStatusChange = async (status: "open" | "matched" | "closed") => {
    const res = await fetch(`/api/service-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) await reload()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!req) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Header user={user} />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">요청을 찾을 수 없습니다</p>
          <Link href="/service-requests" className="inline-block mt-4 text-sm text-emerald-600">목록으로</Link>
        </main>
        <BottomNav />
      </div>
    )
  }

  const isOwner = user?.id === req.user_id
  const statusInfo = STATUS_LABEL[req.status]
  const authorName = req.author?.nickname || req.author?.full_name || "익명"
  const region = [req.region, req.district, req.dong].filter(Boolean).join(" ")
  const serviceTypeLabel = req.service_type ? SERVICE_TYPE_LABEL[req.service_type] : ""
  const serviceTypeColor = req.service_type ? SERVICE_TYPE_COLOR[req.service_type] : ""
  const serviceTypeExpert = req.service_type ? SERVICE_TYPE_EXPERT[req.service_type] : ""

  // Check if current user can respond: account_type matches service_type, or admin/superadmin
  const canRespond = (() => {
    if (!user) return false
    if (isAdmin) return true
    if (!req.service_type) return true
    // account_type should match the service_type
    return accountType === req.service_type
  })()

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

        {/* 요청 카드 */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusInfo.className}`}>
                {statusInfo.label}
              </span>
              {serviceTypeLabel && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${serviceTypeColor}`}>
                  {serviceTypeLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!isOwner && !isAdmin && user && (
                <ReportButton
                  targetType="service-requests"
                  targetId={req.id}
                  variant="icon"
                />
              )}
              {(isOwner || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="더보기"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/service-requests/${id}/edit`)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      수정하기
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      삭제하기
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <h1 className="text-xl font-bold mb-3">{req.title}</h1>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed mb-4">{req.content}</p>

          <div className="grid grid-cols-2 gap-2 text-xs mb-4">
            {region && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                <span>{region}</span>
              </div>
            )}
            {(req.budget_min || req.budget_max) && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">💰</span>
                <span className="font-medium">{formatBudget(req.budget_min, req.budget_max)}</span>
              </div>
            )}
            {req.desired_date && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5 text-emerald-500" />
                <span>{new Date(req.desired_date).toLocaleDateString("ko-KR")}</span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{authorName}</span>
            <span>조회 {req.views} · {new Date(req.created_at).toLocaleDateString("ko-KR")}</span>
          </div>

          {isOwner && (
            <div className="mt-3 pt-3 border-t border-border flex gap-1.5">
              {(["open", "matched", "closed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={req.status === s}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    req.status === s
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {STATUS_LABEL[s].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 응답 섹션 */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-bold">
              응답 <span className="text-emerald-600">{responses.length}</span>
            </h2>
          </div>

          {responses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <p className="text-xs text-muted-foreground">
                아직 응답이 없어요. 전문가의 응답을 기다려주세요
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {responses.map((r) => {
                const rn = r.author?.nickname || r.author?.full_name || "익명"
                const isExpert = r.author?.account_type === req?.service_type
                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border p-3 ${
                      isExpert
                        ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 dark:border-emerald-900/40"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold">{rn}</span>
                        {isExpert && serviceTypeExpert && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold">
                            <Wrench className="w-2.5 h-2.5" />
                            {serviceTypeExpert}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.content}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 응답 작성 폼 */}
        {req.status === "open" && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-3">
            {!user ? (
              <Link
                href={`/auth/login?next=/service-requests/${id}`}
                className="block text-center py-3 text-sm text-emerald-600 font-medium"
              >
                로그인하고 응답하기
              </Link>
            ) : !canRespond ? (
              <div className="text-center py-3 text-sm text-muted-foreground">
                이 요청에는 {serviceTypeLabel} 전문가만 응답할 수 있습니다
              </div>
            ) : (
              <>
                {canRespond && accountType === req.service_type && (
                  <div className="flex items-center gap-1.5 mb-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {serviceTypeLabel} 전문가로 응답합니다
                  </div>
                )}
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="요청자에게 남길 메시지를 작성해주세요"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="submit"
                    disabled={submitting || !responseText.trim()}
                    className="flex items-center gap-1 px-4 py-2 bg-emerald-500 text-white rounded-full text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    응답 보내기
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
