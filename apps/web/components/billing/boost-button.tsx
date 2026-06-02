'use client'

/**
 * 부스트 버튼 + 다이얼로그 — 부동산/신장개업 등 매물 상세 페이지에 삽입.
 *
 * 6개월 무료 운영 기간 동안에는 결제 없이 즉시 활성화 (혜택).
 * 활성화 후에는 PG 결제창 호출.
 *
 * 사용 예:
 *   <BoostButton target="property" targetId={property.id} />
 *   <BoostButton target="new_store" targetId={post.id} />
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Rocket, Sparkles, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  BoostPricing,
  BoostTargetType,
  BoostTier,
  BoostOrder,
} from '@/lib/services/billing'

interface Props {
  target: BoostTargetType
  targetId: string
  /** 버튼 텍스트 커스터마이징 (선택) */
  label?: string
  /** size variant */
  size?: 'sm' | 'default' | 'lg'
  /** 버튼 variant */
  variant?: 'default' | 'outline' | 'secondary'
  className?: string
}

export function BoostButton({
  target,
  targetId,
  label = '부스트 (상단 노출)',
  size = 'default',
  variant = 'default',
  className,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pricing, setPricing] = useState<BoostPricing[]>([])
  const [active, setActive] = useState<BoostOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [submitting, setSubmitting] = useState<BoostTier | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setLoadError(false)
    fetch(`/api/billing/boost?target=${target}&targetId=${targetId}`)
      .then((r) => r.json())
      .then((d) => {
        setPricing(d.pricing ?? [])
        setActive(d.active ?? null)
      })
      .catch((e) => {
        console.error("[boost] pricing fetch failed:", e)
        setLoadError(true)
        toast.error("부스트 정보를 불러오지 못했습니다")
      })
      .finally(() => setLoading(false))
  }, [open, target, targetId])

  async function purchase(tier: BoostTier) {
    setSubmitting(tier)
    try {
      const res = await fetch('/api/billing/boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, targetId, tier }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? '부스트 신청 실패')
        return
      }
      if (json.freePeriod) {
        toast.success('무료 기간 혜택! 부스트가 활성화되었습니다.', {
          description: `종료: ${new Date(json.order.ends_at).toLocaleDateString('ko-KR')}`,
        })
      } else if (json.paymentRequired) {
        toast.message('결제창으로 이동합니다...')
        // TODO: 활성화 시 PG 결제창 호출
      }
      setOpen(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? '오류')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className={className}>
          <Rocket className="w-4 h-4 mr-1.5" />
          {active ? '부스트 활성 중' : label}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-amber-500" />
            노출 부스트
          </DialogTitle>
          <DialogDescription>
            상단/메인에 노출되어 더 많은 사람이 보게 됩니다.
          </DialogDescription>
        </DialogHeader>

        {/* 무료 기간 안내 */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-3 text-xs">
          <div className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-emerald-800 dark:text-emerald-200">
              <strong>6개월 무료 운영 기간:</strong> 모든 부스트가 무료입니다.
              결제 없이 즉시 활성화됩니다.
            </div>
          </div>
        </div>

        {/* 활성 부스트 표시 */}
        {active && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200 mb-1">
              현재 부스트 활성 중 — {tierLabel(active.tier)}
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              ~{new Date(active.ends_at).toLocaleString('ko-KR')} 까지
            </p>
          </div>
        )}

        {/* 가격 카드 */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-sm text-destructive">부스트 정보를 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); setTimeout(() => setOpen(true), 100) }}>
              다시 시도
            </Button>
          </div>
        ) : pricing.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            이 카테고리에 사용 가능한 부스트가 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {pricing.map((p) => (
              <button
                key={p.tier}
                type="button"
                onClick={() => purchase(p.tier as BoostTier)}
                disabled={submitting !== null}
                className="w-full text-left rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-colors p-3 disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm">{p.display_name}</p>
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      기간 {p.duration_days}일
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold line-through text-muted-foreground">
                      {p.price.toLocaleString()}원
                    </p>
                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                      무료
                    </p>
                  </div>
                </div>
                {submitting === p.tier && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    처리 중...
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <DialogFooter className="text-xs text-muted-foreground">
          유료 전환 후에는 결제창이 떠서 카드/카카오페이로 결제할 수 있습니다.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function tierLabel(tier: BoostTier): string {
  switch (tier) {
    case 'main_banner_3d': return '메인 배너 3일'
    case 'main_banner_7d': return '메인 배너 1주'
    case 'category_top_3d': return '카테고리 상단 3일'
    case 'category_top_7d': return '카테고리 상단 1주'
    case 'card_news_push': return 'AI 카드뉴스 + 푸시'
  }
}
