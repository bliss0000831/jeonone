"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Search, PlusCircle, MessageCircle, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { RegisterSheet } from "@/components/register-sheet"

export function BottomNav() {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const [currentPath, setCurrentPath] = useState("/")
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [registerOpen, setRegisterOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // C7: usePathname()으로 SPA 이동 시에도 활성 탭 반영
  useEffect(() => {
    if (pathname) setCurrentPath(pathname)
  }, [pathname])

  // 안읽음 개수 조회 (마운트 + 60초마다, 탭 활성화 시에만)
  useEffect(() => {
    if (!mounted) return
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/chat/unread-total")
        if (res.ok) {
          const data = await res.json()
          setUnreadTotal(data.total || 0)
        }
      } catch {}
    }
    fetchUnread()
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchUnread()
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchUnread()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [mounted])

  // 등록 슬롯 — 등록 시트를 여는 버튼 (path 는 활성 표시용 키, 실제 라우팅 없음)
  const registerConfig = { path: "#register", icon: PlusCircle, label: "등록" }

  // 하단 5개 슬롯: 홈 - 검색 - 등록 - 채팅 - MY
  // (찜목록은 상단 프로필 메뉴로 이동)
  const navItems = [
    { href: "/", icon: Home, label: "홈", type: "link" as const },
    { href: "/search", icon: Search, label: "검색", type: "link" as const },
    {
      href: registerConfig.path,
      icon: registerConfig.icon,
      label: registerConfig.label,
      type: "sheet" as const,
    },
    { href: "/chat", icon: MessageCircle, label: "채팅", type: "link" as const },
    { href: "/mypage", icon: User, label: "내정보", type: "link" as const },
  ]

  // 마운트 전에는 빈 네비게이션 셸 렌더링
  if (!mounted) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden">
        <div className="flex items-center justify-around h-16 px-2" />
        <div className="safe-bottom bg-card" />
      </nav>
    )
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border/50 shadow-lg md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = currentPath === item.href ||
            (item.href !== "/" && currentPath.startsWith(item.href))
          const Icon = item.icon
          const inner = (
            <>
              <div className={cn(
                "relative p-1.5 rounded-xl transition-colors",
                isActive && "bg-primary/10"
              )}>
                <Icon className={cn(
                  "w-5 h-5",
                  item.href === registerConfig.path && !isActive && "text-primary"
                )} />
                {item.href === "/chat" && unreadTotal > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadTotal > 99 ? "99+" : unreadTotal}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-xs font-semibold",
                isActive && "font-bold"
              )}>{item.label}</span>
            </>
          )

          const commonCls = cn(
            "flex flex-col items-center justify-center gap-0.5 w-16 py-2 transition-all duration-200",
            isActive ? "text-primary scale-105" : "text-muted-foreground hover:text-foreground",
          )

          if (item.type === "sheet") {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setRegisterOpen(true)}
                className={commonCls}
                aria-label="등록 메뉴 열기"
              >
                {inner}
              </button>
            )
          }

          return (
            <Link key={item.href} href={item.href} className={commonCls}>
              {inner}
            </Link>
          )
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="safe-bottom bg-card/95" />

      <RegisterSheet open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </nav>
  )
}
