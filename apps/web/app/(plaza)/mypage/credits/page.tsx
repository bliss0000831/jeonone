"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Sparkles, Check, CreditCard, Zap } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { BottomNav } from "@/components/bottom-nav"
import { cn } from "@/lib/utils"
import {
  CREDIT_PRODUCTS,
  CreditProduct,
  formatCredits,
  IS_BETA_FREE,
  POINTS_PER_CREDIT,
  AI_VIDEO_UI_ENABLED,
} from "@/lib/ai-video/pricing"
import { toast } from "sonner"

type Provider = "toss" | "kakaopay"

export default function CreditsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState<number>(0) // 포인트
  const [accountType, setAccountType] = useState<string | null>(null)
  const [selected, setSelected] = useState<CreditProduct>(CREDIT_PRODUCTS[1])
  const [provider, setProvider] = useState<Provider>("toss")
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // AI 영상 기능 비활성 — 사용자 직접 진입 시 마이페이지로 보냄
    if (!AI_VIDEO_UI_ENABLED) {
      router.replace("/mypage")
      return
    }
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace("/auth/login?redirect=/mypage/credits")
        return
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("video_credits, account_type")
        .eq("id", user.id)
        .single()
      setBalance(profile?.video_credits ?? 0)
      setAccountType(profile?.account_type ?? null)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePurchase = async () => {
    if (!agreed) {
      toast.error("약관에 동의해주세요")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/payments/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCode: selected.code, provider }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "결제 실패")

      if (json.betaFree) {
        toast.success(
          `🎉 BETA 기간 무료 지급 완료!\n${selected.label}이 지급되었습니다.\n현재 잔액: ${formatCredits(
            json.newBalance,
          )} 크레딧`,
        )
      } else {
        toast.success(`결제 완료! ${selected.label} 지급 완료`)
      }
      setBalance(json.newBalance)
      setAgreed(false)
    } catch (e: any) {
      toast.error(e?.message || "오류가 발생했습니다")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  // 공인중개사가 아니면 안내
  if (accountType !== "agent") {
    return (
      <div className="min-h-screen bg-background">
        <header className="px-4 py-3 border-b border-border flex items-center gap-3">
          <Link href="/mypage" className="p-2 -ml-2 rounded-full hover:bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold">AI 영상 크레딧</h1>
        </header>
        <div className="px-5 py-10 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-purple-500" />
          </div>
          <h2 className="font-bold text-lg">공인중개사 전용 기능입니다</h2>
          <p className="text-sm text-muted-foreground">
            AI 홍보영상 생성은 공인중개사 계정만 이용할 수 있습니다.
          </p>
          <Link href="/mypage/account-upgrade">
            <Button className="mt-4">공인중개사 인증하러 가기</Button>
          </Link>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="safe-top px-4 py-3 border-b border-border flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur z-10">
        <Link href="/mypage" className="p-2 -ml-2 rounded-full hover:bg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-semibold">AI 영상 크레딧 충전</h1>
      </header>

      {/* 현재 잔액 */}
      <section className="px-5 pt-5">
        <div className="rounded-2xl p-5 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white shadow-lg">
          <div className="flex items-center gap-2 text-xs font-semibold opacity-90">
            <Sparkles className="w-3.5 h-3.5" />
            현재 보유 크레딧
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-black">{formatCredits(balance)}</span>
            <span className="text-lg font-semibold opacity-90">크레딧</span>
          </div>
          <p className="text-[11px] opacity-80 mt-1">
            {IS_BETA_FREE
              ? "BETA: 15초 영상 전용 · 0.5 크레딧 차감 (정식 출시 후 30초/60초 개방)"
              : "1 크레딧 = 30초 영상 1개 (15초: 0.5 / 60초: 2)"}
          </p>
        </div>
      </section>

      {/* BETA 배너 */}
      {IS_BETA_FREE && (
        <section className="px-5 mt-4">
          <div className="rounded-xl p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-xs text-green-900 dark:text-green-100 flex items-start gap-2">
            <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">🎉 BETA 기간 100% 무료</p>
              <p className="mt-0.5 opacity-90">
                결제를 진행해도 <b>돈이 빠져나가지 않으며</b>, 선택한 크레딧이 즉시
                무료로 지급됩니다. 정식 출시 후 구매하신 실결제 크레딧도 그대로
                유지됩니다.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 상품 선택 */}
      <section className="px-5 mt-6">
        <h2 className="text-sm font-bold mb-3">크레딧 상품</h2>
        <div className="space-y-2.5">
          {CREDIT_PRODUCTS.map((p) => {
            const isSelected = selected.code === p.code
            return (
              <button
                key={p.code}
                type="button"
                onClick={() => setSelected(p)}
                className={cn(
                  "w-full rounded-xl border-2 p-4 text-left transition-all",
                  isSelected
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30 shadow-md"
                    : "border-border bg-card hover:border-purple-300",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base">{p.label}</span>
                      {p.tag && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-pink-500 text-white">
                          {p.tag}
                        </span>
                      )}
                      {p.savingPct > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-700 dark:text-green-400">
                          {p.savingPct}% 할인
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      크레딧당 {p.unitKrw.toLocaleString()}원 · 영상 {p.credits}개 분량
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-lg">
                      {p.priceKrw.toLocaleString()}
                      <span className="text-xs font-medium">원</span>
                    </div>
                    {isSelected && (
                      <div className="mt-0.5 flex justify-end">
                        <Check className="w-4 h-4 text-purple-500" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* 결제수단 */}
      <section className="px-5 mt-6">
        <h2 className="text-sm font-bold mb-3">결제 수단</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <ProviderButton
            active={provider === "toss"}
            onClick={() => setProvider("toss")}
            label="토스페이"
            sub="카드·간편결제"
            colorClass="bg-blue-500"
            emoji="💳"
          />
          <ProviderButton
            active={provider === "kakaopay"}
            onClick={() => setProvider("kakaopay")}
            label="카카오페이"
            sub="간편결제"
            colorClass="bg-yellow-400"
            emoji="💛"
          />
        </div>
      </section>

      {/* 요약 + 약관 + 결제 버튼 */}
      <section className="px-5 mt-6 space-y-4">
        <div className="rounded-xl bg-secondary/50 p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">선택 상품</span>
            <span className="font-semibold">{selected.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">지급</span>
            <span className="font-semibold">
              {selected.credits} 크레딧 ({selected.points} 포인트)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">결제 금액</span>
            <span className="font-black text-base">
              {IS_BETA_FREE ? (
                <>
                  <s className="text-muted-foreground font-normal">
                    {selected.priceKrw.toLocaleString()}원
                  </s>{" "}
                  <span className="text-green-600">0원 (BETA)</span>
                </>
              ) : (
                `${selected.priceKrw.toLocaleString()}원`
              )}
            </span>
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-purple-500 cursor-pointer flex-shrink-0"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            크레딧은 <b>영상 생성에만 사용</b>되며, 환불이 불가합니다. 개인정보 제공 및
            결제대행 서비스 이용약관에 동의합니다.
          </span>
        </label>

        <Button
          onClick={handlePurchase}
          disabled={!agreed || submitting}
          className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-base font-bold disabled:opacity-50"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          {submitting
            ? "처리 중..."
            : IS_BETA_FREE
              ? `무료로 ${selected.credits} 크레딧 받기`
              : `${selected.priceKrw.toLocaleString()}원 결제하기`}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          문제가 발생하면 고객센터로 문의해주세요.
          <br />
          결제 수단은 실제 결제 시점에 최종 확인됩니다.
        </p>
      </section>

      <BottomNav />
    </div>
  )
}

function ProviderButton({
  active,
  onClick,
  label,
  sub,
  colorClass,
  emoji,
}: {
  active: boolean
  onClick: () => void
  label: string
  sub: string
  colorClass: string
  emoji: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 p-3 text-left transition-all",
        active
          ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30 shadow"
          : "border-border bg-card hover:border-purple-300",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center text-sm",
            colorClass,
          )}
        >
          {emoji}
        </div>
        <span className="font-bold text-sm">{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </button>
  )
}
