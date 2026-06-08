"use client"

/**
 * CallButton — 전 도메인 상세 액션 바용 "전화 걸기" 버튼 (어르신 친화).
 *
 * 개인정보 안전성:
 *   - 판매자/작성자의 profiles.phone 을 userId 로 조회.
 *   - 전화번호가 "있을 때만" 버튼 노출. 없으면 아무것도 렌더링하지 않음(null).
 *   - 번호를 화면에 평문 노출하지 않고, 클릭 시 tel: 다이얼러만 연다.
 *   - profiles 조회는 jobs/채팅이 이미 phone 을 읽는 것과 동일한 RLS 안전 수준.
 *
 * 사용: 채팅 버튼은 그대로 두고 보조 버튼으로 나란히 배치.
 */

import { useEffect, useState } from "react"
import { Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface CallButtonProps {
  /** 판매자/작성자 user_id — profiles.phone 조회 키 */
  userId?: string | null
  className?: string
}

export function CallButton({ userId, className }: CallButtonProps) {
  const [phone, setPhone] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setPhone(null)
      return
    }
    let alive = true
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", userId)
        .maybeSingle()
      const p = ((data as { phone?: string | null } | null)?.phone) ?? null
      if (alive) setPhone(p && p.trim() ? p.trim() : null)
    })()
    return () => {
      alive = false
    }
  }, [userId])

  // 번호 없으면 버튼 자체를 노출하지 않음 (개인정보 보호)
  if (!phone) return null

  const sanitized = phone.replace(/[^0-9+]/g, "")
  if (!sanitized) return null

  return (
    <Button
      asChild
      size="lg"
      variant="outline"
      className={cn("gap-2 border-2", className)}
    >
      <a href={`tel:${sanitized}`} aria-label="판매자에게 전화 걸기">
        <Phone className="w-5 h-5" />
        전화 걸기
      </a>
    </Button>
  )
}
