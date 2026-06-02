"use client"

import { useState, useEffect } from "react"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

export function InvitationBell({ showLabel = false }: { showLabel?: boolean } = {}) {
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    const setup = async () => {
      // 본인 user.id 확보 후에만 구독 — 모든 사용자의 변경을 듣지 않음
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return

      // 첫 카운트 페치
      fetchPendingInvitationsCount()

      if (!user) return

      // expert_id=eq.<userId> 또는 inviter_id=eq.<userId> 만 구독
      // (받은/보낸 초대 양쪽 모두 변경 감지)
      const channelName = `expert_invitations_${user.id}`
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "expert_invitations",
            filter: `expert_id=eq.${user.id}`,
          },
          () => fetchPendingInvitationsCount(),
        )
        .subscribe()
    }

    setup()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const fetchPendingInvitationsCount = async () => {
    try {
      // 경량 count-only 모드 — 4개 조인 없이 pending 개수만
      const response = await fetch("/api/expert-invitations?type=received&countOnly=1")
      if (response.ok) {
        const data = await response.json()
        setPendingCount(data.pendingCount ?? 0)
      }
    } catch (error) {
      console.error("Failed to fetch invitation count:", error)
    } finally {
      setLoading(false)
    }
  }

  if (showLabel) {
    return (
      <Link
        href="/invitations"
        className="relative inline-flex items-center gap-1.5 px-3 h-9 rounded-full border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 hover:border-primary/60 transition-colors"
      >
        <Mail className="w-4 h-4" />
        <span>초대요청</span>
        {pendingCount > 0 && (
          <span className="ml-0.5 min-w-[1.25rem] h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <Link href="/invitations">
      <Button variant="ghost" size="icon" className="relative text-foreground hover:text-primary hover:bg-secondary" aria-label="초대 요청">
        <Mail className="w-5 h-5" aria-hidden="true" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </Button>
    </Link>
  )
}
