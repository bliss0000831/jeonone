"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft,
  Loader2,
  Phone,
  Building2,
  FileCheck2,
  Leaf,
  Wrench,
  Upload,
  X,
  CheckCircle,
  Clock,
  XCircle,
  Shield,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// 신청 타입 정의 ─────────────────────────────────────────────
type VerifyType = "phone" | "business" | "agent" | "producer" | "service"

interface TypeDef {
  id: VerifyType
  label: string
  icon: any
  targetRole: string[] // 이 계정 타입만 노출
  description: string
  fields: Array<{
    key: string
    label: string
    placeholder?: string
    type?: "text" | "textarea" | "tel"
    required?: boolean
  }>
  /** 업로드해야 할 문서 종류 (라벨) — 1개 이상 */
  docs: string[]
}

const TYPES: TypeDef[] = [
  {
    id: "phone",
    label: "휴대폰 인증",
    icon: Phone,
    targetRole: ["user", "business", "agent", "producer", "interior", "moving", "cleaning", "repair"],
    description: "본인 명의 휴대폰 번호를 인증합니다.",
    fields: [
      { key: "phone", label: "휴대폰 번호", placeholder: "010-0000-0000", type: "tel", required: true },
      { key: "holder_name", label: "명의자 이름", required: true },
    ],
    docs: ["명의자 확인 서류 (선택)"],
  },
  {
    id: "business",
    label: "사업자 인증",
    icon: Building2,
    targetRole: ["business"],
    description: "사업자등록증을 업로드하여 사장님 인증을 받습니다.",
    fields: [
      { key: "company_name", label: "상호명", required: true },
      { key: "representative_name", label: "대표자명", required: true },
      { key: "business_number", label: "사업자등록번호", placeholder: "000-00-00000", required: true },
      { key: "address", label: "사업장 주소", required: true },
    ],
    docs: ["사업자등록증"],
  },
  {
    id: "agent",
    label: "공인중개사 자격증 인증",
    icon: FileCheck2,
    targetRole: ["agent"],
    description: "중개사 등록증과 사업자등록증을 업로드합니다.",
    fields: [
      { key: "office_name", label: "중개사무소 상호", required: true },
      { key: "representative_name", label: "대표자명", required: true },
      { key: "license_number", label: "중개사 등록번호", required: true },
      { key: "phone", label: "사무실 연락처", type: "tel", required: true },
      { key: "address", label: "사무소 주소", required: true },
    ],
    docs: ["중개사 등록증"],
  },
  {
    id: "producer",
    label: "로컬푸드 생산자 인증",
    icon: Leaf,
    targetRole: ["producer"],
    description: "농장/생산시설 사진 및 관련 서류를 제출합니다.",
    fields: [
      { key: "farm_name", label: "농장/시설명", required: true },
      { key: "representative_name", label: "대표자명", required: true },
      { key: "products", label: "주요 생산물", placeholder: "예: 사과, 배, 토마토" },
      { key: "address", label: "농장 주소", required: true },
    ],
    docs: ["생산자 확인 서류 (농지원부, 친환경 인증서 등)"],
  },
  {
    id: "service",
    label: "전문가 인증",
    icon: Wrench,
    targetRole: ["interior", "moving", "cleaning", "repair"],
    description: "포트폴리오와 경력 서류를 제출하여 전문가 인증을 받습니다.",
    fields: [
      { key: "company_name", label: "상호명", required: true },
      { key: "representative_name", label: "대표자명", required: true },
      { key: "career_years", label: "경력 연차", placeholder: "예: 5년" },
      { key: "description", label: "활동 소개", type: "textarea" },
    ],
    docs: ["사업자등록증 또는 경력 증빙"],
  },
]

interface ExistingRequest {
  id: string
  type: string
  status: "pending" | "approved" | "rejected"
  reject_reason: string | null
  created_at: string
}

export default function VerifyPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyPage />
    </Suspense>
  )
}

