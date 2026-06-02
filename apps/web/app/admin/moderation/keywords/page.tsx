"use client"

import { useEffect, useState, useMemo } from "react"
import {
  Plus, Trash2, Loader2, Shield, Search, Filter,
  AlertTriangle, Ban, Eye, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AdminPageHeader } from "@/components/admin/page-header"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Keyword {
  id: string
  keyword: string
  scope: "all" | "secondhand" | "jobs"
  action: "flag" | "block" | "warn"
  note: string | null
  created_at: string
}

const SCOPE_LABEL: Record<string, string> = {
  all: "전체",
  secondhand: "중고거래",
  jobs: "구인구직",
}

const SCOPE_COLOR: Record<string, string> = {
  all: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  secondhand: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  jobs: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
}

const ACTION_LABEL: Record<string, string> = {
  flag: "숨김+검토큐",
  block: "등록 차단",
  warn: "경고만",
}

const ACTION_ICON: Record<string, typeof Eye> = {
  flag: Eye,
  block: Ban,
  warn: FileText,
}

const ACTION_COLOR: Record<string, string> = {
  flag: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  block: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  warn: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
}

export default function ModerationKeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [scopeFilter, setScopeFilter] = useState<string>("all_filter")
  const [actionFilter, setActionFilter] = useState<string>("all_filter")
  const [form, setForm] = useState({
    keyword: "",
    scope: "all" as Keyword["scope"],
    action: "flag" as Keyword["action"],
    note: "",
  })

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/moderation/keywords")
      const json = await res.json()
      setKeywords(json.keywords || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.keyword.trim()) return
    // 중복 체크
    if (keywords.some((k) => k.keyword.toLowerCase() === form.keyword.trim().toLowerCase())) {
      toast("이미 등록된 키워드입니다")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/admin/moderation/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "추가 실패")
        return
      }
      setForm({ keyword: "", scope: "all", action: "flag", note: "" })
      load()
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("이 키워드를 삭제하시겠어요?")) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/moderation/keywords?id=${id}`, {
        method: "DELETE",
      })
      if (res.ok) load()
    } finally {
      setDeleting(null)
    }
  }

  // 필터링
  const filtered = useMemo(() => {
    let result = keywords
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (k) => k.keyword.toLowerCase().includes(q) || k.note?.toLowerCase().includes(q),
      )
    }
    if (scopeFilter !== "all_filter") {
      result = result.filter((k) => k.scope === scopeFilter)
    }
    if (actionFilter !== "all_filter") {
      result = result.filter((k) => k.action === actionFilter)
    }
    return result
  }, [keywords, searchQuery, scopeFilter, actionFilter])

  // 통계
  const stats = useMemo(() => {
    const byAction = { flag: 0, block: 0, warn: 0 }
    keywords.forEach((k) => { byAction[k.action]++ })
    return { total: keywords.length, ...byAction }
  }, [keywords])

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <AdminPageHeader
        title="키워드 필터"
        description="자동 감지할 업자/스팸/사기 의심 키워드를 관리합니다"
        icon={<Shield className="w-6 h-6" />}
        badge={
          keywords.length > 0 ? (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {keywords.length}개 등록
            </span>
          ) : null
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border bg-card">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-1">전체 키워드</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-amber-600" />
            <span className="text-2xl font-bold text-amber-600">{stats.flag}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">숨김+검토큐</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-600" />
            <span className="text-2xl font-bold text-red-600">{stats.block}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">등록 차단</div>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-2xl font-bold text-gray-500">{stats.warn}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">경고만</div>
        </div>
      </div>

      {/* 동작 설명 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">숨김+검토큐</span>
          </div>
          <p className="text-xs text-amber-600/80 dark:text-amber-400/60">게시글이 자동 숨김되고 검토 큐에 올라감</p>
        </div>
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
          <div className="flex items-center gap-2 mb-1">
            <Ban className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">등록 차단</span>
          </div>
          <p className="text-xs text-red-600/80 dark:text-red-400/60">게시글 등록 자체를 막고 에러 반환</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">경고만</span>
          </div>
          <p className="text-xs text-gray-500/80 dark:text-gray-400/60">조치 없이 로그만 기록 (정책 결정용)</p>
        </div>
      </div>

      {/* 키워드 추가 폼 */}
      <form onSubmit={handleAdd} className="p-5 rounded-xl border bg-card shadow-sm space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4" />
          새 키워드 추가
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            type="text"
            placeholder="키워드 (대소문자 무시)"
            value={form.keyword}
            onChange={(e) => setForm({ ...form, keyword: e.target.value })}
            required
          />
          <select
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value as Keyword["scope"] })}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">전체 게시판</option>
            <option value="secondhand">중고거래만</option>
            <option value="jobs">구인구직만</option>
          </select>
          <select
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value as Keyword["action"] })}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="flag">숨김+검토큐</option>
            <option value="block">등록 차단</option>
            <option value="warn">경고만</option>
          </select>
          <Input
            type="text"
            placeholder="메모 (선택)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={adding || !form.keyword.trim()} size="sm">
          {adding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
          추가
        </Button>
      </form>

      {/* 검색 + 필터 */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="키워드 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all_filter">모든 범위</option>
            <option value="all">전체 게시판</option>
            <option value="secondhand">중고거래</option>
            <option value="jobs">구인구직</option>
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all_filter">모든 동작</option>
            <option value="flag">숨김+검토큐</option>
            <option value="block">등록 차단</option>
            <option value="warn">경고만</option>
          </select>
        </div>
      </div>

      {/* 키워드 목록 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">키워드 목록을 불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Shield className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">
              {keywords.length === 0 ? "등록된 키워드가 없습니다" : "검색 결과가 없습니다"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {keywords.length === 0
                ? "위 폼에서 새 키워드를 추가하세요"
                : "검색어나 필터를 변경해보세요"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length}개 키워드</p>
          <div className="space-y-2">
            {filtered.map((k) => {
              const ActionIcon = ACTION_ICON[k.action] || Eye
              return (
                <div
                  key={k.id}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border bg-card transition-all hover:shadow-sm group",
                    k.action === "block" && "border-red-200/60 dark:border-red-900/30",
                  )}
                >
                  {/* 키워드 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-sm font-bold bg-muted px-2.5 py-1 rounded-md">
                        {k.keyword}
                      </span>
                      <span className={cn(
                        "text-[11px] font-medium px-2 py-0.5 rounded-full",
                        SCOPE_COLOR[k.scope],
                      )}>
                        {SCOPE_LABEL[k.scope]}
                      </span>
                      <span className={cn(
                        "text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                        ACTION_COLOR[k.action],
                      )}>
                        <ActionIcon className="w-3 h-3" />
                        {ACTION_LABEL[k.action]}
                      </span>
                    </div>
                    {k.note && (
                      <p className="text-xs text-muted-foreground mt-1.5 ml-0.5">{k.note}</p>
                    )}
                  </div>

                  {/* 등록일 */}
                  <div className="text-xs text-muted-foreground shrink-0 hidden md:block">
                    {new Date(k.created_at).toLocaleDateString("ko-KR")}
                  </div>

                  {/* 삭제 */}
                  <button
                    type="button"
                    onClick={() => handleDelete(k.id)}
                    disabled={deleting === k.id}
                    className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    {deleting === k.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
