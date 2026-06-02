'use client'

/**
 * 구독 신청 버튼 — 클라이언트에서 /api/billing/subscriptions 호출.
 *
 * 무료 기간이면 즉시 free_period 상태로 가입.
 * 활성화 후엔 결제창 안내.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function SubscribeButton({
  planId,
  disabled,
  freePeriod,
}: {
  planId: string
  disabled?: boolean
  freePeriod?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? '가입에 실패했습니다.')
        return
      }
      if (json.freePeriod) {
        toast.success('무료 기간으로 가입되었습니다. 추후 유료 전환 시 평생 50% 할인됩니다.')
      } else if (json.paymentRequired) {
        toast.message('결제창으로 이동합니다...')
        // TODO: 활성화 시 PortOne 결제창 호출
      } else {
        toast.success('가입되었습니다.')
      }
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (disabled) {
    return (
      <Button className="w-full" variant="secondary" disabled>
        가입됨
      </Button>
    )
  }

  return (
    <Button onClick={onClick} disabled={loading} className="w-full gap-2">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      {freePeriod ? '무료로 시작하기' : '가입하기'}
    </Button>
  )
}
