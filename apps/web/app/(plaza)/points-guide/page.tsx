/**
 * 포인트 제도 안내 — 사용자에게 적립/사용 정책을 투명하게 공개.
 *
 * 데이터: point_rules + point_redemption_settings (DB 값 그대로 표시)
 * → 관리자가 정책 바꾸면 이 페이지도 자동 갱신
 */
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/header'
import { BottomNav } from '@/components/bottom-nav'
import {
  listRules,
  listRedemptionSettings,
  isFeatureEnabled,
  type PointRule,
  type RedemptionSetting,
} from '@/lib/services/billing'
import {
  Coins,
  Sparkles,
  ShieldCheck,
  Clock,
  TrendingUp,
  AlertTriangle,
  Gift,
  CheckCircle2,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PointsGuidePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [rules, redemptions, pointsEnabled] = await Promise.all([
    listRules(),
    listRedemptionSettings(),
    isFeatureEnabled('monetization.points'),
  ])

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header user={user} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 헤더 */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <Coins className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">포인트 제도 안내</h1>
            <p className="text-sm text-muted-foreground mt-1">
              활동으로 포인트를 모으고, 공동구매 / 로컬푸드 등에서 현금처럼 사용할 수 있어요.
            </p>
          </div>
        </div>

        {/* 시작 안내 */}
        {!pointsEnabled && (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  포인트 제도 곧 시작!
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                  현재는 준비 중이며, 정식 시작 시 가입자 모두에게{' '}
                  <strong>가입 보너스 100pt</strong> 가 자동 지급됩니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 한눈에 보기 */}
        <Section
          title="1. 한눈에 보는 포인트 흐름"
          icon={<TrendingUp className="w-4 h-4" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <FlowStep number="1" title="활동" desc="글/댓글/매물 등록" />
            <FlowStep number="2" title="평가 (24시간)" desc="신고 없으면 확정" />
            <FlowStep number="3" title="사용" desc="공구·로컬푸드 결제 시 할인" />
          </div>
        </Section>

        {/* 적립 방법 */}
        <Section
          title="2. 어떻게 적립하나요?"
          icon={<Gift className="w-4 h-4" />}
        >
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">활동</th>
                  <th className="text-right px-3 py-2 font-medium">포인트</th>
                  <th className="text-center px-3 py-2 font-medium hidden sm:table-cell">하루 한도</th>
                  <th className="text-center px-3 py-2 font-medium hidden md:table-cell">조건</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.display_name}</div>
                      {r.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-bold text-amber-600 tabular-nums">+{r.amount}pt</span>
                    </td>
                    <td className="px-3 py-2.5 text-center hidden sm:table-cell text-xs text-muted-foreground">
                      {r.daily_cap ? `${r.daily_cap}회` : '무제한'}
                    </td>
                    <td className="px-3 py-2.5 text-center hidden md:table-cell text-xs text-muted-foreground">
                      {ruleConditions(r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 사용처 */}
        <Section
          title="3. 어디에 쓸 수 있나요?"
          icon={<Coins className="w-4 h-4" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {redemptions
              .filter((r) => r.category !== 'ai_video') // AI 영상 크레딧은 안내에서 제외
              .map((r) => {
                const isComingSoon = r.category === 'giftcard'
                return (
                  <div
                    key={r.category}
                    className={
                      'rounded-lg border bg-card p-3 ' +
                      (isComingSoon ? 'border-dashed border-border opacity-60' : 'border-border')
                    }
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">{r.display_name}</span>
                      <span
                        className={
                          'text-xs px-1.5 py-0.5 rounded font-medium ' +
                          (isComingSoon
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300')
                        }
                      >
                        {isComingSoon
                          ? '준비중'
                          : r.max_redemption_pct === 100
                            ? '전액 사용'
                            : `최대 ${r.max_redemption_pct}%`}
                      </span>
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground">{r.description}</p>
                    )}
                  </div>
                )
              })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <strong>1포인트 = 1원</strong> 으로 사용됩니다. 가입 후 30일 경과 + 휴대폰 본인인증
            완료 시 사용 가능합니다.
          </p>
        </Section>

        {/* 평가 시스템 */}
        <Section
          title="4. 왜 24시간 평가가 있나요?"
          icon={<Clock className="w-4 h-4" />}
        >
          <p className="text-sm text-muted-foreground mb-3">
            글을 작성하면 즉시가 아닌 <strong>24시간 후</strong> 포인트가 확정됩니다. 그 이유는:
          </p>
          <ul className="space-y-2 text-sm">
            <Bullet ok>
              평가 대기 중에 신고가 0건이면 → <strong className="text-emerald-600">확정 (사용 가능)</strong>
            </Bullet>
            <Bullet>
              신고를 받거나 게시글이 삭제되면 → <strong className="text-red-600">회수</strong>
            </Bullet>
            <Bullet>
              조회수가 5 미만이면 (가치 없는 글) → 회수
            </Bullet>
          </ul>
          <div className="mt-3 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
            💡 <strong>왜 이렇게 하나요?</strong> 도배·어뷰징 글로 포인트를 노리는 사람을 차단하기 위함입니다.
            평가를 통과한 진짜 좋은 글에만 포인트를 드립니다.
          </div>
        </Section>

        {/* 신뢰도 */}
        <Section
          title="5. 신뢰도 점수란?"
          icon={<ShieldCheck className="w-4 h-4" />}
        >
          <p className="text-sm text-muted-foreground mb-3">
            모든 사용자는 <strong>0~100점</strong> 의 신뢰도 점수를 가집니다. 시작값은 100점.
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">신뢰도</th>
                  <th className="text-center px-3 py-2 font-medium">적립률</th>
                  <th className="text-left px-3 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-3 py-2"><span className="font-bold text-emerald-600">80~100</span></td>
                  <td className="px-3 py-2 text-center font-bold">100%</td>
                  <td className="px-3 py-2 text-xs">정상</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2"><span className="font-bold text-amber-600">50~79</span></td>
                  <td className="px-3 py-2 text-center">70%</td>
                  <td className="px-3 py-2 text-xs">의심 단계</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2"><span className="font-bold text-orange-600">30~49</span></td>
                  <td className="px-3 py-2 text-center">30%</td>
                  <td className="px-3 py-2 text-xs">경고</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2"><span className="font-bold text-red-600">0~29</span></td>
                  <td className="px-3 py-2 text-center">0%</td>
                  <td className="px-3 py-2 text-xs">적립 정지</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 text-sm mt-3">
            <Bullet ok>좋은 활동 (좋아요/댓글 받기) → 점수 +5/회</Bullet>
            <Bullet>신고 받기 → -10</Bullet>
            <Bullet>글 삭제됨 → -20</Bullet>
            <Bullet>관리자 경고 → -50</Bullet>
          </ul>
        </Section>

        {/* 어뷰징 방지 */}
        <Section
          title="6. 어뷰징 방지 정책"
          icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
        >
          <p className="text-sm text-muted-foreground mb-3">
            포인트 시스템의 공정성을 위해 다음 행위는 <strong>자동 차단</strong>됩니다.
          </p>
          <ul className="space-y-2 text-sm">
            <Bullet>같은 글 반복 게시 (도배)</Bullet>
            <Bullet>본인 글에 본인 좋아요</Bullet>
            <Bullet>10초 이내 연속 작성 (봇 의심)</Bullet>
            <Bullet>같은 IP 다계정 운영</Bullet>
            <Bullet>의미 없는 짧은 글 / 사진 없는 매물</Bullet>
            <Bullet>광고 / 외부 링크만 있는 글</Bullet>
          </ul>
        </Section>

        {/* FAQ */}
        <Section title="7. 자주 묻는 질문" icon={<CheckCircle2 className="w-4 h-4" />}>
          <div className="space-y-3">
            <Faq
              q="언제부터 포인트를 받을 수 있나요?"
              a="가입 후 7일이 지나야 활동 적립이 시작됩니다. 휴대폰 본인인증과 이메일 인증 모두 완료해주세요."
            />
            <Faq
              q="언제부터 포인트를 사용할 수 있나요?"
              a="가입 후 30일이 지나야 사용 가능합니다. 신규 사기 계정 차단을 위한 안전 장치입니다."
            />
            <Faq
              q="포인트는 다른 사람에게 양도할 수 있나요?"
              a="아니요. 포인트는 본인 계정에서만 사용 가능하며, 양도 / 거래 / 환금은 불가합니다."
            />
            <Faq
              q="포인트가 만료되나요?"
              a="현재는 만료 정책이 없습니다. 다만 약관 변경 시 사전 공지를 통해 적용될 수 있습니다."
            />
            <Faq
              q="포인트가 잘못 차감 / 적립됐어요"
              a="고객센터(/support) 로 문의해주세요. 거래 내역을 확인 후 조정해드립니다."
            />
          </div>
        </Section>

        {/* CTA */}
        {user ? (
          <div className="rounded-xl border border-border bg-card p-5 text-center">
            <p className="text-sm text-muted-foreground mb-2">내 포인트 잔액 확인</p>
            <a
              href="/mypage/points"
              className="inline-flex items-center gap-1.5 text-amber-600 font-bold hover:underline"
            >
              <Coins className="w-4 h-4" />
              마이페이지에서 보기 →
            </a>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-5 text-center">
            <p className="text-sm text-muted-foreground mb-2">로그인하고 포인트 받기</p>
            <a
              href="/auth/login"
              className="inline-flex items-center gap-1.5 text-primary font-bold hover:underline"
            >
              로그인 →
            </a>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

// ── 헬퍼 ────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-base font-bold mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function FlowStep({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className="w-8 h-8 mx-auto mb-1.5 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-600 font-bold text-sm">
        {number}
      </div>
      <p className="font-bold text-sm">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
    </div>
  )
}

function Bullet({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={
          ok
            ? 'inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0'
            : 'inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 flex-shrink-0'
        }
      />
      <span>{children}</span>
    </li>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer font-medium text-sm flex items-center justify-between">
        <span>{q}</span>
        <span className="text-muted-foreground group-open:rotate-90 transition-transform">›</span>
      </summary>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{a}</p>
    </details>
  )
}

function ruleConditions(r: PointRule): string {
  const parts: string[] = []
  if (r.required_account_age_days > 0) parts.push(`가입${r.required_account_age_days}일+`)
  if (r.required_phone_verified) parts.push('휴대폰인증')
  const t = r.quality_threshold ?? {}
  if (t.min_length) parts.push(`${t.min_length}자+`)
  if (t.must_have_image) parts.push('사진+')
  return parts.length > 0 ? parts.join(' · ') : '-'
}
