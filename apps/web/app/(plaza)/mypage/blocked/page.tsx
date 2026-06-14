"use client"

/**
 * 차단 사용자 관리 — 웹.
 *
 * - block_users 테이블에서 본인이 차단한 사용자 목록
 * - 차단 해제 버튼
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, Ban, Loader2, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"

interface BlockedRow {
  blocked_id: string
  created_at: string
  nickname: string | null
  avatar_url: string | null
}

export default function BlockedPage() {
  const supabase = createClient()
  const confirm = useConfirm()
  const [rows, setRows] = useState<BlockedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRows([])
        return
      }
      const { data: blocks } = await supabase
        .from("block_users")
        .select("blocked_id, created_at")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false })
      const arr = ((blocks || []) as Array<{ blocked_id: string; created_at: string }>)
      if (arr.length === 0) {
        setRows([])
        return
      }
      const ids = arr.map((r) => r.blocked_id)
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url")
        .in("id", ids)
      const profMap = new Map<string, any>(((profs ?? []) as any[]).map((p) => [p.id, p]))
      setRows(
        arr.map((r) => ({
          blocked_id: r.blocked_id,
          created_at: r.created_at,
          nickname: profMap.get(r.blocked_id)?.nickname ?? null,
          avatar_url: profMap.get(r.blocked_id)?.avatar_url ?? null,
        })),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleUnblock = async (target: BlockedRow) => {
    if (!(await confirm(`${target.nickname || "이 사용자"}의 차단을 해제하시겠어요?`))) return
    setBusy(target.blocked_id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase
        .from("block_users")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", target.blocked_id)
      if (error) {
        console.error("[blocked unblock]", error)
        toast.error("차단 해제에 실패했어요. 잠시 후 다시 시도해주세요.")
        return
      }
      setRows((prev) => prev.filter((r) => r.blocked_id !== target.blocked_id))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href="/mypage/settings"
            className="p-2 -ml-2 hover:bg-secondary rounded-full"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold">차단 관리</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin inline" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <Ban className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-base font-semibold text-foreground">
              차단한 사용자가 없습니다
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              프로필 페이지의 "차단" 버튼으로 차단할 수 있어요
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.blocked_id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
              >
                <Link
                  href={`/profile/${r.blocked_id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  {r.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                      {(r.nickname || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {r.nickname || "(닉네임 없음)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("ko-KR")} 차단
                    </p>
                  </div>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === r.blocked_id}
                  onClick={() => handleUnblock(r)}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  해제
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
