"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import {
  Loader2, ShieldAlert, EyeOff, Eye, Trash2, X, ExternalLink,
  AlertTriangle, CheckCircle2, Ban, Clock, Filter, MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/page-header"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Report {
  id: string
  reporter_id: string
  reporter_nickname?: string
  target_type: string
  target_id: string
  target_user_id: string | null
  reason: string
  reason_detail: string | null
  status: "pending" | "resolved" | "dismissed"
  created_at: string
  resolved_at?: string | null
  target: {
    id: string
    title: string
    user_id: string
    status: string
    report_count: number
  } | null
}

const REASON_LABEL: Record<string, string> = {
  commercial: "업자 의심",
  spam: "스팸/광고",
  fraud: "사기 의심",
  inappropriate: "부적절한 내용",
  other: "기타",
}

const REASON_COLOR: Record<string, string> = {
  fraud: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  spam: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  commercial: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  inappropriate: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  other: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
}

const TYPE_LABEL: Record<string, string> = {
  secondhand: "농기구/자재",
  jobs: "일손",
  sharing: "나눔",
  clubs: "모임",
  "new-store": "신장개업",
  board: "게시판",
  property: "매물",
  group_buying: "공구",
  local_food: "로컬푸드",
  interior: "인테리어",
  moving: "이사",
  cleaning: "청소",
  repair: "수리",
  requests: "매물의뢰",
}

const TYPE_EMOJI: Record<string, string> = {
  secondhand: "🏷️",
  jobs: "💼",
  sharing: "🤝",
  clubs: "👥",
  "new-store": "🎉",
  board: "📝",
  property: "🏠",
  group_buying: "🛒",
  local_food: "🥬",
  interior: "🛋️",
  moving: "🚛",
  cleaning: "🧹",
  repair: "🔧",
  requests: "📋",
}

const TYPE_PATH: Record<string, string> = {
  secondhand: "/secondhand",
  jobs: "/jobs",
  sharing: "/sharing",
  clubs: "/clubs",
  "new-store": "/new-store",
  board: "/board",
  property: "/property",
  group_buying: "/group-buying",
  local_food: "/local-food",
  interior: "/interior",
  moving: "/moving",
  cleaning: "/cleaning",
  repair: "/repair",
  requests: "/requests",
}

type Tab = "pending" | "resolved" | "dismissed"

