"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronLeft,
  Building2,
  Store,
  Leaf,
  Paintbrush,
  Truck,
  SprayCan,
  Wrench,
  CheckCircle2,
  Clock,
  XCircle,
  Shield,
  X,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ImageUpload } from "@/components/image-upload"
import { cn } from "@/lib/utils"

type RequestedType =
  | "agent" | "business" | "producer"
  | "interior" | "moving" | "cleaning" | "repair"

interface RoleMeta {
  type: RequestedType
  label: string
  description: string
  icon: any
  iconClass: string
  bgClass: string
  benefits: string[]
  /** 자격증 필수 여부 */
  requiresLicense?: boolean
  licenseLabel?: string
}

const ROLES: RoleMeta[] = [
  {
    type: "agent",
    label: "공인중개사",
    description: "전문 매물 등록 및 부동산 중개 업무",
    icon: Building2,
    iconClass: "text-blue-600",
    bgClass: "bg-blue-500/10",
    benefits: ["전문 매물 등록", "중개사 뱃지", "신뢰 지수 가점"],
    requiresLicense: true,
    licenseLabel: "공인중개사 자격증",
  },
  {
    type: "business",
    label: "사장님",
    description: "메뉴 · 상품 등록, 공동구매 운영",
    icon: Store,
    iconClass: "text-orange-500",
    bgClass: "bg-orange-500/10",
    benefits: ["메뉴·상품 등록", "공동구매 운영", "영업시간·위치 노출"],
  },
  {
    type: "producer",
    label: "로컬푸드 생산자",
    description: "농수산물 · 가공품 직거래 판매",
    icon: Leaf,
    iconClass: "text-green-500",
    bgClass: "bg-green-500/10",
    benefits: ["로컬푸드 등록", "제철 예약주문", "농장일지 기능"],
  },
  {
    type: "interior",
    label: "인테리어",
    description: "인테리어 · 리모델링 포트폴리오",
    icon: Paintbrush,
    iconClass: "text-purple-500",
    bgClass: "bg-purple-500/10",
    benefits: ["포트폴리오 등록", "견적 문의 채팅", "전후 비교 쇼케이스"],
  },
  {
    type: "moving",
    label: "이사 전문가",
    description: "이사 서비스 견적 · 예약",
    icon: Truck,
    iconClass: "text-yellow-500",
    bgClass: "bg-yellow-500/10",
    benefits: ["이사 서비스 등록", "견적 요청 수신", "서비스 지역 지정"],
  },
  {
    type: "cleaning",
    label: "청소 전문가",
    description: "청소 서비스 견적 · 예약",
    icon: SprayCan,
    iconClass: "text-pink-500",
    bgClass: "bg-pink-500/10",
    benefits: ["청소 서비스 등록", "견적 요청 수신", "정기/단건 선택"],
  },
  {
    type: "repair",
    label: "수리 전문가",
    description: "가전 · 배관 · 전기 · 긴급 수리",
    icon: Wrench,
    iconClass: "text-orange-600",
    bgClass: "bg-orange-600/10",
    benefits: ["수리 서비스 등록", "긴급 출동 배지", "전문분야 노출"],
  },
]

interface AccountTypeRequest {
  id: string
  requested_type: RequestedType
  status: "pending" | "approved" | "rejected" | "cancelled"
  business_name: string
  office_address: string
  admin_note: string | null
  submitted_at: string
}

