"use client"

import { useMemo, useState, useEffect } from "react"
import {
  ChevronLeft,
  MessageCircle,
  TrendingDown,
  Heart,
  Info,
  Trash2,
  Check,
  MessageSquare,
  ShoppingCart,
  Users,
  UserPlus,
  Megaphone,
  Bell,
  UserCheck,
  Gavel,
  CalendarDays,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/confirm-provider"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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

type FilterKey =
  | "all"
  | "unread"
  | "read"
  | "chat"
  | "property"
  | "group_buying"
  | "club"
  | "board"
  | "invitation"

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "unread", label: "안 읽음" },
  { key: "read", label: "읽음" },
  { key: "chat", label: "채팅" },
  { key: "board", label: "소식통" },
]

// 초대요청 탭을 노출할 계정 유형 (초대 대상자들)
const INVITATION_ROLES = new Set<string>([
  "agent",
  "interior",
  "moving",
  "cleaning",
  "repair",
])

function typeMeta(type: string): {
  bg: string
  Icon: any
} {
  if (type === "chat") return { bg: "bg-blue-500", Icon: MessageCircle }
  if (type.startsWith("board_")) return { bg: "bg-indigo-500", Icon: MessageSquare }
  if (type === "price_change") return { bg: "bg-emerald-500", Icon: TrendingDown }
  if (type === "favorite") return { bg: "bg-rose-500", Icon: Heart }
  if (type.startsWith("group_buying")) return { bg: "bg-violet-500", Icon: ShoppingCart }
  if (type.startsWith("club")) return { bg: "bg-emerald-600", Icon: Users }
  if (type === "expert_invitation") return { bg: "bg-teal-500", Icon: UserPlus }
  if (type === "expert_invitation_response") return { bg: "bg-teal-600", Icon: UserCheck }
  if (type === "admin_notice") return { bg: "bg-orange-500", Icon: Megaphone }
  if (type === "system") return { bg: "bg-amber-500", Icon: Bell }
  if (type.startsWith("rental")) return { bg: "bg-emerald-600", Icon: CalendarDays }
  if (type.startsWith("auction")) return { bg: "bg-rose-600", Icon: Gavel }
  return { bg: "bg-zinc-500", Icon: Info }
}

function matchesFilter(n: Notification, filter: FilterKey) {
  if (filter === "all") return true
  if (filter === "unread") return !n.is_read
  if (filter === "read") return n.is_read
  if (filter === "chat") return n.type === "chat"
  if (filter === "property") return n.type === "price_change" || n.type === "favorite"
  if (filter === "board") return n.type.startsWith("board_")
  if (filter === "group_buying") return n.type.startsWith("group_buying")
  if (filter === "club") return n.type.startsWith("club")
  if (filter === "invitation") return n.type.startsWith("expert_invitation")
  return true
}

/** 날짜 그룹 레이블 */
function dateGroup(dateString: string): "today" | "yesterday" | "week" | "older" {
  const date = new Date(dateString)
  const now = new Date()
  // 자정 기준 일수 차이
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000)
  if (dayDiff <= 0) return "today"
  if (dayDiff === 1) return "yesterday"
  if (dayDiff < 7) return "week"
  return "older"
}

const GROUP_LABEL: Record<string, string> = {
  today: "오늘",
  yesterday: "어제",
  week: "이번 주",
  older: "그 이전",
}

