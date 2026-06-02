"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { ArrowLeft, Loader2, Banknote, ShieldAlert } from "lucide-react"
import { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BANK_CODES } from "@/lib/local-food-orders"

export default function SettlementPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verified, setVerified] = useState(false)
  const [form, setForm] = useState({
    bank_code: "",
    bank_account: "",
    account_holder: "",
    business_number: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login?redirect=/mypage/settlement")
        return
      }
      setUser(user)
      const res = await fetch("/api/producer-settlement", { cache: "no-store" })
      const data = await res.json()
      if (data.settlement) {
        setForm({
          bank_code: data.settlement.bank_code || "",
          bank_account: data.settlement.bank_account || "",
          account_holder: data.settlement.account_holder || "",
          business_number: data.settlement.business_number || "",
        })
        setVerified(!!data.settlement.is_verified)
      }
      setLoading(false)
    }
    init()
  }, [router])

  const submit = async () => {
    setError(null)
    if (!form.bank_code || !form.bank_account || !form.account_holder) {
      setError("은행/계좌번호/예금주는 필수입니다")
      return
    }
    setSaving(true)
    const bank_name = BANK_CODES.find((b) => b.code === form.bank_code)?.name || ""
    const res = await fetch("/api/producer-settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, bank_name }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error || "저장 실패")
      return
    }
    setSavedAt(new Date().toLocaleTimeString("ko-KR"))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-xl mx-auto px-4 py-6">
        <Link
          href="/mypage/sales"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 판매 관리
        </Link>

        <div className="flex items-center gap-2 mb-6">
          <Banknote className="w-6 h-6 text-emerald-600" />
          <h1 className="text-xl font-bold">정산 계좌</h1>
        </div>

        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-3 mb-5">
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              구매확정된 주문의 정산금이 입금될 계좌입니다. 본인 명의 계좌만 등록 가능하며,
              실제 입금은 PortOne·은행 인증 도입 후 시작됩니다.
            </span>
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="bank" className="text-xs">은행 *</Label>
            <select
              id="bank"
              value={form.bank_code}
              onChange={(e) => setForm({ ...form, bank_code: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            >
              <option value="">선택</option>
              {BANK_CODES.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="account" className="text-xs">계좌번호 * (숫자만)</Label>
            <Input
              id="account"
              value={form.bank_account}
              onChange={(e) =>
                setForm({ ...form, bank_account: e.target.value.replace(/[^0-9]/g, "") })
              }
              placeholder="-없이 숫자만"
              className="mt-1 font-mono"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label htmlFor="holder" className="text-xs">예금주 *</Label>
            <Input
              id="holder"
              value={form.account_holder}
              onChange={(e) => setForm({ ...form, account_holder: e.target.value })}
              placeholder="본인 명의"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="business" className="text-xs">사업자등록번호 (선택)</Label>
            <Input
              id="business"
              value={form.business_number}
              onChange={(e) =>
                setForm({ ...form, business_number: e.target.value.replace(/[^0-9]/g, "") })
              }
              placeholder="없으면 비워둠"
              className="mt-1 font-mono"
              inputMode="numeric"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              미등록 시 연 매출 한도가 적용될 수 있습니다.
            </p>
          </div>

          {error && (
            <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-md text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
          {savedAt && (
            <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-md text-sm text-emerald-700 dark:text-emerald-300">
              ✅ {savedAt} 에 저장되었습니다
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            인증 상태:{" "}
            {verified ? (
              <span className="text-emerald-600 font-semibold">인증됨</span>
            ) : (
              <span>미인증 (인증 도입 후 자동 처리)</span>
            )}
          </div>

          <Button
            onClick={submit}
            disabled={saving}
            className="w-full h-12 text-base font-medium"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
