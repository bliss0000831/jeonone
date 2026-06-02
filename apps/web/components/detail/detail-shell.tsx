"use client"

import { ReactNode, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import { BottomNav } from "@/components/bottom-nav"
import { Header } from "@/components/header"
import { createClient } from "@/lib/supabase/client"

interface DetailShellProps {
  /** 오른쪽 헤더 액션 (하트/공유/메뉴) */
  rightActions?: ReactNode
  /** 뒤로 이동 링크. 넘기지 않으면 router.back() */
  backHref?: string
  /** 메인 바디 */
  children: ReactNode
  /** 하단 고정 액션바 (전화하기/채팅하기 등). 없으면 숨김 */
  actionBar?: ReactNode
  /** 모바일 하단 네비 포함 여부 (기본 true). 액션바 위에 뜨지 않도록 spacing 자동 조절 */
  bottomNav?: boolean
  /** 글로벌 상단바 표시 여부 (기본 true) */
  showGlobalHeader?: boolean
  /** 이미 로드한 Supabase user 가 있으면 Header 깜빡임 방지용으로 전달 */
  user?: SupabaseUser | null
  className?: string
}

/** 모든 게시글 상세 페이지의 공용 셸 — 같은 max-width/헤더/액션바 */
export function DetailShell({
  rightActions,
  backHref,
  children,
  actionBar,
  bottomNav = true,
  showGlobalHeader = true,
  user: userProp,
  className,
}: DetailShellProps) {
  const router = useRouter()
  const hasActionBar = Boolean(actionBar)
  // 액션바 있을 때: 모바일은 bottomNav(64px) 위에, 데스크톱은 바닥에
  const bottomPadding = hasActionBar
    ? bottomNav
      ? "pb-32 md:pb-24"
      : "pb-24"
    : bottomNav
      ? "pb-20 md:pb-8"
      : "pb-8"

  // 글로벌 헤더의 user — prop 없으면 자체 조회
  const [user, setUser] = useState<SupabaseUser | null>(userProp ?? null)
  useEffect(() => {
    if (userProp !== undefined) {
      setUser(userProp)
      return
    }
    if (!showGlobalHeader) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
  }, [userProp, showGlobalHeader])

  return (
    <div className={cn("min-h-screen bg-background", bottomPadding, className)}>
      {showGlobalHeader && <Header user={user} />}

      {/* Sub-header: 뒤로가기 + 액션 — 글로벌 헤더 바로 아래에 고정 */}
      <div
        className={cn(
          "sticky z-40 bg-card/80 backdrop-blur-md border-b border-border",
          showGlobalHeader ? "top-14" : "safe-top top-0",
        )}
        style={showGlobalHeader ? undefined : { zIndex: 50 }}
      >
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-12">
            {backHref ? (
              <Link
                href={backHref}
                className="p-2 -ml-2 hover:bg-secondary rounded-full transition-colors"
                aria-label="뒤로가기"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </Link>
            ) : (
              <button
                onClick={() => {
                  // 공유 링크로 첫 진입(히스토리 없음) 시 router.back() 은 막다른 길 → 홈으로 폴백
                  if (typeof window !== "undefined" && window.history.length > 1) router.back()
                  else router.push("/")
                }}
                className="p-2 -ml-2 hover:bg-secondary rounded-full transition-colors"
                aria-label="뒤로가기"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            )}
            <div className="flex items-center gap-1">{rightActions}</div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto">{children}</main>

      {hasActionBar && (
        <div
          className={cn(
            "fixed left-0 right-0 bg-card border-t border-border p-4 z-40",
            bottomNav ? "bottom-16 md:bottom-0" : "bottom-0",
          )}
        >
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            {actionBar}
          </div>
        </div>
      )}

      {bottomNav && <BottomNav />}
    </div>
  )
}
