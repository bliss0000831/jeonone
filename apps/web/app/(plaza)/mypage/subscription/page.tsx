/**
 * 내 구독 관리 페이지.
 *
 * 6개월 무료 운영 기간 동안에는 "무료 기간 진행 중" 안내 + 향후 가격표.
 * 활성화 후에는 실제 구독 상태 / 결제 / 취소 가능.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlaza } from '@/lib/plaza/server'
import {
  listActivePlans,
  getCurrentSubscription,
  isFeatureEnabled,
  calculateChargeAmount,
} from '@/lib/services/billing'
import { Header } from '@/components/header'
import { BottomNav } from '@/components/bottom-nav'
import { Badge } from '@/components/ui/badge'
import { SubscribeButton } from '@/components/billing/subscribe-button'
import { Crown, Sparkles, AlertCircle, Calendar } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const plaza = await getCurrentPlaza()
  const [plans, currentSub, monetizationOn] = await Promise.all([
    listActivePlans(),
    plaza ? getCurrentSubscription(user.id, plaza) : null,
    isFeatureEnabled('monetization.subscriptions'),
  ])

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" />
          내 구독
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          공인중개사 / 서비스 업종 가입자를 위한 월정액 구독 정보입니다.
        </p>

        {/* 무료 운영 기간 안내 */}
        {!monetizationOn && (
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-5 mb-6">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-emerald-900 dark:text-emerald-300 mb-1">
                  6개월 무료 운영 기간 진행 중
                </h2>
                <p className="text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed">
                  현재 모든 카테고리가 무료입니다. 지금 가입하시면 추후 유료 전환 시
                  <strong className="font-bold"> 평생 50% 할인 (얼리버드 락인)</strong> 이 적용됩니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 현재 구독 상태 */}
        {currentSub && (
          <div className="rounded-xl border border-border bg-card p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">현재 구독</h3>
              <Badge variant={currentSub.status === 'free_period' ? 'default' : 'secondary'}>
                {statusLabel(currentSub.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-1">플랜 ID: {currentSub.plan_id}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(currentSub.current_period_start).toLocaleDateString('ko-KR')} ~{' '}
              {new Date(currentSub.current_period_end).toLocaleDateString('ko-KR')}
            </p>
            {currentSub.is_early_bird && (
              <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-medium">
                <Sparkles className="w-3 h-3" />
                얼리버드 — 평생 {currentSub.applied_discount_pct}% 할인
              </div>
            )}
          </div>
        )}

        {/* 플랜 목록 */}
        <h2 className="text-lg font-bold mb-3">사용 가능한 플랜</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((plan: any) => {
            const charge = calculateChargeAmount(plan, true)
            return (
              <div
                key={plan.id}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
              >
                <h3 className="font-bold mb-1">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>

                <div className="mb-4">
                  {plan.monthly_price === 0 ? (
                    <p className="text-2xl font-bold">무료</p>
                  ) : (
                    <>
                      <p className="text-2xl font-bold">
                        {charge.net.toLocaleString()}
                        <span className="text-sm font-normal text-muted-foreground">
                          {' '}원/월
                        </span>
                      </p>
                      {!monetizationOn && charge.discount > 0 && (
                        <p className="text-xs text-muted-foreground line-through">
                          정상가 {plan.monthly_price.toLocaleString()}원
                        </p>
                      )}
                      {!monetizationOn && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          얼리버드 평생 {plan.early_bird_discount_pct}% 할인
                        </p>
                      )}
                    </>
                  )}
                </div>

                <SubscribeButton
                  planId={plan.id}
                  disabled={!!currentSub && currentSub.plan_id === plan.id}
                  freePeriod={!monetizationOn}
                />
              </div>
            )
          })}
        </div>

        {/* 활성화 전 안내 */}
        {!monetizationOn && (
          <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">결제는 언제 시작되나요?</p>
                <p>
                  6개월 무료 운영 기간 종료 후 결제가 시작됩니다. 그 전까지는 모든 기능을
                  무료로 사용하실 수 있습니다.
                </p>
                <p>
                  무료 기간 중 가입하신 분은 유료 전환 시 <strong>평생 50% 할인</strong> 이
                  자동 적용되며, 별도 신청은 필요 없습니다.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link href="/mypage" className="text-sm text-muted-foreground hover:underline">
            ← 마이페이지로
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}

function statusLabel(s: string): string {
  switch (s) {
    case 'free_period': return '무료 기간'
    case 'active': return '활성'
    case 'pending': return '결제 대기'
    case 'past_due': return '결제 필요'
    case 'canceled': return '취소됨'
    case 'expired': return '만료'
    default: return s
  }
}