function formatTime(dateString: string) {
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

export default function NotificationsPage() {
  const confirm = useConfirm()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<FilterKey>("all")
  const [accountType, setAccountType] = useState<string | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchNotifications()
    // 탭 가시성 복귀 시 자동 갱신 (Mobile useFocusEffect 등가물)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchNotifications()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle()
      setAccountType(data?.account_type ?? null)
    })()
  }, [supabase])

  const visibleFilters = useMemo(() => {
    const showInvitation = accountType != null && INVITATION_ROLES.has(accountType)
    return FILTERS.filter((f) => f.key !== "invitation" || showInvitation)
  }, [accountType])

  const fetchNotifications = async () => {
    setLoadError(false)
    try {
      const response = await fetch("/api/notifications?full=1")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setNotifications(data)
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
      // 실패를 "알림 없음"과 구분 — 재시도 노출
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications", { method: "PATCH" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch (error) {
      console.error("Failed to mark as read:", error)
      toast.error("모두 읽음 처리에 실패했어요. 다시 시도해주세요.")
    }
  }

  const markOneAsRead = (id: string) => {
    const target = notifications.find((n) => n.id === id)
    if (!target || target.is_read) return
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    )
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch((err) => console.error("Failed to mark as read:", err))
  }

  const deleteNotification = async (id: string) => {
    if (!(await confirm({ title: "알림 삭제", description: "이 알림을 삭제하시겠습니까?", confirmText: "삭제", destructive: true }))) return
    try {
      const { error } = await supabase.from("notifications").delete().eq("id", id)
      if (error) throw error
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (error) {
      console.error("Failed to delete notification:", error)
      toast.error("알림 삭제에 실패했어요. 다시 시도해주세요.")
    }
  }

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications])

  const filtered = useMemo(
    () => notifications.filter((n) => matchesFilter(n, filter)),
    [notifications, filter],
  )

  /** 날짜 그룹별로 묶어서 렌더링할 수 있게 sectioned 배열 만들기 */
  const sections = useMemo(() => {
    const groups: Record<string, Notification[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    }
    for (const n of filtered) {
      groups[dateGroup(n.created_at)].push(n)
    }
    return (["today", "yesterday", "week", "older"] as const)
      .map((key) => ({ key, label: GROUP_LABEL[key], items: groups[key] }))
      .filter((s) => s.items.length > 0)
  }, [filtered])

  /** 필터별 카운트 (탭 옆 뱃지용) */
  const filterCounts = useMemo(() => {
    const acc: Record<FilterKey, number> = {
      all: notifications.length,
      unread: unreadCount,
      read: notifications.length - unreadCount,
      chat: 0,
      property: 0,
      board: 0,
      group_buying: 0,
      club: 0,
      invitation: 0,
    }
    for (const n of notifications) {
      for (const f of FILTERS) {
        if (f.key === "all" || f.key === "unread" || f.key === "read") continue
        if (matchesFilter(n, f.key)) acc[f.key]++
      }
    }
    return acc
  }, [notifications, unreadCount])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* 상단 헤더 */}
      <header className="safe-top sticky top-0 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-b border-zinc-100 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto flex items-center justify-between h-14 px-3">
          <button
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="p-2 -ml-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-[15px]">알림</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-semibold rounded-full bg-primary text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 ? (
            <button
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-primary bg-primary/10 hover:bg-primary/15 px-2.5 py-1.5 rounded-full transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              모두 읽음
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>
      </header>

      {/* 본문 */}
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 pb-16">
        {/* 필터 탭 */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
          {visibleFilters.map((f) => {
            const active = filter === f.key
            const count = filterCounts[f.key]
            const dim = count === 0 && f.key !== "all"
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap border transition-colors",
                  active
                    ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white"
                    : dim
                      ? "bg-white text-zinc-400 border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800"
                      : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-800",
                )}
              >
                <span>{f.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      active
                        ? "text-white/80 dark:text-zinc-900/70"
                        : "text-zinc-400",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 리스트 */}
        {loading ? (
          <div className="py-20 text-center text-zinc-400 text-sm">
            불러오는 중…
          </div>
        ) : loadError ? (
          <div className="py-20 text-center">
            <p className="text-sm font-medium text-foreground mb-1">알림을 불러오지 못했어요</p>
            <p className="text-xs text-zinc-400 mb-4">잠시 후 다시 시도해주세요</p>
            <button
              onClick={() => { setLoading(true); fetchNotifications() }}
              className="inline-flex items-center px-4 h-9 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
            >
              다시 시도
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {sections.map((section) => (
              <section key={section.key}>
                {/* 날짜 섹션 헤더 */}
                <div className="px-1 pb-2">
                  <span className="text-[11px] font-semibold tracking-wide uppercase text-zinc-400">
                    {section.label} · {section.items.length}
                  </span>
                </div>
                <ul className="bg-white dark:bg-zinc-900 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                  {section.items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onDelete={() => deleteNotification(n.id)}
                      onRead={() => markOneAsRead(n.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────
function NotificationRow({
  n,
  onDelete,
  onRead,
}: {
  n: Notification
  onDelete: () => void
  onRead: () => void
}) {
  const { bg, Icon } = typeMeta(n.type)

  const content = (
    <>
      {/* 썸네일 / 아이콘 */}
      {n.thumbnail_url ? (
        <div className="relative flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={n.thumbnail_url}
            alt=""
            className="w-12 h-12 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10 bg-zinc-100"
          />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-5 h-5 rounded-full ring-2 ring-white dark:ring-zinc-900",
              bg,
            )}
          >
            <Icon className="w-3 h-3 text-white" strokeWidth={2.5} />
          </span>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0 ring-1 ring-black/5",
            bg,
          )}
        >
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
      )}

      {/* 본문 */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[13.5px] leading-snug text-zinc-900 dark:text-zinc-100 truncate",
            !n.is_read ? "font-semibold" : "font-medium",
          )}
        >
          {n.title}
        </p>
        <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
          {n.message}
        </p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">
          {formatTime(n.created_at)}
        </p>
      </div>
    </>
  )

  return (
    <li
      className={cn(
        "group relative flex items-stretch transition-colors",
        !n.is_read
          ? "bg-primary/[0.035] dark:bg-primary/[0.08]"
          : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
      )}
    >
      {/* 미읽음 사이드 바 */}
      {!n.is_read && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />
      )}

      {/* 컨텐츠 */}
      {n.link ? (
        <Link
          href={n.link}
          onClick={onRead}
          className="flex-1 flex items-start gap-3 p-4 min-w-0"
        >
          {content}
        </Link>
      ) : (
        <div
          onClick={onRead}
          className="flex-1 flex items-start gap-3 p-4 min-w-0 cursor-pointer"
        >
          {content}
        </div>
      )}

      {/* 우측 액션 */}
      <div className="flex items-center gap-1 pr-3">
        {!n.is_read && (
          <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
        )}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDelete()
          }}
          aria-label="알림 삭제"
          className="p-2 rounded-full text-zinc-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-60 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  )
}

// ─── Empty ───────────────────────────────────────────
function EmptyState() {
  return (
    <div className="py-20 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center shadow-sm">
        <Bell className="w-7 h-7 text-zinc-300" />
      </div>
      <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-200">
        새로운 알림이 없어요
      </p>
      <p className="mt-1 text-[12px] text-zinc-400">
        중요한 소식이 도착하면 여기에 표시됩니다
      </p>
    </div>
  )
}
