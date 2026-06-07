"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  MessageCircle,
  Plus,
  LogOut,
  MoreVertical,
  BellOff,
  Bell,
  Ban,
  Flag,
  Trash2,
  X,
  Check,
  Edit3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomNav } from "@/components/bottom-nav"
import { ExpertSelectionModal } from "@/components/expert-selection-modal"
import { InvitationBell } from "@/components/invitation-bell"
import { useConfirm } from "@/components/confirm-provider"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { chatPrefs } from "@/lib/chat-prefs"
import { getCurrentPlazaClient } from "@/lib/plaza/client"
import { toast } from "sonner"

// plaza id → 한글 라벨 (cross-plaza chat 칩 표시용) — 모바일과 동일
const PLAZA_CHIP_LABEL: Record<string, string> = {
  chuncheon: "춘천",
  gangneung: "강릉",
}
function plazaChipName(id: string | null | undefined): string {
  if (!id) return ""
  return PLAZA_CHIP_LABEL[id] ?? id
}

interface ChatRoom {
  id: string
  property_id: string
  buyer_id: string
  seller_id: string
  post_type?: string
  /** Cross-plaza chat 표시용 — 채팅방이 속한 광장 */
  plaza_id?: string | null
  last_message: string | null
  last_message_at: string | null
  otherUser: {
    id: string
    nickname: string | null
    avatar_url: string | null
  } | null
  property: {
    id: string
    title: string
    images: string[] | null
    price: number
    transaction_type: string
  } | null
  unreadCount: number
}

// 우클릭/장기 누름으로 띄울 메뉴 대상
type RoomMenuTarget =
  | { kind: "direct"; id: string; label: string }

const REPORT_REASONS = [
  "스팸/광고",
  "욕설/비방",
  "음란/선정성",
  "사기/허위 정보",
  "기타",
]

