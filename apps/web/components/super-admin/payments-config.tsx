"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Save,
} from "lucide-react"
import { SuperAdminThemeWrapper } from "./theme-wrapper"
import { SuperAdminThemeToggle } from "./theme-toggle"
import { toast } from "sonner"

interface PlazaPayment {
  id: string
  name: string
  parent_region: string | null
  pg_provider: string | null
  portone_store_id: string | null
  portone_channel_key: string | null
  business_number: string | null
  business_name: string | null
  business_holder: string | null
  settlement_email: string | null
  payments_enabled: boolean
}

export function PaymentsConfig() {
  const [plazas, setPlazas] = useState<PlazaPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/super-admin/plaza-payments", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.plazas) setPlazas(data.plazas)
      })
      .finally(() => setLoading(false))
  }, [])

  const updateField = (id: string, key: keyof PlazaPayment, value: any) => {
    setPlazas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    )
  }

  const save = async (p: PlazaPayment) => {
    setSavingId(p.id)
    setSavedId(null)
    try {
      const res = await fetch("/api/super-admin/plaza-payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plaza_id: p.id,
          pg_provider: p.pg_provider || "mock",
          portone_store_id: p.portone_store_id || null,
          portone_channel_key: p.portone_channel_key || null,
          business_number: p.business_number || null,
          business_name: p.business_name || null,
          business_holder: p.business_holder || null,
          settlement_email: p.settlement_email || null,
          payments_enabled: p.payments_enabled,
        }),
      })
      if (res.ok) {
        setSavedId(p.id)
        setTimeout(() => setSavedId((cur) => (cur === p.id ? null : cur)), 2000)
      } else {
        const j = await res.json()
        toast.error(j.error || "저장 실패")
      }
    } finally {
      setSavingId(null)
    }
  }

  return (
    <SuperAdminThemeWrapper>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link
              href="/super-admin"
              className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <CreditCard className="w-5 h-5 text-amber-500" />
            <h1 className="font-bold text-gray-900 dark:text-white">광장별 결제 설정</h1>
            <div className="ml-auto">
              <SuperAdminThemeToggle />
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-6">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-4 mb-6 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">PortOne 채널 분리 정산</p>
              <p className="text-xs leading-relaxed">
                각 광장 운영자가 자기 사업자등록증으로 PortOne 에 채널을 추가하고,
                여기에 store ID + channel key 를 입력하면 광장별로 결제 / 정산이 분리됩니다.
                <br />
                <strong>payments_enabled</strong> 가 ON 이고 channel key 가 있으면 실 결제가 활성화되며,
                그렇지 않으면 mock 결제로 진행됩니다.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {plazas.map((p) => {
                const liveReady = p.payments_enabled && !!p.portone_channel_key
                return (
                  <div
                    key={p.id}
                    className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5"
                  >
                    {/* 헤더 */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-500" />
                        <h2 className="font-bold text-gray-900 dark:text-white">{p.name}</h2>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {p.parent_region}
                        </span>
                        {liveReady ? (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            실결제 활성
                          </span>
                        ) : (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            테스트 모드
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {/* PortOne */}
                      <fieldset className="space-y-3">
                        <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          PortOne 채널
                        </legend>
                        <Field
                          label="PG Provider"
                          value={p.pg_provider || "mock"}
                          onChange={(v) => updateField(p.id, "pg_provider", v)}
                          select
                          options={[
                            { v: "mock", l: "mock (개발)" },
                            { v: "portone", l: "PortOne (실결제)" },
                          ]}
                        />
                        <Field
                          label="Store ID"
                          value={p.portone_store_id || ""}
                          onChange={(v) => updateField(p.id, "portone_store_id", v)}
                          placeholder="store-xxxxxxxxxxxxxxxx"
                        />
                        <Field
                          label="Channel Key"
                          value={p.portone_channel_key || ""}
                          onChange={(v) => updateField(p.id, "portone_channel_key", v)}
                          placeholder="channel-key-xxxxxxxx"
                        />
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={!!p.payments_enabled}
                            onChange={(e) => updateField(p.id, "payments_enabled", e.target.checked)}
                            className="w-4 h-4"
                          />
                          결제 기능 활성화
                        </label>
                      </fieldset>

                      {/* 사업자 */}
                      <fieldset className="space-y-3">
                        <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          사업자 정보
                        </legend>
                        <Field
                          label="사업자등록번호"
                          value={p.business_number || ""}
                          onChange={(v) => updateField(p.id, "business_number", v)}
                          placeholder="000-00-00000"
                        />
                        <Field
                          label="상호"
                          value={p.business_name || ""}
                          onChange={(v) => updateField(p.id, "business_name", v)}
                          placeholder="(주)광장"
                        />
                        <Field
                          label="대표자명"
                          value={p.business_holder || ""}
                          onChange={(v) => updateField(p.id, "business_holder", v)}
                        />
                        <Field
                          label="정산 알림 이메일"
                          value={p.settlement_email || ""}
                          onChange={(v) => updateField(p.id, "settlement_email", v)}
                          placeholder="settle@example.com"
                        />
                      </fieldset>
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-gray-800">
                      {savedId === p.id && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          저장됨
                        </span>
                      )}
                      <button
                        onClick={() => save(p)}
                        disabled={savingId === p.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {savingId === p.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        저장
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </SuperAdminThemeWrapper>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  select,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  select?: boolean
  options?: { v: string; l: string }[]
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      {select && options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          {options.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400"
        />
      )}
    </label>
  )
}