export default function AccountUpgradePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [currentType, setCurrentType] = useState<string>("user")
  const [requests, setRequests] = useState<AccountTypeRequest[]>([])
  const [selectedRole, setSelectedRole] = useState<RoleMeta | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = "/auth/login?redirect=/mypage/account-upgrade"
        return
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle()
      setCurrentType(profile?.account_type || "user")

      try {
        const r = await fetch("/api/account-upgrade")
        if (r.ok) {
          const { requests } = await r.json()
          setRequests(requests || [])
        }
      } catch {}
      setLoading(false)
    })()
  }, [supabase])

  const pendingByType = new Map<string, AccountTypeRequest>()
  for (const r of requests) {
    if (r.status === "pending" && !pendingByType.has(r.requested_type)) {
      pendingByType.set(r.requested_type, r)
    }
  }

  // 일반인 취급 기준: "user" / "individual" / null / 빈 문자열
  const REGULAR_USER_TYPES = new Set(["", "user", "individual"])
  const normalizedCurrent = (currentType || "").toLowerCase()
  const isNonUser = !REGULAR_USER_TYPES.has(normalizedCurrent)
  // 현재 유형의 한글 라벨
  const currentTypeLabel =
    ROLES.find((m) => m.type === normalizedCurrent)?.label || "일반"

  return (
    <div className="min-h-screen bg-muted/20">
      {/* 헤더 */}
      <header className="safe-top sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-muted"
            aria-label="뒤로가기"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold">계정 유형 신청</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* 안내 배너 */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">전문가 · 사업자 계정으로 전환하기</h2>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                사업자등록증 · 자격증 등 서류를 제출하고 승인받으면
                해당 카테고리의 <b>등록 / 운영 기능</b>이 활성화됩니다.
                심사는 보통 영업일 기준 1~3일 소요됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* 이미 다른 계정이면 안내만 */}
        {isNonUser && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4 text-sm">
            현재 <b>{currentTypeLabel}</b> 계정으로 활성화되어 있습니다. 다른 유형으로 변경하려면
            {" "}<b>유형 변경 신청</b>을 해주세요. 아래 카드에서 원하는 유형을 선택해 서류를 제출하면 관리자 심사 후 변경됩니다.
          </div>
        )}

        {/* 내 최근 신청 */}
        {requests.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">내 신청 내역</h3>
            <ul className="space-y-2">
              {requests.slice(0, 3).map((r) => {
                const meta = ROLES.find((m) => m.type === r.requested_type)
                const statusStyle =
                  r.status === "pending"     ? { Icon: Clock,        cls: "bg-blue-500/10 text-blue-600",    label: "심사 중" } :
                  r.status === "approved"    ? { Icon: CheckCircle2, cls: "bg-green-500/10 text-green-600",  label: "승인됨" } :
                  r.status === "rejected"    ? { Icon: XCircle,      cls: "bg-red-500/10 text-red-600",      label: "반려됨" } :
                                               { Icon: XCircle,      cls: "bg-muted text-muted-foreground",  label: "취소됨" }
                const StatusIcon = statusStyle.Icon
                return (
                  <li key={r.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", meta?.bgClass)}>
                      {meta?.icon ? <meta.icon className={cn("w-5 h-5", meta.iconClass)} /> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{meta?.label || r.requested_type}</span>
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full", statusStyle.cls)}>
                          <StatusIcon className="w-3 h-3" />
                          {statusStyle.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {r.business_name} · {new Date(r.submitted_at).toLocaleDateString("ko-KR")}
                      </p>
                      {r.status === "rejected" && r.admin_note && (
                        <p className="text-xs text-red-600 mt-1 line-clamp-2">사유: {r.admin_note}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* 유형 카드 그리드 */}
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">신청 가능한 유형</h3>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">불러오는 중…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ROLES.map((role) => {
                const pending = pendingByType.get(role.type)
                const RoleIcon = role.icon
                const isCurrent = role.type === normalizedCurrent
                const disabled = isCurrent || !!pending
                return (
                  <button
                    key={role.type}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelectedRole(role)}
                    className={cn(
                      "text-left rounded-2xl border bg-card p-4 transition-all",
                      disabled
                        ? "opacity-60 cursor-not-allowed"
                        : "border-border hover:border-primary/60 hover:shadow-md active:scale-[0.99]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", role.bgClass)}>
                        <RoleIcon className={cn("w-5 h-5", role.iconClass)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold">{role.label}</h4>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
                              <CheckCircle2 className="w-3 h-3" /> 현재 유형
                            </span>
                          )}
                          {!isCurrent && isNonUser && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600">
                              변경 신청
                            </span>
                          )}
                          {pending && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                              <Clock className="w-3 h-3" /> 심사 중
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                        <ul className="mt-2 space-y-0.5">
                          {role.benefits.map((b) => (
                            <li key={b} className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-primary" /> {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {/* 신청 모달 */}
      {selectedRole && (
        <ApplicationModal
          role={selectedRole}
          onClose={() => setSelectedRole(null)}
          onSubmitted={(req) => {
            setRequests((prev) => [req, ...prev])
            setSelectedRole(null)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// 신청 모달
// ─────────────────────────────────────────────────────────
function ApplicationModal({
  role,
  onClose,
  onSubmitted,
}: {
  role: RoleMeta
  onClose: () => void
  onSubmitted: (r: AccountTypeRequest) => void
}) {
  const [businessName, setBusinessName] = useState("")
  const [businessNumber, setBusinessNumber] = useState("")
  const [registrationNumber, setRegistrationNumber] = useState("")
  const [officeAddress, setOfficeAddress] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [intro, setIntro] = useState("")
  const [businessCertUrls, setBusinessCertUrls] = useState<string[]>([])
  const [licenseUrls, setLicenseUrls] = useState<string[]>([])
  const [extraDocsUrls, setExtraDocsUrls] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const submit = async () => {
    setError(null)
    if (!businessName.trim()) return setError("사업장(상호)명을 입력해 주세요")
    if (!officeAddress.trim()) return setError("사무실/사업장 주소를 입력해 주세요")
    if (businessCertUrls.length === 0) return setError("사업자등록증 사진을 업로드해 주세요")
    if (role.requiresLicense && licenseUrls.length === 0) {
      return setError(`${role.licenseLabel} 사진을 업로드해 주세요`)
    }
    if (role.type === "agent" && !registrationNumber.trim()) {
      return setError("공인중개사 등록번호를 입력해 주세요")
    }

    setSubmitting(true)
    try {
      const r = await fetch("/api/account-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_type: role.type,
          business_name: businessName.trim(),
          business_number: businessNumber.trim() || null,
          registration_number: registrationNumber.trim() || null,
          office_address: officeAddress.trim(),
          contact_phone: contactPhone.trim() || null,
          intro: intro.trim() || null,
          business_cert_urls: businessCertUrls,
          license_urls: licenseUrls,
          extra_docs_urls: extraDocsUrls,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "신청에 실패했습니다")
      onSubmitted(data.request)
    } catch (e: any) {
      setError(e?.message || "신청에 실패했습니다")
    } finally {
      setSubmitting(false)
    }
  }

  const RoleIcon = role.icon

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full sm:w-auto sm:min-w-[420px] max-w-lg mx-auto bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="safe-top sticky top-0 bg-card border-b border-border rounded-t-2xl px-5 py-3 flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", role.bgClass)}>
            <RoleIcon className={cn("w-5 h-5", role.iconClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">{role.label} 신청</h3>
            <p className="text-xs text-muted-foreground truncate">{role.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -mr-1 rounded-full hover:bg-muted text-muted-foreground"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <div className="space-y-1.5">
            <Label>사업장(상호)명 <span className="text-red-500">*</span></Label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="예: 춘천부동산"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              {role.type === "agent" ? "중개사 등록번호" : "사업자등록번호"}
            </Label>
            <Input
              value={businessNumber}
              onChange={(e) => setBusinessNumber(e.target.value)}
              placeholder={role.type === "agent" ? "예: 2020-강원춘천-00001" : "123-45-67890"}
              maxLength={20}
            />
          </div>

          {role.type === "agent" && (
            <div className="space-y-1.5">
              <Label>공인중개사 등록번호 <span className="text-red-500">*</span></Label>
              <Input
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="예: 2020-강원춘천-00001"
                maxLength={50}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>사무실 / 사업장 주소 <span className="text-red-500">*</span></Label>
            <Input
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              placeholder="예: 강원 춘천시 중앙로 123, 2층"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label>연락처</Label>
            <Input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="010-0000-0000"
              inputMode="tel"
              maxLength={20}
            />
          </div>

          <div className="space-y-1.5">
            <Label>사업/서비스 소개 (선택)</Label>
            <Textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="어떤 서비스를 제공하는지 간단히 소개해 주세요"
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              사업자등록증 사진 <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">선명하게 촬영한 사업자등록증(또는 해당 증빙)을 올려주세요. 개인정보는 가려도 괜찮지만 상호·등록번호는 보여야 합니다.</p>
            <ImageUpload images={businessCertUrls} onChange={setBusinessCertUrls} maxImages={3} />
          </div>

          {role.requiresLicense && (
            <div className="space-y-1.5">
              <Label>
                {role.licenseLabel} 사진 <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-muted-foreground">{role.licenseLabel} 원본 사진을 올려주세요.</p>
              <ImageUpload images={licenseUrls} onChange={setLicenseUrls} maxImages={3} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>추가 서류 (선택)</Label>
            <p className="text-xs text-muted-foreground">
              심사에 도움이 되는 추가 서류가 있으면 올려주세요 (예: 포트폴리오, 경력 증명서 등).
            </p>
            <ImageUpload images={extraDocsUrls} onChange={setExtraDocsUrls} maxImages={5} />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm px-3 py-2">
              {error}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            제출하신 서류는 심사 목적으로만 사용되며 승인·반려 후 안전하게 보관됩니다.
            허위 서류 제출 시 계정 이용이 제한될 수 있습니다.
          </p>
        </div>

        {/* 푸터 */}
        <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>
            취소
          </Button>
          <Button onClick={submit} disabled={submitting} className="flex-1">
            {submitting ? "제출 중…" : "신청 제출"}
          </Button>
        </div>
      </div>
    </div>
  )
}