export default function ChatListPage() {
  const confirm = useConfirm()
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showExpertModal, setShowExpertModal] = useState(false)
  const [isServiceProvider, setIsServiceProvider] = useState(false)
  const [leavingRoomId, setLeavingRoomId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>("all")
  const router = useRouter()

  // 헤더 메뉴 / 행 메뉴 / 차단 관리 / 신고 / 일괄편집
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [roomMenu, setRoomMenu] = useState<RoomMenuTarget | null>(null)
  const [blockedManagerOpen, setBlockedManagerOpen] = useState(false)
  const [reportFor, setReportFor] = useState<RoomMenuTarget | null>(null)
  // 현재 광장 — cross-plaza 칩 표시 분기에 사용
  const [currentPlaza, setCurrentPlaza] = useState<string | null>(null)
  useEffect(() => { setCurrentPlaza(getCurrentPlazaClient()) }, [])
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkLeaving, setBulkLeaving] = useState(false)

  // localStorage 상태(머트/차단/전체알림오프) — 리렌더 트리거용
  const [prefsTick, setPrefsTick] = useState(0)
  useEffect(() => {
    const onChange = () => setPrefsTick((t) => t + 1)
    window.addEventListener("chat-prefs-change", onChange)
    return () => window.removeEventListener("chat-prefs-change", onChange)
  }, [])
  const blockedSet = chatPrefs.getBlocked()
  const mutedSet = chatPrefs.getMuted()
  const notifOffAll = chatPrefs.getNotifOffAll()
  void prefsTick // 의존성

  // 프로필 동기화 — getUser() 한 번으로 notif_chat + account_type 모두 처리
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  useEffect(() => {
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setAuthUserId(user.id)
        const { data: profile } = await supabase
          .from("profiles")
          .select("notif_chat, account_type")
          .eq("id", user.id)
          .single()
        if (profile) {
          if (typeof profile.notif_chat === "boolean") {
            chatPrefs.setNotifOffAll(!profile.notif_chat)
          }
          const serviceTypes = ["agent", "interior", "moving", "cleaning", "repair"]
          if (serviceTypes.includes(profile.account_type ?? "")) {
            setIsServiceProvider(true)
          }
        }
      } catch {}
    })()
  }, [])
  const setNotifChat = async (on: boolean) => {
    chatPrefs.setNotifOffAll(!on)
    if (!authUserId) return
    const supabase = createClient()
    const { error } = await supabase
      .from("profiles")
      .update({ notif_chat: on })
      .eq("id", authUserId)
    if (error) {
      chatPrefs.setNotifOffAll(on) // 롤백
      toast.error("알림 설정 저장에 실패했습니다")
    }
  }

  // 카테고리 분류 헬퍼 — 전원일기: 농기구/일손/나눔/로컬푸드/공지
  const getFilterCategory = (postType?: string) => {
    if (!postType) return "direct"
    if (postType === "admin_notice") return "notice"
    return postType
  }

  // 차단된 항목 제외 후 필터링
  const visibleRooms = useMemo(() => rooms.filter((r) => !blockedSet.has(`direct:${r.id}`)), [rooms, blockedSet])

  const filteredRooms = useMemo(() => activeFilter === "all"
    ? visibleRooms
    : visibleRooms.filter((r) => getFilterCategory(r.post_type) === activeFilter), [visibleRooms, activeFilter])
  // 빈 상태 판정을 단일 기준으로 — 조건이 여러 곳에 분산돼 오작동하는 것 방지
  const hasAnyVisibleRoom = filteredRooms.length > 0

  const counts = useMemo(() => ({
    all: visibleRooms.length,
    sharing: visibleRooms.filter((r) => r.post_type === "sharing").length,
    local_food: visibleRooms.filter((r) => r.post_type === "local_food").length,
    secondhand: visibleRooms.filter((r) => r.post_type === "secondhand").length,
    jobs: visibleRooms.filter((r) => r.post_type === "jobs").length,
    notice: visibleRooms.filter((r) => r.post_type === "admin_notice").length,
  }), [visibleRooms])

  const directSectionsMemo = useMemo(() => [
    { key: "sharing", label: "나눔 채팅", rooms: filteredRooms.filter((r) => r.post_type === "sharing") },
    { key: "local_food", label: "로컬푸드 채팅", rooms: filteredRooms.filter((r) => r.post_type === "local_food") },
    { key: "secondhand", label: "농기구 채팅", rooms: filteredRooms.filter((r) => r.post_type === "secondhand") },
    { key: "jobs", label: "일손 채팅", rooms: filteredRooms.filter((r) => r.post_type === "jobs") },
  ], [filteredRooms])

  const FILTER_TABS: { key: string; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "sharing", label: "나눔" },
    { key: "local_food", label: "로컬푸드" },
    { key: "secondhand", label: "농기구" },
    { key: "jobs", label: "일손" },
    { key: "notice", label: "공지" },
  ]

  // SWR — localStorage 캐시로 다음 진입 시 즉시 표시 (모바일 AsyncStorage 캐시 1:1)
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem("chat:rooms-cache")
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.rooms)) setRooms(parsed.rooms)
          setIsLoading(false) // 캐시 hit 시 즉시 표시, 백그라운드에서 fresh fetch
        }
      }
    } catch {}
    fetchRooms()
  }, [])

  // rooms 변경 시 캐시 업데이트 — 다음 진입 가속
  useEffect(() => {
    if (rooms.length === 0) return
    try {
      window.localStorage.setItem(
        "chat:rooms-cache",
        JSON.stringify({ rooms, ts: Date.now() }),
      )
    } catch {}
  }, [rooms])

  // account_type 조회는 위 프로필 동기화 useEffect 에서 통합 처리

  const fetchRooms = async () => {
    try {
      const directRes = await fetch("/api/chat/rooms")

      if (directRes.status === 401) {
        window.location.href = "/auth/login"
        return
      }

      if (directRes.ok) {
        const data = await directRes.json()
        setRooms(data.rooms || [])
      }
    } catch (error) {
      console.error("채팅방 목록 조회 실패:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLeaveRoom = async (roomId: string, confirmText?: string) => {
    if (confirmText && !(await confirm({ description: confirmText, destructive: true }))) return false
    setLeavingRoomId(roomId)
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/leave`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || "대화방 나가기에 실패했습니다")
        return false
      }
      setRooms((prev) => prev.filter((r) => r.id !== roomId))
      return true
    } catch (e) {
      console.error("대화방 나가기 실패:", e)
      toast.error("대화방 나가기에 실패했습니다")
      return false
    } finally {
      setLeavingRoomId(null)
    }
  }

  // ── 장기 누름 감지
  const pressTimer = useRef<number | null>(null)
  const pressFiredRef = useRef(false)
  const startPress = (target: RoomMenuTarget) => {
    pressFiredRef.current = false
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      pressFiredRef.current = true
      setRoomMenu(target)
    }, 500)
  }
  const cancelPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  // ── 일괄편집 토글/선택
  const toggleBulkSelect = (key: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const exitBulk = () => {
    setBulkMode(false)
    setBulkSelected(new Set())
  }
  const runBulkLeave = async () => {
    const directIds = [...bulkSelected]
      .filter((k) => k.startsWith("direct:"))
      .map((k) => k.slice(7))
    if (directIds.length === 0) {
      toast("1:1 채팅만 일괄 나가기를 지원합니다")
      return
    }
    if (!(await confirm({ description: `선택한 ${directIds.length}개 대화방에서 나가시겠습니까?`, destructive: true }))) return
    if (bulkLeaving) return
    setBulkLeaving(true)
    let ok = 0
    let fail = 0
    try {
      for (const id of directIds) {
        const r = await handleLeaveRoom(id)
        if (r) ok++
        else fail++
      }
    } finally {
      setBulkLeaving(false)
    }
    if (fail === 0) {
      toast.success(`${ok}개 대화방에서 나갔습니다`)
      exitBulk()
    } else {
      // 실패가 있으면 bulk 모드 유지 — 사용자가 남은 항목을 재시도할 수 있도록
      toast.error(`${ok}개 완료, ${fail}개 실패했어요. 잠시 후 다시 시도해주세요.`)
    }
  }

  const formatTime = (dateString: string | null) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 60000) return "방금"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`
    return date.toLocaleDateString("ko-KR")
  }

  const formatPrice = (price: number, type: string) => {
    if (price >= 10000) {
      const uk = Math.floor(price / 10000)
      const man = price % 10000
      return man > 0 ? `${type} ${uk}억 ${man.toLocaleString()}만원` : `${type} ${uk}억`
    }
    return `${type} ${price.toLocaleString()}만원`
  }

  // 차단 관리: 차단된 키 목록을 라벨과 함께 보여주기 위해 in-memory map 유지
  const labelFor = (key: string): string => {
    if (key.startsWith("direct:")) {
      const id = key.slice(7)
      const r = rooms.find((x) => x.id === id)
      return r?.otherUser?.nickname || r?.property?.title || `1:1 채팅 ${id.slice(0, 6)}`
    }
    return key
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="relative max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
          {bulkMode ? (
            <>
              <button
                onClick={exitBulk}
                className="p-2 -ml-2 hover:bg-secondary rounded-full"
                aria-label="취소"
              >
                <X className="w-5 h-5 text-foreground" />
              </button>
              <h1 className="text-lg font-semibold text-foreground">
                {bulkSelected.size}개 선택
              </h1>
              <button
                onClick={runBulkLeave}
                disabled={bulkSelected.size === 0 || bulkLeaving}
                className="text-sm font-semibold text-destructive disabled:opacity-40"
              >
                {bulkLeaving ? "나가는 중…" : "나가기"}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <Link href="/" className="p-2 -ml-2 hover:bg-secondary rounded-full" aria-label="뒤로가기">
                  <ArrowLeft className="w-5 h-5 text-foreground" />
                </Link>
                {isServiceProvider && <InvitationBell showLabel />}
              </div>
              <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold text-foreground pointer-events-none">
                채팅
              </h1>
              <button
                onClick={() => setShowHeaderMenu(true)}
                aria-label="더보기"
                className="p-2 -mr-2 hover:bg-secondary rounded-full"
              >
                <MoreVertical className="w-5 h-5 text-foreground" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="sticky top-14 z-40 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 px-4 py-2 whitespace-nowrap">
            {FILTER_TABS.map((tab) => {
              const count = counts[tab.key as keyof typeof counts]
              if (tab.key !== "all" && count === 0) return null
              const active = activeFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-secondary",
                  )}
                >
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "min-w-[1.1rem] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
                        active
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Chat List */}
      <div className="max-w-2xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !hasAnyVisibleRoom ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageCircle className="w-12 h-12 mb-4" />
            <p>채팅 내역이 없습니다</p>
            <p className="text-sm mt-1">거래글에서 대화를 시작해보세요</p>
          </div>
        ) : (
          <>
            {(() => {
              const renderDirectRoom = (room: ChatRoom) => {
                const isAdminNotice = room.post_type === 'admin_notice'
                const muted = mutedSet.has(`direct:${room.id}`)
                const selKey = `direct:${room.id}`
                const checked = bulkSelected.has(selKey)
                const onActivate = () => {
                  if (pressFiredRef.current) {
                    pressFiredRef.current = false
                    return
                  }
                  if (bulkMode) {
                    toggleBulkSelect(selKey)
                  } else {
                    router.push(`/chat/${room.id}`)
                  }
                }
                return (
                  <div
                    key={room.id}
                    role="button"
                    tabIndex={0}
                    onClick={onActivate}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onActivate()
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (!bulkMode)
                        setRoomMenu({ kind: "direct", id: room.id, label: room.otherUser?.nickname || room.property?.title || "대화방" })
                    }}
                    onPointerDown={() => {
                      if (!bulkMode)
                        startPress({ kind: "direct", id: room.id, label: room.otherUser?.nickname || room.property?.title || "대화방" })
                    }}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerMove={cancelPress}
                    className={cn(
                      "flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors cursor-pointer select-none",
                      isAdminNotice && "bg-primary/5",
                      muted && "opacity-60",
                    )}
                  >
                    {bulkMode && !isAdminNotice && (
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                          checked ? "bg-primary border-primary" : "border-border",
                        )}
                      >
                        {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                    )}
                    <div className={cn(
                      "w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center",
                      isAdminNotice ? "bg-primary" : "bg-secondary"
                    )}>
                      {isAdminNotice ? (
                        <span className="text-xl">🏛️</span>
                      ) : room.property?.images?.[0] ? (
                        <Image src={room.property.images[0]} alt={room.property.title} width={56} height={56} className="w-full h-full object-cover" sizes="56px" />
                      ) : (
                        <MessageCircle className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn("font-medium truncate flex items-center gap-1.5", isAdminNotice ? "text-primary" : "text-foreground")}>
                          <span className="truncate">
                            {isAdminNotice ? `${plazaChipName(room.plaza_id) ? plazaChipName(room.plaza_id) + "광장" : "광장"} 관리자` : (room.otherUser?.nickname || "사용자")}
                          </span>
                          {/* Cross-Plaza 칩 — 상대가 다른 광장 사람이면 표시 */}
                          {!isAdminNotice && room.plaza_id && currentPlaza && room.plaza_id !== currentPlaza && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 flex-shrink-0">
                              {plazaChipName(room.plaza_id)}
                            </span>
                          )}
                          {muted && <BellOff className="w-3 h-3 text-muted-foreground" />}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatTime(room.last_message_at)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mb-1">
                        {room.last_message || "새로운 대화를 시작해보세요"}
                      </p>
                      {!isAdminNotice && room.property && (
                        <p className="text-xs text-primary truncate">
                          {room.property.title} · {formatPrice(room.property.price, room.property.transaction_type)}
                        </p>
                      )}
                      {isAdminNotice && (
                        <p className="text-xs text-primary truncate">관리자 공지</p>
                      )}
                    </div>
                    {!muted && room.unreadCount > 0 && !bulkMode && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-primary-foreground font-medium">
                          {room.unreadCount > 9 ? "9+" : room.unreadCount}
                        </span>
                      </div>
                    )}
                    {!isAdminNotice && !bulkMode && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleLeaveRoom(room.id, "대화방에서 나가시겠습니까?") }}
                        disabled={leavingRoomId === room.id}
                        aria-label="대화방 나가기"
                        title="대화방 나가기"
                        className="flex-shrink-0 p-2 -mr-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              }

              const directSections: { key: string; label: string; rooms: ChatRoom[] }[] = directSectionsMemo

              const showSectionHeader = activeFilter === "all"

              const renderSection = (sec: { key: string; label: string; rooms: ChatRoom[] }) =>
                sec.rooms.length > 0 && (
                  <div key={sec.key} className="border-b border-border">
                    {showSectionHeader && (
                      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-muted-foreground" />
                        <h2 className="text-sm font-bold text-foreground">{sec.label}</h2>
                        <span className="text-xs text-muted-foreground">({sec.rooms.length})</span>
                      </div>
                    )}
                    <div className="divide-y divide-border/50">
                      {sec.rooms.map(renderDirectRoom)}
                    </div>
                  </div>
                )

              return <>{directSections.map(renderSection)}</>
            })()}

            {/* 공지 섹션 */}
            {(() => {
              const noticeRooms = filteredRooms.filter((r) => r.post_type === "admin_notice")
              if (noticeRooms.length === 0) return null
              return (
                <div className="border-b border-border">
                  {activeFilter === "all" && (
                    <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-bold text-foreground">공지</h2>
                      <span className="text-xs text-muted-foreground">({noticeRooms.length})</span>
                    </div>
                  )}
                  <div className="divide-y divide-border/50">
                    {noticeRooms.map((room) => (
                      <div
                        key={room.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/chat/${room.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            router.push(`/chat/${room.id}`)
                          }
                        }}
                        className="flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors cursor-pointer bg-primary/5"
                      >
                        <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center bg-primary">
                          <span className="text-xl">🏛️</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium truncate text-primary">{plazaChipName(room.plaza_id) ? plazaChipName(room.plaza_id) + "광장" : "광장"} 관리자</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">{formatTime(room.last_message_at)}</span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mb-1">
                            {room.last_message || "새로운 대화를 시작해보세요"}
                          </p>
                          <p className="text-xs text-primary truncate">관리자 공지</p>
                        </div>
                        {room.unreadCount > 0 && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-primary-foreground font-medium">
                              {room.unreadCount > 9 ? "9+" : room.unreadCount}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* Floating + Button */}
      <div className="fixed inset-x-0 bottom-20 pointer-events-none z-40">
        <div className="max-w-2xl mx-auto px-4 flex justify-end">
          <button
            onClick={() => setShowExpertModal(true)}
            aria-label="전문가 초대"
            className="pointer-events-auto w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl hover:scale-110 transition-all duration-200 flex items-center justify-center"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {showExpertModal && (
        <ExpertSelectionModal onClose={() => setShowExpertModal(false)} />
      )}

      {/* ── 헤더 메뉴: 대화방 설정 (...) */}
      {showHeaderMenu && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowHeaderMenu(false)}
            aria-hidden
          />
          <div className="relative w-full md:w-[420px] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-base font-semibold">대화방 설정</h3>
              <button
                onClick={() => setShowHeaderMenu(false)}
                aria-label="닫기"
                className="p-1.5 hover:bg-secondary rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="divide-y divide-border/50">
              <button
                onClick={() => {
                  setShowHeaderMenu(false)
                  setBulkMode(true)
                }}
                className="w-full flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 text-left"
              >
                <Edit3 className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">대화방 일괄편집</span>
              </button>
              <div className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {notifOffAll ? <BellOff className="w-5 h-5 text-muted-foreground" /> : <Bell className="w-5 h-5 text-muted-foreground" />}
                    <span className="font-medium">알림 설정</span>
                  </div>
                  <button
                    onClick={() => setNotifChat(notifOffAll)}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors",
                      notifOffAll ? "bg-muted" : "bg-primary",
                    )}
                    aria-label="채팅 알림 토글"
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                        !notifOffAll && "translate-x-5",
                      )}
                    />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {notifOffAll ? "전체 채팅 알림이 꺼져 있습니다" : "전체 채팅 알림이 켜져 있습니다"}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowHeaderMenu(false)
                  setBlockedManagerOpen(true)
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-4 hover:bg-secondary/50 text-left"
              >
                <div className="flex items-center gap-3">
                  <Ban className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">차단 목록 관리</span>
                </div>
                <span className="text-xs text-muted-foreground">{blockedSet.size}개</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 차단 관리 시트 */}
      {blockedManagerOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setBlockedManagerOpen(false)}
            aria-hidden
          />
          <div className="relative w-full md:w-[420px] max-h-[75vh] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-base font-semibold">차단 목록 관리 <span className="text-muted-foreground font-normal text-sm">{blockedSet.size}</span></h3>
              <button onClick={() => setBlockedManagerOpen(false)} aria-label="닫기" className="p-1.5 hover:bg-secondary rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto">
              {blockedSet.size === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">차단한 대화방이 없습니다</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {[...blockedSet].map((key) => (
                    <div key={key} className="flex items-center justify-between px-4 py-3">
                      <span className="truncate text-sm">{labelFor(key)}</span>
                      <button
                        onClick={() => chatPrefs.unblock(key)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        차단 해제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 행 메뉴: 대화방 관리 */}
      {roomMenu && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRoomMenu(null)} aria-hidden />
          <div className="relative w-full md:w-[420px] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-base font-semibold">대화방 관리</h3>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{roomMenu.label}</p>
            </div>
            <div className="divide-y divide-border/50">
              {(() => {
                const key = `direct:${roomMenu.id}`
                const isMuted = mutedSet.has(key)
                return (
                  <>
                    <button
                      onClick={() => {
                        chatPrefs.toggleMuted(key)
                        setRoomMenu(null)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 text-left"
                    >
                      {isMuted ? <Bell className="w-5 h-5 text-muted-foreground" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
                      <span className="font-medium">{isMuted ? "알림 켜기" : "알림 끄기"}</span>
                    </button>
                    <button
                      onClick={async () => {
                        if (!(await confirm({ description: "이 대화방을 차단하시겠습니까?\n목록에서 숨겨집니다.", destructive: true }))) return
                        chatPrefs.block(key)
                        setRoomMenu(null)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 text-left"
                    >
                      <Ban className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">차단하기</span>
                    </button>
                    <button
                      onClick={() => {
                        const target = roomMenu
                        setRoomMenu(null)
                        setReportFor(target)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 text-left"
                    >
                      <Flag className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">신고하기</span>
                    </button>
                    <button
                      onClick={async () => {
                        const target = roomMenu
                        setRoomMenu(null)
                        await handleLeaveRoom(target.id, "대화방에서 나가시겠습니까?")
                      }}
                      className="w-full flex items-center gap-3 px-4 py-4 hover:bg-secondary/50 text-left text-destructive"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span className="font-medium">대화방 나가기</span>
                    </button>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── 신고 시트 */}
      {reportFor && (
        <ReportSheet
          target={reportFor}
          onClose={() => setReportFor(null)}
        />
      )}

      <BottomNav />
    </div>
  )
}

function ReportSheet({
  target,
  onClose,
}: {
  target: RoomMenuTarget
  onClose: () => void
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0])
  const [detail, setDetail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    try {
      // 모임/공동구매는 1:1 신고 엔드포인트가 없어 일단 동일 엔드포인트로 보냄(roomId 슬롯에 담아 기록만 남김)
      const idForUrl = target.id
      const res = await fetch(`/api/chat/rooms/${idForUrl}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, detail }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // 404 = 해당 채팅 유형(모임/공동구매)에 신고 엔드포인트가 아직 없음 → 거짓 성공 대신 솔직히 안내
        toast.error(
          res.status === 404
            ? "현재 이 채팅에서는 신고가 지원되지 않습니다. 고객센터로 문의해 주세요."
            : (data?.error || "신고 접수에 실패했습니다"),
        )
        return
      }
      toast.success("신고가 접수되었습니다")
      onClose()
    } catch (e) {
      console.error(e)
      toast.error("신고 접수에 실패했습니다")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative w-full md:w-[420px] bg-card rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-base font-semibold">신고하기</h3>
          <button onClick={onClose} aria-label="닫기" className="p-1.5 hover:bg-secondary rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground truncate">대상: {target.label}</p>
          <div className="space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer text-sm",
                  reason === r ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-primary"
                />
                <span>{r}</span>
              </label>
            ))}
          </div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="상세 내용 (선택)"
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full h-11 rounded-lg bg-destructive text-destructive-foreground font-semibold disabled:opacity-50"
          >
            {submitting ? "접수 중..." : "신고 접수"}
          </button>
        </div>
      </div>
    </div>
  )
}
