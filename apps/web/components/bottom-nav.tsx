"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Search, PlusCircle, MessageCircle, User, Paintbrush, Truck, SprayCan, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { RegisterSheet } from "@/components/register-sheet"

export function BottomNav() {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const [currentPath, setCurrentPath] = useState("/")
  const [accountType, setAccountType] = useState<string | null>(null)
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

  useEffect(() => {
    if (!mounted) return

    // account_type 은 거의 안 바뀜 → 세션 캐시 30분.
    // 이전엔 모바일 페이지 이동 마다 getUser() + profiles 쿼리 → 부하 큼 (2026-04 audit, #4).
    const cacheKey = "bottom_nav_account_type_v1"
    const TTL = 30 * 60 * 1000
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const cached = JSON.parse(raw)
        if (cached?.fetchedAt && Date.now() - cached.fetchedAt < TTL) {
          if (cached.accountType !== undefined) setAccountType(cached.accountType)
          return
        }
      }
    } catch {}

    const fetchAccountType = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("account_type")
          .eq("id", user.id)
          .single()
        if (profile) {
          setAccountType(profile.account_type)
          try {
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({ accountType: profile.account_type, fetchedAt: Date.now() }),
            )
          } catch {}
        }
      } else {
        // 비로그인 — 캐시에 null 박아 다음 페이지에서 또 안 부르게.
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ accountType: null, fetchedAt: Date.now() }),
          )
        } catch {}
      }
    }
    fetchAccountType()
  }, [mounted])

  // 서비스 전문가별 등록 경로 및 아이콘
  const getRegisterConfig = () => {
    const serviceConfig: Record<string, { path: string; icon: any; label: string }> = {
      interior: { path: "/interior/register", icon: Paintbrush, label: "글등록" },
      moving: { path: "/moving/register", icon: Truck, label: "글등록" },
      cleaning: { path: "/cleaning/register", icon: SprayCan, label: "글등록" },
      repair: { path: "/repair/register", icon: Wrench, label: "글등록" },
    }
    return accountType && serviceConfig[accountType] 
      ? serviceConfig[accountType] 
      : { path: "/register", icon: PlusCircle, label: "등록" }
  }

  const registerConfig = getRegisterConfig()

  // 서비스 전문가(인테리어/이사/청소/수리)는 전용 등록 페이지로 바로 이동
  const isServicePro = accountType
    ? ["interior", "moving", "cleaning", "repair"].includes(accountType)
    : false

  // 하단 5개 슬롯: 홈 - 검색 - 등록 - 채팅 - MY
  // (초대 요청은 채팅 헤더 버튼으로, 찜목록은 상단 프로필 메뉴로 이동)
  const navItems = [
    { href: "/", icon: Home, label: "홈", type: "link" as const },
    { href: "/search", icon: Search, label: "검색", type: "link" as const },
    {
      href: registerConfig.path,
      icon: registerConfig.icon,
      label: registerConfig.label,
      type: isServicePro ? ("link" as const) : ("sheet" as const),
    },
    { href: "/chat", icon: MessageCircle, label: "채팅", type: "link" as const },
    { href: "/mypage", icon: User, label: "MY", type: "link" as const },
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
