"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { ProfileShell } from "@/components/profile/profile-shell"

/**
 * 프로필 페이지 클라이언트 부분.
 * 페이지 server 가 광장 격리 검증을 마친 후 이 컴포넌트 렌더.
 */
export function PublicProfileClient({ userId }: { userId: string }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const mode = currentUserId === userId ? "self" : "other"
  return <ProfileShell userId={userId} mode={mode} currentUserId={currentUserId} />
}