const TAB_CONFIG: { key: Tab; label: string; icon: typeof Clock; color: string }[] = [
  { key: "pending", label: "대기중", icon: Clock, color: "text-amber-600" },
  { key: "resolved", label: "처리완료", icon: CheckCircle2, color: "text-emerald-600" },
  { key: "dismissed", label: "무시됨", icon: Ban, color: "text-gray-500" },
]

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "방금"
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}일 전`
  return new Date(dateStr).toLocaleDateString("ko-KR")
}

export default function ModerationReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Tab>("pending")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [busy, setBusy] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<Tab, number>>({ pending: 0, resolved: 0, dismissed: 0 })

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/moderation/reports?status=${filter}`)
      const json = await res.json()
      setReports(json.reports || [])
    } finally {
      setLoading(false)
    }
  }

  // 탭 카운트 로드 (pending만이라도)
  const loadCounts = async () => {
    try {
      const [p, r, d] = await Promise.all(
        (["pending", "resolved", "dismissed"] as const).map(async (s) => {
          const res = await fetch(`/api/admin/moderation/reports?status=${s}`)
          const json = await res.json()
          return json.reports?.length ?? 0
        }),
      )
      setCounts({ pending: p, resolved: r, dismissed: d })
    } catch {}
  }

  useEffect(() => {
    load()
    loadCounts()
  }, [filter])

  const handleAction = async (
    reportId: string,
    action: "hide_post" | "restore_post" | "delete_post" | "dismiss",
  ) => {
    const labels: Record<string, string> = {
      hide_post: "이 글을 숨김 처리하시겠습니까?",
      restore_post: "이 글을 복원하시겠습니까?",
      delete_post: "이 글을 영구 삭제합니다. 되돌릴 수 없습니다.",
      dismiss: "이 신고를 무시(문제없음) 처리하시겠습니까?",
    }
    if (!confirm(labels[action] || "진행하시겠습니까?")) return
    setBusy(reportId)
    try {
      const res = await fetch("/api/admin/moderation/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "처리 실패")
        return
      }
      load()
      loadCounts()
    } finally {
      setBusy(null)
    }
  }

  // 타입별 필터링
  const availableTypes = useMemo(() => {
    const types = new Set(reports.map((r) => r.target_type))
    return Array.from(types)
  }, [reports])

  const filtered = useMemo(() => {
    if (typeFilter === "all") return reports
    return reports.filter((r) => r.target_type === typeFilter)
  }, [reports, typeFilter])

  // 사유별 통계
  const reasonStats = useMemo(() => {
    const map: Record<string, number> = {}
    reports.forEach((r) => {
      map[r.reason] = (map[r.reason] || 0) + 1
    })
    return Object.entries(map).sort(([, a], [, b]) => b - a)
  }, [reports])

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <AdminPageHeader
        title="신고 검토 큐"
        description="사용자 신고 게시글 검토 · 누적 3회 자동 숨김"
        icon={<ShieldAlert className="w-6 h-6" />}
        badge={
          counts.pending > 0 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 animate-pulse">
              {counts.pending}건 대기
            </span>
          ) : null
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="text-2xl font-bold text-amber-600">{counts.pending}</div>
          <div className="text-xs text-muted-foreground mt-1">대기중 신고</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="text-2xl font-bold text-emerald-600">{counts.resolved}</div>
          <div className="text-xs text-muted-foreground mt-1">처리 완료</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="text-2xl font-bold text-gray-500">{counts.dismissed}</div>
          <div className="text-xs text-muted-foreground mt-1">무시됨</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="text-2xl font-bold">{counts.pending + counts.resolved + counts.dismissed}</div>
          <div className="text-xs text-muted-foreground mt-1">전체 신고</div>
        </div>
      </div>

      {/* 사유별 분포 (대기중일 때만) */}
      {filter === "pending" && reasonStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reasonStats.map(([reason, count]) => (
            <div
              key={reason}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                REASON_COLOR[reason] || REASON_COLOR.other,
              )}
            >
              <span>{REASON_LABEL[reason] || reason}</span>
              <span className="font-bold">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* 상태 탭 */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        {TAB_CONFIG.map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setTypeFilter("all") }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all",
              filter === key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("w-3.5 h-3.5", filter === key && color)} />
            {label}
            {counts[key] > 0 && (
              <span className={cn(
                "text-[10px] font-bold ml-0.5 px-1.5 py-0.5 rounded-full",
                filter === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 타입 필터 */}
      {!loading && availableTypes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <button
            onClick={() => setTypeFilter("all")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              typeFilter === "all"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            전체
          </button>
          {availableTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                typeFilter === t
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {TYPE_EMOJI[t] || ""} {TYPE_LABEL[t] || t}
            </button>
          ))}
        </div>
      )}

      {/* 리스트 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">신고 목록을 불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">
              {filter === "pending"
                ? "대기중인 신고가 없습니다"
                : filter === "resolved"
                  ? "처리 완료된 신고가 없습니다"
                  : "무시된 신고가 없습니다"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === "pending" && "모든 신고가 처리되었습니다. 잘 관리하고 계시네요!"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{filtered.length}건 표시중</p>
          {filtered.map((r) => (
            <div
              key={r.id}
              className={cn(
                "p-5 rounded-xl border bg-card shadow-sm transition-all hover:shadow-md",
                r.target?.report_count && r.target.report_count >= 3 && filter === "pending"
                  && "border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/10",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2.5">
                  {/* 뱃지 행 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-primary/10 text-primary">
                      {TYPE_EMOJI[r.target_type] || "📄"} {TYPE_LABEL[r.target_type] || r.target_type}
                    </span>
                    <span className={cn(
                      "text-xs font-semibold px-2.5 py-1 rounded-md",
                      REASON_COLOR[r.reason] || REASON_COLOR.other,
                    )}>
                      {REASON_LABEL[r.reason] || r.reason}
                    </span>
                    {r.target && r.target.report_count > 0 && (
                      <span className={cn(
                        "text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1",
                        r.target.report_count >= 3
                          ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                      )}>
                        <AlertTriangle className="w-3 h-3" />
                        누적 {r.target.report_count}건
                      </span>
                    )}
                    {r.target?.status === "hidden" && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 flex items-center gap-1">
                        <EyeOff className="w-3 h-3" />
                        숨김 상태
                      </span>
                    )}
                  </div>

                  {/* 제목 */}
                  <div>
                    {r.target ? (
                      <Link
                        href={`${TYPE_PATH[r.target_type] || ""}/${r.target_id}`}
                        target="_blank"
                        className="text-base font-semibold hover:underline inline-flex items-center gap-1.5 leading-snug"
                      >
                        {r.target.title}
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground italic text-sm">(원본 삭제됨)</span>
                    )}
                  </div>

                  {/* 신고 사유 상세 */}
                  {r.reason_detail && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {r.reason_detail}
                      </p>
                    </div>
                  )}

                  {/* 메타 정보 */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>신고자: <span className="font-medium text-foreground">{r.reporter_nickname || r.reporter_id.slice(0, 8)}</span></span>
                    <span className="text-border">|</span>
                    <span title={new Date(r.created_at).toLocaleString("ko-KR")}>
                      {timeAgo(r.created_at)}
                    </span>
                  </div>
                </div>

                {/* 우측 시간 표시 */}
                <div className="text-right shrink-0 hidden md:block">
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("ko-KR")}
                  </div>
                  <div className="text-[11px] text-muted-foreground/60">
                    {new Date(r.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>

              {/* 액션 버튼 */}
              {filter === "pending" && r.target && (
                <div className="flex gap-2 pt-3 mt-3 border-t border-border/50">
                  {r.target.status !== "hidden" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === r.id}
                      onClick={() => handleAction(r.id, "hide_post")}
                      className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    >
                      {busy === r.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                      숨김 처리
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === r.id}
                      onClick={() => handleAction(r.id, "restore_post")}
                    >
                      {busy === r.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                      복원
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => handleAction(r.id, "delete_post")}
                    className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {busy === r.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                    영구 삭제
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === r.id}
                    onClick={() => handleAction(r.id, "dismiss")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {busy === r.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
                    무시 (문제없음)
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
