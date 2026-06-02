"use client"

/**
 * 올리기권 충전 페이지.
 *  - 잔액 표시
 *  - 팩 4종 (1/5/10/30 장) 가격 표시
 *  - 결제: 카드 (PortOne 연동 예정 — 현재 테스트)
 *  - 포인트 충전 옵션 폐지
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Ticket, CreditCard, Loader2, Check } from "lucide-react"
import { toast } from "sonner"
import { Header } from "@/components/header"
import { BottomNav } from "@/components/bottom-nav"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface Pack {
  id: string
  size: number
  krw_price: number
  points_price: number
  display_label: string
  description: string | null
  enabled: boolean
  sort_order: number
}

export default function BumpTicketsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [balance, setBalance] = useState(0)
  const [packs, setPacks] = useState<Pack[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
  // 결제 수단 — 카드(PortOne) 단일. 포인트 충전은 폐지.
  const paymentMethod = "cash" as const

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/auth/login?redirect=/bump-tickets")
        return
      }
      setUser(data.user)
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    fetch("/api/bump/tickets")
      .then((r) => r.json())
      .then((j) => {
        setBalance(j.balance ?? 0)
        setPacks(j.packs ?? [])
      })
      .finally(() => setLoading(false))
  }, [user])

  const purchase = async (packId: string) => {
    setSubmitting(packId)
    try {
      const res = await fetch("/api/bump/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId,
          payment: paymentMethod,
          paymentId: paymentMethod === "cash" ? "DEV_STUB" : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        const map: Record<string, string> = {
          pack_not_found: "팩 정보를 찾을 수 없어요",
          feature_disabled: "지금은 충전할 수 없어요",
        }
        toast.error(map[json.error] ?? `구매 실패 (${json.error})`)
        return
      }
      toast.success(`${json.added}장 충전되었어요 (잔액 ${json.balance}장)`)
      setBalance(json.balance)
      setSelectedPack(null)
    } finally {
      setSubmitting(null)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header user={user} />
      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        <Link
          href="/mypage"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          마이페이지
        </Link>

        {/* 잔액 카드 */}
        <div className="rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white p-5 shadow-lg shadow-rose-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80 mb-1">보유 올리기권</p>
              <p className="text-3xl font-bold flex items-end gap-1">
                {balance.toLocaleString()}
                <span className="text-base font-medium opacity-80 mb-1">장</span>
              </p>
            </div>
            <Ticket className="w-12 h-12 opacity-50" />
          </div>
          <p className="text-xs opacity-80 mt-3 leading-relaxed">
            1장 = 작성한 글을 한 번 최신순 맨 위로 끌어올립니다.
          </p>
          <p className="text-[11px] opacity-75 mt-1 leading-relaxed">
            사용 가능: 부동산 · 중고거래 · 나눔 · 공동구매 · 로컬푸드 · 구인구직 · 신장개업 · 인테리어 · 이사 · 청소 · 수리
          </p>
        </div>

        {/* 결제 수단 — 카드 단일 (PortOne 연동 자리) */}
        <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2 text-sm">
          <CreditCard className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">카드로 결제</p>
            <p className="text-[11px] text-muted-foreground">
              사업자 등록 후 PortOne 연동 — 현재는 테스트 결제로 진행
            </p>
          </div>
        </div>

        {/* 팩 목록 */}
        <div className="space-y-2">
          {packs.map((p) => {
            const isBest = p.id === "pack_30"
            const price = p.krw_price
            const unit = "원"
            const isSelected = selectedPack === p.id
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPack(p.id)}
                className={cn(
                  "w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all relative",
                  isSelected
                    ? "border-rose-400 bg-rose-50/60 dark:bg-rose-950/30"
                    : "border-border bg-card hover:border-rose-200",
                )}
              >
                {isBest && (
                  <span className="absolute -top-2 right-3 text-[10px] font-bold bg-rose-500 text-white px-2 py-0.5 rounded-full">
                    BEST
                  </span>
                )}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-base flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-rose-500" />
                    {p.display_label}
                  </span>
                  <span className="font-bold text-lg">
                    {price.toLocaleString()}
                    <span className="text-xs font-medium ml-0.5">{unit}</span>
                  </span>
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                )}
              </button>
            )
          })}
        </div>

        {/* 구매 버튼 */}
        {selectedPack && (
          <button
            onClick={() => purchase(selectedPack)}
            disabled={submitting != null}
            className={cn(
              "w-full py-3.5 rounded-xl text-sm font-bold transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
            )}
          >
            {submitting === selectedPack ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                처리 중...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Check className="w-4 h-4" />
                구매하기
              </span>
            )}
          </button>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed">
          • 올리기권은 광장(춘천/원주/강릉 등) 단위로 관리됩니다. 다른 광장에서는 별도 충전이 필요합니다.
          <br />
          • 환불 정책: 사용하지 않은 올리기권은 구매일로부터 7일 이내 고객센터로 문의 시 환불 가능합니다.
        </p>
      </main>
      <BottomNav />
    </div>
  )
}
