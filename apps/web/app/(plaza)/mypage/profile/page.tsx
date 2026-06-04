"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ProfileShell } from "@/components/profile/profile-shell"
import { BottomNav } from "@/components/bottom-nav"

// 전체 프로필 뷰 (글/찜 탭 포함) — 마이페이지 대시보드의 "프로필 보기"에서 진입
export default function MyProfilePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login?redirect=/mypage/profile")
        return
      }
      setUserId(user.id)
      setChecking(false)
    })
  }, [router])

  if (checking || !userId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <>
      <ProfileShell userId={userId} mode="self" currentUserId={userId} />
      <BottomNav />
    </>
  )
}
