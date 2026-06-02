"use client"

import { useEffect, useCallback, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Building2, Store, Leaf, Paintbrush, Truck, SprayCan, Wrench,
  Clock, CheckCircle2, XCircle, Loader2, ExternalLink, User as UserIcon,
  ChevronDown, Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled"
type RequestedType =
  | "agent" | "business" | "producer"
  | "interior" | "moving" | "cleaning" | "repair"

interface RequestRow {
  id: string
  user_id: string
  requested_type: RequestedType
  previous_type: string | null
  status: RequestStatus
  business_name: string
  business_number: string | null
  registration_number: string | null
  office_address: string
  contact_phone: string | null
  intro: string | null
  business_cert_urls: string[]
  license_urls: string[]
  extra_docs_urls: string[]
  admin_note: string | null
  reviewed_at: string | null
  submitted_at: string
  profiles?: {
    id: string
    nickname: string | null
    avatar_url: string | null
    email: string | null
  } | null
}

const TYPE_META: Record<RequestedType, { label: string; icon: any; iconClass: string; bgClass: string }> = {
  agent:    { label: "공인중개사",     icon: Building2, iconClass: "text-blue-600",    bgClass: "bg-blue-500/10" },
  business: { label: "사장님",         icon: Store,     iconClass: "text-orange-500",  bgClass: "bg-orange-500/10" },
  producer: { label: "로컬푸드 생산자", icon: Leaf,      iconClass: "text-green-500",   bgClass: "bg-green-500/10" },
  interior: { label: "인테리어",       icon: Paintbrush,iconClass: "text-purple-500",  bgClass: "bg-purple-500/10" },
  moving:   { label: "이사 전문가",     icon: Truck,     iconClass: "text-yellow-500",  bgClass: "bg-yellow-500/10" },
  cleaning: { label: "청소 전문가",     icon: SprayCan,  iconClass: "text-pink-500",    bgClass: "bg-pink-500/10" },
  repair:   { label: "수리 전문가",     icon: Wrench,    iconClass: "text-orange-600",  bgClass: "bg-orange-600/10" },
}

const STATUS_TABS: { key: "pending" | "approved" | "rejected" | "all"; label: string }[] = [
  { key: "pending",  label: "심사 대기" },
  { key: "approved", label: "승인됨" },
  { key: "rejected", label: "반려됨" },
  { key: "all",      label: "전체" },
]

const KIND_TABS: { key: "all" | "new" | "change"; label: string }[] = [
  { key: "all",    label: "전체" },
  { key: "new",    label: "신규 신청" },
  { key: "change", label: "유형 변경 신청" },
]

const REGULAR_TYPES = new Set(["", "user", "individual"])
/** previous_type 이 비어있거나 일반인이면 "신규", 그 외는 "변경" 신청 */
function isChangeRequest(r: Pick<RequestRow, "previous_type">): boolean {
  const p = (r.previous_type || "").toLowerCase()
  return !!p && !REGULAR_TYPES.has(p)
}
function prevTypeLabel(r: Pick<RequestRow, "previous_type">): string {
  const p = (r.previous_type || "").toLowerCase() as RequestedType
  return TYPE_META[p]?.label || "일반"
}

type TopTab = "requests" | "approved"

export default function AdminAccountRequestsPage() {
  const [tab, setTab] = useState<TopTab>("requests")
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [typeFilter, setTypeFilter] = useState<RequestedType | "all">("all")
  const [kindFilter, setKindFilter] = useState<"all" | "new" | "change">("all")
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<RequestRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("status", statusFilter)
      if (typeFilter !== "all") params.set("type", typeFilter)
      const r = await fetch(`/api/admin/account-requests?${params.toString()}`)
      if (r.ok) {
        const { requests } = await r.json()
        setRows(requests || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, typeFilter])

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  // 신규/변경 클라이언트 필터 (서버는 status·type 만 필터)
  const visibleRows = rows.filter((r) => {
    if (kindFilter === "all") return true
    const change = isChangeRequest(r)
    return kindFilter === "change" ? change : !change
  })

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">계정 유형 관리</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            업체 전환 신청 심사 및 승인된 계정 조회
          </p>
        </div>
      </div>

      {/* 상위 탭 */}
      <div className="flex gap-1 border-b border-border/50">
        <button
          type="button"
          onClick={() => setTab("requests")}
          className={cn(
            "px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
            tab === "requests"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          신청 심사
        </button>
        <button
          type="button"
          onClick={() => setTab("approved")}
          className={cn(
            "px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
            tab === "approved"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          승인된 계정 목록
        </button>
      </div>

      {tab === "approved" ? (
        <ApprovedAccountsPanel />
      ) : (
      <>
      {/* 상태 탭 */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatusFilter(t.key)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              statusFilter === t.key
                ? "bg-card text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {counts[t.key] ? <span className="ml-1 text-xs text-muted-foreground">({counts[t.key]})</span> : null}
          </button>
        ))}
      </div>

      {/* 신청 종류 필터 (신규 / 변경) */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {KIND_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setKindFilter(t.key)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              kindFilter === t.key
                ? "bg-card text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 유형 필터 */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
          전체 유형
        </FilterChip>
        {(Object.keys(TYPE_META) as RequestedType[]).map((k) => (
          <FilterChip key={k} active={typeFilter === k} onClick={() => setTypeFilter(k)}>
            {TYPE_META[k].label}
          </FilterChip>
        ))}
      </div>

      {/* 테이블 */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="grid grid-cols-[1fr_160px_140px_140px_160px_120px] bg-muted/30 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          <div>신청자 · 상호</div>
          <div>유형</div>
          <div>사업자번호</div>
          <div>주소</div>
          <div>제출일</div>
          <div className="text-right">상태</div>
        </div>
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            조건에 해당하는 신청이 없습니다
          </div>
        ) : (
          <ul className="divide-y">
            {visibleRows.map((r) => {
              const meta = TYPE_META[r.requested_type]
              const RoleIcon = meta.icon
              const change = isChangeRequest(r)
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[1fr_160px_140px_140px_160px_120px] items-center px-4 py-3 text-[13px] hover:bg-accent/40 cursor-pointer transition-colors border-b border-border/50 last:border-0"
                  onClick={() => setDetail(r)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {r.profiles?.avatar_url ? (
                        <Image src={r.profiles.avatar_url} alt="" width={32} height={32} className="w-full h-full rounded-full object-cover" unoptimized />
                      ) : (
                        <UserIcon className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.profiles?.nickname || "(무명)"} · {r.business_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.profiles?.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", meta.bgClass)}>
                      <RoleIcon className={cn("w-3.5 h-3.5", meta.iconClass)} />
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <span className="truncate">{meta.label}</span>
                      {change ? (
                        <span className="text-[10px] font-medium text-violet-600 truncate">
                          변경: {prevTypeLabel(r)} →
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">신규 신청</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs truncate">{r.business_number || "—"}</div>
                  <div className="text-xs truncate">{r.office_address}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.submitted_at).toLocaleDateString("ko-KR")}
                  </div>
                  <div className="flex justify-end">
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {detail && (
        <DetailDrawer
          row={detail}
          onClose={() => setDetail(null)}
          onUpdated={(next) => {
            setRows((prev) => prev.map((r) => r.id === next.id ? { ...r, ...next } : r))
            setDetail(null)
          }}
        />
      )}
      </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 승인된 계정 목록 패널
 * profiles.account_type 이 셋팅된 사람들. 가장 최근 승인된 신청 row 도 표시.
 * ════════════════════════════════════════════════════════════════════════════ */
interface ApprovedAccount {
  user_id: string
  nickname: string | null
  avatar_url: string | null
  email: string | null
  account_type: RequestedType
  joined_at: string
  request: {
    requested_type: RequestedType
    business_name: string
    business_number: string | null
    registration_number: string | null
    office_address: string
    contact_phone: string | null
    intro: string | null
    business_cert_urls: string[]
    license_urls: string[]
    reviewed_at: string | null
    submitted_at: string
  } | null
}

function ApprovedAccountsPanel() {
  const [typeFilter, setTypeFilter] = useState<RequestedType | "all">("all")
  const [accounts, setAccounts] = useState<ApprovedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [editTarget, setEditTarget] = useState<ApprovedAccount | null>(null)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== "all") params.set("type", typeFilter)
      const r = await fetch(`/api/admin/approved-accounts?${params.toString()}`)
      if (r.ok) {
        const { accounts } = await r.json()
        setAccounts(accounts || [])
      }
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const counts = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.account_type] = (acc[a.account_type] || 0) + 1
    return acc
  }, {})

  const visible = search.trim()
    ? accounts.filter((a) => {
        const q = search.trim().toLowerCase()
        return (
          a.nickname?.toLowerCase().includes(q) ||
          a.email?.toLowerCase().includes(q) ||
          a.request?.business_name?.toLowerCase().includes(q) ||
          a.request?.business_number?.toLowerCase().includes(q)
        )
      })
    : accounts

  return (
    <div className="space-y-4">
      {/* 유형별 제출 서류 안내 */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          계정 유형별 신청 시 제출 항목
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {([
            { type: "agent" as RequestedType, docs: "사업자등록증, 중개사 자격증, 공제증서" },
            { type: "business" as RequestedType, docs: "사업자등록증" },
            { type: "producer" as RequestedType, docs: "사업자등록증 (또는 농업경영체 등록증)" },
            { type: "interior" as RequestedType, docs: "사업자등록증, 관련 자격증/면허" },
            { type: "moving" as RequestedType, docs: "사업자등록증, 화물운송 허가증" },
            { type: "cleaning" as RequestedType, docs: "사업자등록증" },
            { type: "repair" as RequestedType, docs: "사업자등록증, 관련 자격증" },
          ]).map(({ type, docs }) => {
            const m = TYPE_META[type]
            const Icon = m.icon
            return (
              <div key={type} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 text-[12px]">
                <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5", m.bgClass)}>
                  <Icon className={cn("w-3.5 h-3.5", m.iconClass)} />
                </div>
                <div>
                  <div className="font-medium text-[13px]">{m.label}</div>
                  <div className="text-muted-foreground mt-0.5">
                    <span className="font-medium">공통:</span> 상호명, 주소, 연락처, 자기소개
                  </div>
                  <div className="text-muted-foreground">
                    <span className="font-medium">서류:</span> {docs}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
          전체 ({accounts.length})
        </FilterChip>
        {(Object.keys(TYPE_META) as RequestedType[]).map((k) => (
          <FilterChip key={k} active={typeFilter === k} onClick={() => setTypeFilter(k)}>
            {TYPE_META[k].label}
            {counts[k] ? <span className="ml-1 opacity-60">({counts[k]})</span> : null}
          </FilterChip>
        ))}
        <input
          type="text"
          placeholder="닉네임/이메일/상호/사업자번호 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto px-3 py-1.5 text-sm border rounded-md bg-card w-64"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="grid grid-cols-[1fr_130px_130px_150px_140px_110px_80px] bg-muted/30 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          <div>회원 · 상호</div>
          <div>유형</div>
          <div>사업자번호</div>
          <div>주소</div>
          <div>연락처</div>
          <div>승인일</div>
          <div className="text-right">관리</div>
        </div>
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            조건에 해당하는 계정이 없습니다
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((a) => {
              const meta = TYPE_META[a.account_type]
              if (!meta) return null
              const RoleIcon = meta.icon
              const noRequest = !a.request?.reviewed_at
              return (
                <li
                  key={a.user_id}
                  onDoubleClick={() => window.open(`/profile/${a.user_id}`, "_blank")}
                  className={cn(
                    "grid grid-cols-[1fr_130px_130px_150px_140px_110px_80px] items-center px-4 py-3 text-[13px] cursor-pointer transition-colors border-b border-border/50 last:border-0",
                    noRequest ? "bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/20" : "hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {a.avatar_url ? (
                        <Image src={a.avatar_url} alt="" width={32} height={32} className="w-full h-full rounded-full object-cover" unoptimized />
                      ) : (
                        <UserIcon className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {a.nickname || "(무명)"}
                        {a.request?.business_name ? <> · <span className="text-muted-foreground">{a.request.business_name}</span></> : null}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{a.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", meta.bgClass)}>
                      <RoleIcon className={cn("w-3.5 h-3.5", meta.iconClass)} />
                    </div>
                    <span className="truncate">{meta.label}</span>
                  </div>
                  <div className="text-xs truncate">{a.request?.business_number || "—"}</div>
                  <div className="text-xs truncate">{a.request?.office_address || "—"}</div>
                  <div className="text-xs truncate">{a.request?.contact_phone || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.request?.reviewed_at ? new Date(a.request.reviewed_at).toLocaleDateString("ko-KR") : "—"}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setEditTarget(a)}
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition-colors",
                        noRequest
                          ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                    >
                      <Wrench className="w-3 h-3" />
                      {noRequest ? "입력" : "수정"}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {editTarget && (
        <BusinessInfoModal
          account={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            loadAccounts()
          }}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * 사업 정보 입력/수정 모달
 * "직접 설정" 계정의 사업자번호, 주소, 연락처 등을 관리자가 입력
 * ════════════════════════════════════════════════════════════════════════════ */
function BusinessInfoModal({
  account,
  onClose,
  onSaved,
}: {
  account: ApprovedAccount
  onClose: () => void
  onSaved: () => void
}) {
  const meta = TYPE_META[account.account_type]
  const RoleIcon = meta?.icon || Building2

  // reviewed_at → yyyy-MM-dd 형식으로 변환
  const existingDate = account.request?.reviewed_at
    ? new Date(account.request.reviewed_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    business_name: account.request?.business_name || "",
    business_number: account.request?.business_number || "",
    registration_number: account.request?.registration_number || "",
    office_address: account.request?.office_address || "",
    contact_phone: account.request?.contact_phone || "",
    intro: account.request?.intro || "",
    reviewed_at: existingDate,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const handleSave = async () => {
    if (!form.business_name.trim()) return toast("상호명을 입력해 주세요")
    if (!form.business_number.trim()) return toast("사업자등록번호를 입력해 주세요")
    if (account.account_type === "agent" && !form.registration_number.trim()) return toast("중개사무소 등록번호를 입력해 주세요")
    if (!form.office_address.trim()) return toast("주소를 입력해 주세요")
    if (!form.contact_phone.trim()) return toast("연락처를 입력해 주세요")
    if (!form.reviewed_at) return toast("승인일을 입력해 주세요")

    setSaving(true)
    try {
      const r = await fetch("/api/admin/approved-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: account.user_id,
          ...form,
          // date → ISO datetime
          reviewed_at: form.reviewed_at ? new Date(form.reviewed_at + "T00:00:00").toISOString() : undefined,
        }),
      })
      if (!r.ok) {
        const data = await r.json()
        throw new Error(data.error || "저장 실패")
      }
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || "저장에 실패했습니다")
    } finally {
      setSaving(false)
    }
  }

  /** 숫자만 추출 후 사업자등록번호 형식(000-00-00000) 자동 포맷 */
  const formatBizNumber = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 10)
    if (d.length <= 3) return d
    if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
  }

  /** 숫자만 추출 후 전화번호 형식(010-0000-0000 / 02-000-0000 등) 자동 포맷 */
  const formatPhone = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 11)
    if (d.startsWith("02")) {
      if (d.length <= 2) return d
      if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
      if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
      return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`
    }
    if (d.length <= 3) return d
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  }

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="border-b px-5 py-4 flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", meta?.bgClass || "bg-muted")}>
            <RoleIcon className={cn("w-5 h-5", meta?.iconClass || "text-muted-foreground")} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px]">사업 정보 입력</h3>
            <p className="text-xs text-muted-foreground truncate">
              {account.nickname || "(무명)"} · {meta?.label || account.account_type}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">
            ✕
          </button>
        </div>

        {/* 폼 */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              상호명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.business_name}
              onChange={(e) => update("business_name", e.target.value)}
              placeholder="사업장 이름"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              사업자등록번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.business_number}
              onChange={(e) => update("business_number", formatBizNumber(e.target.value))}
              placeholder="000-00-00000"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {account.account_type === "agent" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                중개사무소 등록번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.registration_number}
                onChange={(e) => update("registration_number", e.target.value)}
                placeholder="예: 2020-강원춘천-00001"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              사업장 주소 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.office_address}
              onChange={(e) => update("office_address", e.target.value)}
              placeholder="시/군/구 상세주소"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              연락처 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.contact_phone}
              onChange={(e) => update("contact_phone", formatPhone(e.target.value))}
              placeholder="010-0000-0000"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              승인일 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.reviewed_at}
              onChange={(e) => update("reviewed_at", e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">소개</label>
            <Textarea
              value={form.intro}
              onChange={(e) => update("intro", e.target.value)}
              placeholder="사업 소개 (선택사항)"
              rows={3}
            />
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="border-t px-5 py-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 저장 중…</>
            ) : (
              "저장"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-md text-[12px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: RequestStatus }) {
  const map = {
    pending:   { Icon: Clock,        cls: "bg-blue-500/10 text-blue-600",    label: "심사 중" },
    approved:  { Icon: CheckCircle2, cls: "bg-green-500/10 text-green-600",  label: "승인됨" },
    rejected:  { Icon: XCircle,      cls: "bg-red-500/10 text-red-600",      label: "반려됨" },
    cancelled: { Icon: XCircle,      cls: "bg-muted text-muted-foreground",  label: "취소됨" },
  } as const
  const { Icon, cls, label } = map[status]
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full", cls)}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  )
}

function DetailDrawer({
  row,
  onClose,
  onUpdated,
}: {
  row: RequestRow
  onClose: () => void
  onUpdated: (next: RequestRow) => void
}) {
  const [note, setNote] = useState<string>(row.admin_note || "")
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const meta = TYPE_META[row.requested_type]
  const RoleIcon = meta.icon

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const act = async (action: "approve" | "reject") => {
    if (action === "reject" && !note.trim()) {
      toast("반려 사유를 입력해 주세요")
      return
    }
    setBusy(action)
    try {
      const r = await fetch("/api/admin/account-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, action, admin_note: note.trim() || null }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "처리 실패")
      onUpdated(data.request as RequestRow)
    } catch (e: any) {
      toast.error(e?.message || "처리에 실패했습니다")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex justify-end" onClick={onClose} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-xl bg-card shadow-2xl h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b px-5 py-3 flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", meta.bgClass)}>
            <RoleIcon className={cn("w-5 h-5", meta.iconClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold flex items-center gap-2">
              {meta.label} 신청 상세
              {isChangeRequest(row) ? (
                <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600">
                  유형 변경
                </span>
              ) : (
                <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  신규
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {row.profiles?.nickname || "(무명)"} · {row.profiles?.email}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </div>

        <div className="px-5 py-4 space-y-5">
          <Section title="신청자">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {row.profiles?.avatar_url ? (
                  <Image src={row.profiles.avatar_url} alt="" width={48} height={48} className="w-full h-full rounded-full object-cover" unoptimized />
                ) : (
                  <UserIcon className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{row.profiles?.nickname || "(무명)"}</div>
                <div className="text-xs text-muted-foreground truncate">{row.profiles?.email}</div>
              </div>
              <Link
                href={`/profile/${row.user_id}`}
                target="_blank"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                프로필 <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </Section>

          <Section title="사업 정보">
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">신청 구분</dt>
              <dd className="col-span-2">
                {isChangeRequest(row)
                  ? <span className="text-violet-600 font-medium">유형 변경: {prevTypeLabel(row)} → {meta.label}</span>
                  : <span>신규 신청 (→ {meta.label})</span>}
              </dd>
              <dt className="text-muted-foreground">상호명</dt>
              <dd className="col-span-2">{row.business_name}</dd>
              <dt className="text-muted-foreground">사업자 번호</dt>
              <dd className="col-span-2">{row.business_number || "—"}</dd>
              {row.requested_type === "agent" && (
                <>
                  <dt className="text-muted-foreground">등록번호</dt>
                  <dd className="col-span-2">{(row as any).registration_number || "—"}</dd>
                </>
              )}
              <dt className="text-muted-foreground">주소</dt>
              <dd className="col-span-2">{row.office_address}</dd>
              <dt className="text-muted-foreground">연락처</dt>
              <dd className="col-span-2">{row.contact_phone || "—"}</dd>
              <dt className="text-muted-foreground">제출일</dt>
              <dd className="col-span-2">{new Date(row.submitted_at).toLocaleString("ko-KR")}</dd>
            </dl>
          </Section>

          {row.intro && (
            <Section title="자기소개">
              <p className="text-sm whitespace-pre-wrap">{row.intro}</p>
            </Section>
          )}

          <Section title="사업자등록증">
            <DocumentGrid urls={row.business_cert_urls} />
          </Section>

          {row.license_urls.length > 0 && (
            <Section title="자격증 / 허가증">
              <DocumentGrid urls={row.license_urls} />
            </Section>
          )}

          {row.extra_docs_urls.length > 0 && (
            <Section title="추가 서류">
              <DocumentGrid urls={row.extra_docs_urls} />
            </Section>
          )}

          <Section title="관리자 메모">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="반려 시 사유는 필수입니다. 승인 시에도 내부 메모로 남겨둘 수 있습니다."
              rows={3}
              disabled={row.status !== "pending" || !!busy}
            />
          </Section>

          {row.status === "pending" ? (
            <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-card border-t flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => act("reject")}
                disabled={!!busy}
              >
                {busy === "reject" ? "처리 중…" : "반려"}
              </Button>
              <Button
                className="flex-1"
                onClick={() => act("approve")}
                disabled={!!busy}
              >
                {busy === "approve" ? "처리 중…" : "승인"}
              </Button>
            </div>
          ) : (
            row.reviewed_at && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                {new Date(row.reviewed_at).toLocaleString("ko-KR")}에 처리됨
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h4>
      <div>{children}</div>
    </div>
  )
}

function DocumentGrid({ urls }: { urls: string[] }) {
  if (!urls || urls.length === 0) return <p className="text-xs text-muted-foreground">제출된 파일이 없습니다</p>
  return (
    <div className="grid grid-cols-3 gap-2">
      {urls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block aspect-square rounded-lg overflow-hidden border bg-muted group"
        >
          <Image src={url} alt={`document-${i}`} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <ExternalLink className="w-4 h-4 text-white" />
          </div>
        </a>
      ))}
    </div>
  )
}
