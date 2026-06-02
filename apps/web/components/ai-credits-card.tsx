"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Sparkles, Plus, Film } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatCredits, IS_BETA_FREE } from "@/lib/ai-video/pricing"

/**
 * 마이페이지 상단 — AI 영상 크레딧 요약 카드
 *   · 공인중개사 계정만 노출
 *   · 잔액 + 충전 링크 + 생성 이력 링크
 */
export function AiCreditsCard({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState(false)
  const [balance, setBalance] = useState(0)
  const [jobCount, setJobCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from("profiles").select("account_type, video_credits").eq("id", userId).single(),
      supabase
        .from("ai_video_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ])
      .then(([{ data: profile }, { count }]) => {
        const isAgent = profile?.account_type === "agent"
        setShow(isAgent)
        setBalance(profile?.video_credits ?? 0)
        setJobCount(count ?? 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId])

  if (loading || !show) return null

  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl overflow-hidden shadow-md bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 text-white">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold opacity-90">
              <Sparkles className="w-3.5 h-3.5" />
              AI 홍보영상 크레딧
            </div>
            {IS_BETA_FREE && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                BETA · 무료
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-3xl font-black">{formatCredits(balance)}</span>
            <span className="text-sm font-semibold opacity-90">크레딧</span>
          </div>
          <p className="text-[11px] opacity-80 mt-0.5">
            생성한 영상 {jobCount}개 ·{" "}
            {IS_BETA_FREE ? "BETA: 15초 영상만 무료" : "1크레딧 = 30초 영상 1개"}
          </p>
        </div>
        <div className="flex border-t border-white/20">
          <Link
            href="/mypage/credits"
            className="flex-1 py-2.5 text-center text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            충전하기
          </Link>
          <div className="w-px bg-white/20" />
          <Link
            href="/mypage/my-videos"
            className="flex-1 py-2.5 text-center text-xs font-semibold hover:bg-white/10 transition-colors flex items-center justify-center gap-1"
          >
            <Film className="w-3.5 h-3.5" />
            내 영상
          </Link>
        </div>
      </div>
    </div>
  )
}
