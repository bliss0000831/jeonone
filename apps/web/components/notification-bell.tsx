"use client"

import { useState, useEffect } from "react"
import { Bell, MessageCircle, TrendingDown, Heart, Info, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
  thumbnail_url?: string | null
  actor_id?: string | null
  property_id?: string | null
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const ac = new AbortController()
    fetchNotifications()

    // 주기적으로 알림 확인 (60초마다, 탭이 보일 때만)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchNotifications()
      }
    }, 60000)

    // 탭 다시 활성화될 때 즉시 한 번
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchNotifications()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      ac.abort()
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/notifications", {
        // 클라이언트 HTTP 캐시: 30초 동안 동일 응답 재사용
        headers: { "Cache-Control": "max-age=30" },
      })
      if (response.ok) {
        const data = await response.json()
        setNotifications(data)
        // 정확한 안읽음 총수는 헤더에서 (목록 20개 한도와 무관). 헤더 없으면 fallback.
        const headerCount = response.headers.get("X-Unread-Count")
        setUnreadCount(
          headerCount != null
            ? Number(headerCount)
            : data.filter((n: Notification) => !n.is_read).length,
        )
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
    } finally {
      setLoading(false)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications", { method: "PATCH" })
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true }))
        )
        setUnreadCount(0)
      }
    } catch (error) {
      console.error("Failed to mark as read:", error)
    }
  }

  /** 단건 읽음 처리 — 알림 아이템 클릭 시 호출 (낙관적 업데이트) */
  const markOneAsRead = (id: string) => {
    const target = notifications.find((n) => n.id === id)
    if (!target || target.is_read) return
    // UI 즉시 반영
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    // 서버 반영 (실패해도 비즈니스 치명도 낮음)
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch((err) => {
      console.error("Failed to mark notification as read:", err)
    })
  }

  /** 타입별 컬러 + 아이콘 메타 */
  const typeMeta = (type: string) => {
    if (type === "chat" || type.startsWith("board_")) {
      return { bg: "bg-blue-500", Icon: MessageCircle }
    }
    if (type === "price_change") {
      return { bg: "bg-emerald-500", Icon: TrendingDown }
    }
    if (type === "favorite") {
      return { bg: "bg-rose-500", Icon: Heart }
    }
    if (type.startsWith("group_buying") || type.startsWith("club")) {
      return { bg: "bg-violet-500", Icon: Heart }
    }
    return { bg: "bg-zinc-500", Icon: Info }
  }

  /** 썸네일 또는 컬러 아이콘 (+ 오른쪽 아래 타입 뱃지) */
  const getThumbnail = (n: Notification) => {
    const { bg, Icon } = typeMeta(n.type)

    if (n.thumbnail_url) {
      return (
        <div className="relative flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={n.thumbnail_url}
            alt=""
            className="w-11 h-11 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10 bg-zinc-100"
          />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-[18px] h-[18px] rounded-full ring-2 ring-white dark:ring-zinc-900",
              bg,
            )}
          >
            <Icon className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
          </span>
        </div>
      )
    }

    // 썸네일 없음 → 컬러 원형 아이콘
    return (
      <div
        className={cn(
          "flex items-center justify-center w-11 h-11 rounded-full flex-shrink-0 ring-1 ring-black/5",
          bg,
        )}
      >
        <Icon className="w-5 h-5 text-white" strokeWidth={2} />
      </div>
    )
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "방금 전"
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    if (days < 7) return `${days}일 전`
    return date.toLocaleDateString("ko-KR")
  }

  // 서버에서 렌더링 시 기본 버튼만 표시 (hydration mismatch 방지)
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="relative mt-0.5" aria-label="알림">
        <Bell className="size-5" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative mt-0.5">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-96 p-0 overflow-hidden rounded-2xl border-0 bg-white dark:bg-zinc-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">알림</span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-semibold rounded-full bg-primary text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-[11px] font-medium text-primary hover:bg-primary/10 active:bg-primary/15 transition-colors flex items-center gap-1 px-2 py-1 rounded-md"
            >
              <Check className="w-3 h-3" />
              모두 읽음
            </button>
          )}
        </div>

        {/* 리스트 */}
        <div className="max-h-[420px] overflow-y-auto bg-white dark:bg-zinc-900">
          {loading ? (
            <div className="p-10 text-center text-zinc-400 text-sm">로딩 중...</div>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                <Bell className="w-5 h-5 text-zinc-400" />
              </div>
              <p className="text-sm text-zinc-500">알림이 없습니다</p>
            </div>
          ) : (
            notifications.slice(0, 10).map((notification) => {
              const content = (
                <>
                  {getThumbnail(notification)}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-[13px] leading-snug text-zinc-900 dark:text-zinc-100 truncate",
                        !notification.is_read ? "font-semibold" : "font-medium",
                      )}
                    >
                      {notification.title}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {notification.message}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                      {formatTime(notification.created_at)}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5 shadow-[0_0_0_3px_rgba(0,0,0,0.03)]" />
                  )}
                </>
              )
              return (
                <DropdownMenuItem
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 cursor-pointer rounded-none focus:bg-zinc-50 dark:focus:bg-zinc-800/60 border-l-2 transition-colors",
                    !notification.is_read
                      ? "bg-primary/[0.04] border-primary"
                      : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                  )}
                  asChild
                >
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      className="w-full"
                      onClick={() => markOneAsRead(notification.id)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div
                      className="flex items-start gap-3 w-full"
                      onClick={() => markOneAsRead(notification.id)}
                    >
                      {content}
                    </div>
                  )}
                </DropdownMenuItem>
              )
            })
          )}
        </div>

        {/* 푸터 */}
        {notifications.length > 0 && (
          <Link
            href="/notifications"
            className="block text-center text-[13px] font-medium text-primary py-3 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
          >
            모든 알림 보기 →
          </Link>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