function VerifyPage() {
  const router = useRouter()
  const search = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const [userId, setUserId] = useState<string | null>(null)
  const [accountType, setAccountType] = useState<string>("user")
  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState<ExistingRequest[]>([])

  const initialType = (search.get("type") as VerifyType) || null
  const [selected, setSelected] = useState<VerifyType | null>(initialType)

  const [formData, setFormData] = useState<Record<string, string>>({})
  const [docUrls, setDocUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = "/auth/login?redirect=/mypage/verify"
        return
      }
      setUserId(user.id)
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .single()
      setAccountType(profile?.account_type || "user")

      const { data: reqs } = await supabase
        .from("verification_requests")
        .select("id, type, status, reject_reason, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
      setExisting((reqs as ExistingRequest[]) || [])
      setLoading(false)
    })()
  }, [supabase])

  // 계정 타입에 맞는 인증 종류만 필터
  const availableTypes = useMemo(
    () => TYPES.filter((t) => t.targetRole.includes(accountType)),
    [accountType],
  )

  const selectedDef = selected ? TYPES.find((t) => t.id === selected) : null

  const handleDocPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ""
    if (files.length === 0) return
    setUploading(true)
    try {
      // 배치 업데이트 — 이전: N파일 × O(N) 배열 복사 = O(N²)
      const newUrls: string[] = []
      for (const file of files) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/board/upload", { method: "POST", body: fd })
        if (!res.ok) throw new Error("파일 업로드 실패")
        const { url } = await res.json()
        newUrls.push(url)
      }
      setDocUrls((arr) => [...arr, ...newUrls])
    } catch (e: any) {
      toast.error(e?.message || "업로드 실패")
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveDoc = (i: number) =>
    setDocUrls((arr) => arr.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    if (!selectedDef || !userId) return

    // required 필드 검사
    for (const f of selectedDef.fields) {
      if (f.required && !formData[f.key]?.trim()) {
        toast.error(`${f.label}을(를) 입력해주세요`)
        return
      }
    }
    if (docUrls.length === 0) {
      toast.error(`${selectedDef.docs[0]}을(를) 업로드해주세요`)
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from("verification_requests").insert({
        user_id: userId,
        type: selectedDef.id,
        status: "pending",
        data: formData,
        documents: docUrls,
      })
      if (error) throw error
      toast.success("인증 요청이 접수되었습니다. 심사 결과를 기다려주세요.")
      router.push("/mypage")
    } catch (e: any) {
      toast.error(e?.message || "신청 실패")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="safe-top sticky top-0 z-50 bg-card/90 backdrop-blur border-b border-border">
        <div className="flex items-center px-3 h-14">
          <button
            onClick={() => (selected ? setSelected(null) : router.back())}
            className="p-2 -ml-1 rounded-full hover:bg-secondary"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-base ml-1">
            {selectedDef ? selectedDef.label : "인증 신청"}
          </h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {!selected ? (
          <>
            {/* 안내 */}
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-primary">
                <Shield className="w-5 h-5" />
                <h2 className="font-semibold">인증은 신뢰를 만듭니다</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                인증 심사는 영업일 기준 1~3일 이내 처리됩니다. 신청 후 결과는
                이 페이지에서 확인할 수 있습니다.
              </p>
            </div>

            {/* 신청 가능한 종류 */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold px-1">신청 가능한 인증</h3>
              {availableTypes.length === 0 ? (
                <div className="bg-card rounded-xl border border-border py-8 text-center text-sm text-muted-foreground">
                  현재 계정 타입({accountType})에서 신청 가능한 인증이 없습니다
                </div>
              ) : (
                availableTypes.map((t) => {
                  const latest = existing.find((r) => r.type === t.id)
                  const Icon = t.icon
                  const isPending = latest?.status === "pending"
                  const isApproved = latest?.status === "approved"
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (isApproved) {
                          toast.error("이미 승인된 인증입니다")
                          return
                        }
                        if (isPending) {
                          toast.error("심사 대기 중입니다. 결과를 기다려주세요")
                          return
                        }
                        setSelected(t.id)
                        setFormData({})
                        setDocUrls([])
                      }}
                      disabled={isApproved || isPending}
                      className={cn(
                        "w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors",
                        isApproved
                          ? "bg-green-50 border-green-200 cursor-default"
                          : isPending
                            ? "bg-yellow-50 border-yellow-200 cursor-default"
                            : "bg-card border-border hover:bg-secondary/40",
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                          isApproved
                            ? "bg-green-100 text-green-700"
                            : isPending
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{t.label}</span>
                          {isApproved && (
                            <Badge className="bg-green-100 text-green-700 border-green-300">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              승인됨
                            </Badge>
                          )}
                          {isPending && (
                            <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">
                              <Clock className="w-3 h-3 mr-1" />
                              심사중
                            </Badge>
                          )}
                          {latest?.status === "rejected" && (
                            <Badge className="bg-red-100 text-red-700 border-red-300">
                              <XCircle className="w-3 h-3 mr-1" />
                              반려 · 재신청 가능
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {t.description}
                        </p>
                        {latest?.status === "rejected" && latest.reject_reason && (
                          <p className="text-xs text-red-600 mt-1">
                            사유: {latest.reject_reason}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* 이전 신청 이력 */}
            {existing.length > 0 && (
              <div className="space-y-2 pt-4">
                <h3 className="text-sm font-semibold px-1">신청 이력</h3>
                <div className="bg-card rounded-xl border border-border divide-y divide-border">
                  {existing.map((r) => (
                    <div key={r.id} className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">
                          {TYPES.find((t) => t.id === r.type)?.label || r.type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      {r.status === "pending" && (
                        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">
                          <Clock className="w-3 h-3 mr-1" />심사중
                        </Badge>
                      )}
                      {r.status === "approved" && (
                        <Badge className="bg-green-100 text-green-700 border-green-300">
                          <CheckCircle className="w-3 h-3 mr-1" />승인
                        </Badge>
                      )}
                      {r.status === "rejected" && (
                        <Badge className="bg-red-100 text-red-700 border-red-300">
                          <XCircle className="w-3 h-3 mr-1" />반려
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          selectedDef && (
            <>
              <div className="bg-card rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">
                  {selectedDef.description}
                </p>
              </div>

              {/* 입력 폼 */}
              <div className="bg-card rounded-xl border border-border p-4 space-y-4">
                {selectedDef.fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={f.key}>
                      {f.label}
                      {f.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {f.type === "textarea" ? (
                      <Textarea
                        id={f.key}
                        value={formData[f.key] || ""}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder}
                        rows={3}
                      />
                    ) : (
                      <Input
                        id={f.key}
                        type={f.type === "tel" ? "tel" : "text"}
                        value={formData[f.key] || ""}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* 문서 업로드 */}
              <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div>
                  <Label>
                    첨부 서류
                    <span className="text-red-500 ml-1">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedDef.docs.join(", ")} (이미지 10MB 이하)
                  </p>
                </div>

                {docUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {docUrls.map((url, i) => (
                      <div key={i} className="relative aspect-square bg-secondary rounded-lg overflow-hidden">
                        <Image src={url} alt={`doc-${i}`} fill className="object-cover" unoptimized />
                        <button
                          type="button"
                          onClick={() => handleRemoveDoc(i)}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                          aria-label="제거"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleDocPick}
                  />
                  <div
                    className={cn(
                      "w-full py-3 rounded-lg border-2 border-dashed border-border text-sm text-center cursor-pointer hover:bg-secondary/40 transition-colors flex items-center justify-center gap-2",
                      uploading && "opacity-50",
                    )}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        업로드 중...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        이미지 선택 (여러 장 가능)
                      </>
                    )}
                  </div>
                </label>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitting || uploading}
                className="w-full h-12"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    신청 중...
                  </>
                ) : (
                  "인증 신청"
                )}
              </Button>
            </>
          )
        )}
      </div>
    </div>
  )
}
