"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatCredits } from "@/lib/ai-video/pricing"

/**
 * 헤더용 컴팩트 AI 영상 크레딧 뱃지
 *   · 공인중개사 계정일 때만 노출
 *   · 설정 버튼 옆에 작게 표시
 */
export function HeaderCreditBadge({ userId }: { userId: string }) {
  const [show, setShow] = useState(false)
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("profiles")
      .select("account_type, video_credits")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data?.account_type === "agent") {
          setShow(true)
          setBalance(data.video_credits ?? 0)
        }
      })
  }, [userId])

  if (!show) return null

  return (
    <Link
      href="/mypage/credits"
      className="flex items-center gap-1 px-2 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
      title="AI 영상 크레딧 충전"
    >
      <Sparkles className="w-3.5 h-3.5" />
      <span className="whitespace-nowrap">AI 크레딧 {formatCredits(balance)}</span>
    </Link>
  )
}
