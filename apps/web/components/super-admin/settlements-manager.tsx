"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Banknote,
  Loader2,
  CheckCircle2,
  Copy,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import { SuperAdminThemeWrapper } from "./theme-wrapper"
import { SuperAdminThemeToggle } from "./theme-toggle"
import { toast } from "sonner"

interface OrderRow {
  id: string
  amount: number
  settlement_amount: number
  fee_amount: number
  confirmed_at: string | null
  settled_at: string | null
  items: { id: string; title: string; quantity: number }[]
}

interface SettlementGroup {
  seller_id: string
  seller_profile: {
    nickname: string | null
    full_name: string | null
    phone: string | null
  } | null
  settlement: {
    bank_name: string | null
    bank_code: string | null
    bank_account: string | null
    account_holder: string | null
    business_number: string | null
  } | null
  orders: OrderRow[]
  total_settlement: number
  order_count: number
}

type StatusFilter = "confirmed" | "settled" | "all"

export function SettlementsManager() {
  const [groups, setGroups] = useState<SettlementGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("confirmed")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [marking, setMarking] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch(
      `/api/super-admin/settlements?status=${statusFilter}`,
      { cache: "no-store" },
    )
    const data = await res.json()
    setGroups(data.groups || [])
    setSelected(new Set())
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const toggleAll = (group: SettlementGroup) => {
    const ids = group.orders.map((o) => o.id)
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => next.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const toggleOne = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const markAsSettled = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`${selected.size}개 주문을 "정산 완료" 처리합니다. 계속하시겠습니까?`)) return
    setMarking(true)
    const res = await fetch("/api/super-admin/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: Array.from(selected) }),
    })
    const data = await res.json()
    setMarking(false)
    if (res.ok) {
      toast.success(`${data.updated || 0}개 주문이 정산 완료로 처리되었습니다.`)
      await load()
    } else {
      toast.error(data.error || "처리 실패")
    }
  }

  const totals = groups.reduce(
    (acc, g) => {
      const selectedOrders = g.orders.filter((o) => selected.has(o.id))
      acc.selectedAmount += selectedOrders.reduce((s, o) => s + (o.settlement_amount || 0), 0)
      acc.selectedCount += selectedOrders.length
      acc.totalAmount += g.total_settlement
      acc.totalCount += g.order_count
      return acc
    },
    { selectedAmount: 0, selectedCount: 0, totalAmount: 0, totalCount: 0 },
  )

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text)
  }

  return (
    <SuperAdminThemeWrapper>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link
              href="/super-admin"
              className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Banknote className="w-5 h-5 text-emerald-500" />
            <h1 className="font-bold text-gray-900 dark:text-white">정산 관리</h1>
            <button
              onClick={load}
              className="ml-auto p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
              title="새로고침"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <SuperAdminThemeToggle />
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-4 mb-6 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold mb-1">정산 절차</p>
              <p>
                ① 구매확정된 주문 (status=&quot;confirmed&quot;) 이 자동으로 정산 대기에 노출됩니다.
                <br />
                ② 운영자가 은행 앱·펌뱅킹으로 판매자 계좌에 송금합니다.
                <br />
                ③ 송금 완료 후 이 페이지에서 해당 주문을 체크 → <strong>정산 완료 표시</strong> 클릭 → 상태가 &quot;settled&quot; 로 전환됩니다.
              </p>
            </div>
          </div>

          {/* 상태 필터 */}
          <div className="flex items-center gap-2 mb-4">
            {(["confirmed", "settled", "all"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-emerald-500 text-white"
                    : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {s === "confirmed" ? "정산 대기" : s === "settled" ? "정산 완료" : "전체"}
              </button>
            ))}
          </div>

          {/* 요약 + 일괄 처리 */}
          <div className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-xs text-gray-500 dark:text-gray-400">표시 중</span>{" "}
              <strong>{totals.totalCount}건</strong> /{" "}
              <strong>{totals.totalAmount.toLocaleString()}원</strong>
              {selected.size > 0 && (
                <span className="ml-3">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">선택됨</span>{" "}
                  <strong>{totals.selectedCount}건</strong> /{" "}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {totals.selectedAmount.toLocaleString()}원
                  </strong>
                </span>
              )}
            </div>
            {statusFilter === "confirmed" && (
              <button
                onClick={markAsSettled}
                disabled={selected.size === 0 || marking}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {marking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                선택 항목 정산 완료 표시 ({selected.size})
              </button>
            )}
          </div>

          {/* 그룹 리스트 */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <Banknote className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                {statusFilter === "confirmed"
                  ? "정산 대기 주문이 없습니다"
                  : "표시할 주문이 없습니다"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const sellerName =
                  g.seller_profile?.nickname || g.seller_profile?.full_name || "이름없음"
                const allSelected = g.orders.every((o) => selected.has(o.id))
                const accountText = g.settlement
                  ? `${g.settlement.bank_name || "?"} ${g.settlement.bank_account} (${g.settlement.account_holder})`
                  : "정산계좌 미등록"
                return (
                  <div
                    key={g.seller_id}
                    className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden"
                  >
                    {/* 헤더 (판매자 정보) */}
                    <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                      {statusFilter === "confirmed" && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleAll(g)}
                          className="w-4 h-4"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {sellerName}
                          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                            {g.seller_profile?.phone || ""}
                          </span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 flex items-center gap-1.5">
                          <Banknote className="w-3 h-3" />
                          {accountText}
                          {g.settlement?.bank_account && (
                            <button
                              onClick={() => copy(g.settlement!.bank_account!)}
                              className="ml-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                              title="계좌번호 복사"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                          {g.settlement?.business_number && (
                            <span className="ml-2">
                              사업자 {g.settlement.business_number}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {g.total_settlement.toLocaleString()}원
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {g.order_count}건
                        </p>
                      </div>
                    </div>

                    {/* 주문 리스트 */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {g.orders.map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm"
                        >
                          {statusFilter === "confirmed" && (
                            <input
                              type="checkbox"
                              checked={selected.has(o.id)}
                              onChange={() => toggleOne(o.id)}
                              className="w-4 h-4"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 dark:text-white truncate">
                              {o.items?.map((i) => `${i.title}×${i.quantity}`).join(", ") || "—"}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              {o.confirmed_at
                                ? `확정: ${new Date(o.confirmed_at).toLocaleDateString("ko-KR")}`
                                : ""}
                              {o.settled_at
                                ? ` · 정산: ${new Date(o.settled_at).toLocaleDateString("ko-KR")}`
                                : ""}
                            </p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-gray-700 dark:text-gray-300">
                              {o.amount.toLocaleString()}
                            </p>
                            <p className="text-gray-500 dark:text-gray-400">
                              -{o.fee_amount.toLocaleString()}
                            </p>
                            <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {o.settlement_amount.toLocaleString()}원
                            </p>
                          </div>
                        </div>
                      ))}
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
