"use client"

import { useEffect, useMemo, useState, useRef, use } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Phone, MoreVertical, X, Users as UsersIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/confirm-provider"
import { ChatShell } from "@/components/chat/chat-shell"
import { ChatHeader } from "@/components/chat/chat-header"
import {
  ChatContextCard,
  ChatContextBadge,
} from "@/components/chat/chat-context-card"
import type { StripParticipant } from "@/components/chat/participant-strip"
import {
  DateDivider,
  MessageBubble,
  formatChatTime,
  formatChatDate,
} from "@/components/chat/message-primitives"
import { ChatComposer, QuickReplies } from "@/components/chat/chat-composer"
import { ChatEmpty, ChatLoading } from "@/components/chat/chat-empty"
import { toast } from "sonner"

interface Message {
  id: string
  chat_room_id: string
  sender_id: string
  content: string | null
  image_url?: string | null
  is_read: boolean
  created_at: string
}

interface ChatRoom {
  id: string
  property_id: string
  buyer_id: string
  seller_id: string
  post_type?: string
  plaza_id?: string | null
}

interface Property {
  id: string
  title: string
  price: number
  transaction_type: string
  images: string[] | null
  status: string | null
  address?: string
}

interface PostContext {
  href: string
  image?: string
  title: string
  meta?: string
  badgeLabel?: string
  badgeTone?: "primary" | "amber" | "muted"
}

interface Participant {
  id: string
  nickname: string | null
  avatar_url: string | null
  account_type: string | null
  phone: string | null
  role: "buyer" | "seller" | "expert"
}

interface ChatRoomPageProps {
  params: Promise<{ roomId: string }>
}

const QUICK_REPLIES = [
  "혹시 예약 가능한가요?",
  "구매하고 싶습니다.",
  "아직 판매중인가요?",
]

export default function ChatRoomPage({ params }: ChatRoomPageProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const { roomId } = use(params)
  const [messages, setMessages] = useState<Message[]>([])
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [postContext, setPostContext] = useState<PostContext | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)
  const [showParticipantsModal, setShowParticipantsModal] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [showMenuModal, setShowMenuModal] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantCount, setParticipantCount] = useState(2)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    // getCurrentUser must resolve before fetchMessages so that
    // loadPostContext (called inside fetchMessages) can read currentUserId.
    getCurrentUser().then(() => {
      if (!cancelled) fetchMessages()
    })
    return () => { cancelled = true }
  }, [roomId])

  useEffect(() => {
    const supabase = createClient()
    // mobile @gwangjang/features/chat 와 동일 채널명 — 향후 presence/typing 통합 대비
    const channel = supabase
      .channel(`chat-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            // If message is from current user and a temp message exists with matching content, replace it
            if (newMsg.sender_id === currentUserIdRef.current) {
              const hasTemp = prev.some(m => m.id.startsWith('temp-') && m.content === newMsg.content)
              if (hasTemp) {
                return prev
                  .map(m => m.id.startsWith('temp-') && m.content === newMsg.content ? newMsg : m)
                  .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
              }
            }
            return [...prev, newMsg]
          })
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[chat] realtime channel error, retrying...')
          // Supabase 클라이언트가 자동 재연결하지만 gap 메시지 복구
          setTimeout(async () => {
            try {
              const s = createClient()
              const { data } = await s
                .from('messages')
                .select('*')
                .eq('chat_room_id', roomId)
                .order('created_at', { ascending: false })
                .limit(20)
              if (data && data.length > 0) {
                setMessages((prev) => {
                  const ids = new Set(prev.map(m => m.id))
                  const fresh = (data as Message[]).filter((m) => !ids.has(m.id))
                  return fresh.length > 0 ? [...prev, ...fresh].sort((a, b) =>
                    new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime()
                  ) : prev
                })
              }
            } catch { /* silent */ }
          }, 2000)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  useEffect(() => {
    // 사용자가 현재 하단에 있는 경우에만 자동 스크롤
    // (위로 올려 과거 메시지 읽는 중이면 강제로 끌어내리지 않음)
    const el = endRef.current
    if (!el) return
    const container = el.parentElement
    if (!container) {
      el.scrollIntoView({ behavior: "smooth" })
      return
    }
    // 페이지 스크롤 기준으로도 동작
    const docNearBottom =
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200
    if (docNearBottom) {
      el.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const getCurrentUser = async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      currentUserIdRef.current = user.id
    }
  }

  const fetchMessages = async () => {
    setLoadError(false)
    try {
      const response = await fetch(`/api/chat/messages?roomId=${roomId}`)
      const data = await response.json().catch(() => ({}))

      if (response.status === 401) {
        window.location.href = "/auth/login"
        return
      }

      if (response.ok) {
        setMessages(data.messages || [])
        setRoom(data.room)

        if (data.participants) {
          setParticipants(data.participants)
          setParticipantCount(data.participants.length)
        }

        if (data.room) {
          await loadPostContext(data.room)
        }
      } else {
        // 403/404/500 등 — 빈 채팅방으로 보이지 않도록 에러 상태 표시
        console.error("메시지 조회 실패:", response.status, data)
        setLoadError(true)
      }
    } catch (error) {
      console.error("메시지 조회 실패:", error)
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }

  const loadPostContext = async (room: ChatRoom) => {
    const supabase = createClient()
    const postType = room.post_type || "property"
    const postId = room.property_id

    try {
      if (postType === "sharing") {
        const { data } = await supabase
          .from("sharing_posts")
          .select("id, title, images, status")
          .eq("id", postId)
          .single()
        if (data) {
          const label =
            data.status === "reserved" ? "예약중" :
            data.status === "completed" ? "나눔완료" : "나눔중"
          const tone: "primary" | "amber" | "muted" =
            data.status === "reserved" ? "amber" : data.status === "completed" ? "muted" : "primary"
          setPostContext({
            href: `/sharing/${data.id}`,
            image: data.images?.[0],
            title: data.title,
            meta: "무료 나눔",
            badgeLabel: label,
            badgeTone: tone,
          })
        }
      } else if (postType === "local_food") {
        const { data } = await supabase
          .from("local_food")
          .select("id, title, images, price, unit, category")
          .eq("id", postId)
          .single()
        if (data) {
          const priceStr = typeof data.price === "number"
            ? `${data.price.toLocaleString()}원${data.unit ? ` / ${data.unit}` : ""}`
            : "가격 문의"
          setPostContext({
            href: `/local-food/${data.id}`,
            image: data.images?.[0],
            title: data.title,
            meta: priceStr,
            badgeLabel: data.category || "로컬푸드",
            badgeTone: "primary",
          })
        }
      } else if (postType === "secondhand") {
        const { data } = await supabase
          .from("secondhand_posts")
          .select("id, title, images, price, category, status")
          .eq("id", postId)
          .single()
        if (data) {
          const priceStr =
            typeof data.price === "number" && data.price > 0
              ? `${data.price.toLocaleString()}원`
              : "가격 문의"
          setPostContext({
            href: `/secondhand/${data.id}`,
            image: (data.images as string[] | null)?.[0],
            title: data.title,
            meta: priceStr,
            badgeLabel: data.category || "농기구/자재",
            badgeTone: "primary",
          })
        }
      } else if (postType === "jobs") {
        const { data } = await supabase
          .from("jobs_posts")
          .select("id, title, images, category, hourly_wage, kind")
          .eq("id", postId)
          .single()
        if (data) {
          setPostContext({
            href: `/jobs/${data.id}`,
            image: (data.images as string[] | null)?.[0],
            title: data.title,
            meta:
              typeof data.hourly_wage === "number"
                ? `시급 ${data.hourly_wage.toLocaleString()}원`
                : undefined,
            badgeLabel: data.category || (data.kind === "seeking" ? "구직" : "구인"),
            badgeTone: "primary",
          })
        }
      } else if (postType === "direct") {
        // 다이렉트 메시지 — 상대 사용자 프로필을 컨텍스트로 사용
        const otherUserId =
          room.buyer_id === currentUserId ? room.seller_id : room.buyer_id
        if (otherUserId) {
          const { data } = await supabase
            .from("profiles")
            .select("id, nickname, full_name, avatar_url")
            .eq("id", otherUserId)
            .maybeSingle()
          if (data) {
            const name = data.nickname || data.full_name || "사용자"
            setPostContext({
              href: `/profile/${data.id}`,
              image: data.avatar_url || undefined,
              title: name,
              meta: "다이렉트 메시지",
              badgeLabel: "DM",
              badgeTone: "muted",
            })
          }
        }
      }
    } catch (err) {
      console.error("[chat room] 게시물 정보 로딩 실패:", err)
    }
  }

  const handleSend = async () => {
    if (!newMessage.trim() || isSending || !currentUserId) return

    const messageContent = newMessage.trim()
    setNewMessage("")
    setIsSending(true)

    const optimisticMessage: Message = {
      // 동일 ms 내 더블클릭 충돌 방지 — randomUUID 우선, 미지원 시 fallback
      id: `temp-${
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }`,
      chat_room_id: roomId,
      sender_id: currentUserId,
      content: messageContent,
      is_read: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, content: messageContent }),
      })

      const data = await response.json()

      if (response.ok && data.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticMessage.id ? data.message : m)),
        )
      } else {
        setMessages((prev) =>
          prev.filter((m) => m.id !== optimisticMessage.id),
        )
        toast.error("메시지 전송에 실패했습니다")
      }
    } catch (error) {
      console.error("메시지 전송 실패:", error)
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
      toast.error("메시지 전송에 실패했습니다")
    } finally {
      setIsSending(false)
    }
  }

  const handleImagePick = async (file: File) => {
    if (isSending || !currentUserId) return
    setIsSending(true)

    // 낙관적 미리보기 — 로컬 objectURL 로 즉시 표시 후 업로드 완료 시 교체/정리
    const localUrl = URL.createObjectURL(file)
    const tempId = `temp-${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }`
    const optimisticMessage: Message = {
      id: tempId,
      chat_room_id: roomId,
      sender_id: currentUserId,
      content: null,
      image_url: localUrl,
      is_read: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      // 1) /api/upload → R2 URL
      const form = new FormData()
      form.append("file", file)
      form.append("folder", "misc")
      const upRes = await fetch("/api/upload", { method: "POST", body: form })
      const upData = await upRes.json().catch(() => ({}))
      if (!upRes.ok || !upData.url) {
        throw new Error(upData.error || "이미지 업로드에 실패했습니다")
      }

      // 2) image_url 로 메시지 전송
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, image_url: upData.url }),
      })
      const data = await response.json()
      if (response.ok && data.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data.message : m)),
        )
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        toast.error("사진 전송에 실패했습니다")
      }
    } catch (error) {
      console.error("사진 전송 실패:", error)
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      toast.error(error instanceof Error ? error.message : "사진 전송에 실패했습니다")
    } finally {
      URL.revokeObjectURL(localUrl)
      setIsSending(false)
    }
  }

  const formatPrice = (price: number) => {
    if (price >= 10000) {
      const uk = Math.floor(price / 10000)
      const man = price % 10000
      return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억`
    }
    return `${price.toLocaleString()}만원`
  }

  // 날짜별 메시지 그룹화
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = []
    let currentDate = ""
    msgs.forEach((message) => {
      const messageDate = new Date(message.created_at).toDateString()
      if (messageDate !== currentDate) {
        currentDate = messageDate
        groups.push({ date: message.created_at, messages: [message] })
      } else {
        groups[groups.length - 1].messages.push(message)
      }
    })
    return groups
  }

  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages])

  const isAdminNotice = room?.post_type === "admin_notice"
  const isPropertyChat = !room?.post_type || room.post_type === "property"

  // 광장 이름 매핑
  const plazaDisplayName = (id: string | null | undefined) => {
    if (!id) return "광장"
    const map: Record<string, string> = { chuncheon: "춘천광장", gangneung: "강릉광장", gyeongsan: "경산광장", goyang: "고양광장" }
    return map[id] ?? `${id}광장`
  }

  // 헤더
  const displayTitle = isAdminNotice
    ? `${plazaDisplayName(room?.plaza_id)} 관리자`
    : postContext?.title || property?.title || "채팅"

  const headerSubtitle = isAdminNotice
    ? "공지사항"
    : participants.length > 0
      ? participants
          .filter((p) => p.id !== currentUserId)
          .map((p) => p.nickname || "사용자")
          .join(", ") || "참가자 보기"
      : "참가자 보기"

  // ParticipantStrip
  const stripParticipants: StripParticipant[] = participants.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    avatar_url: p.avatar_url,
    badge:
      p.role === "seller"
        ? "seller"
        : p.role === "expert"
          ? "host"
          : null,
    profileHref: `/profile/${p.id}`,
  }))

  const statusTone = (() => {
    if (!property) return "primary" as const
    return property.status === "active"
      ? "primary"
      : property.status === "reserved"
        ? "amber"
        : "muted"
  })()

  const statusLabel = property
    ? property.status === "active"
      ? "판매중"
      : property.status === "reserved"
        ? "예약중"
        : "거래완료"
    : ""

  // Shell slots
  // admin_notice 는 기존 ChatHeader 유지, 그 외는 참가자 + 전문가 초대 스트립을 헤더로 사용
  const header = isAdminNotice ? (
    <ChatHeader
      title={displayTitle}
      subtitle={headerSubtitle}
    />
  ) : (
    <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
      <div className="flex items-center gap-2 px-3 h-14">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-1 hover:bg-secondary rounded-full shrink-0"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        {/* 참가자 수 + 아바타들 (클릭시 참가자 모달) */}
        <button
          type="button"
          onClick={() => setShowParticipantsModal(true)}
          className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <UsersIcon className="w-3.5 h-3.5" />
            <span>
              참가자{" "}
              <span className="font-medium text-foreground">
                {participantCount}
              </span>
              {isPropertyChat && <span className="text-muted-foreground">/3</span>}
            </span>
            {isPropertyChat && participantCount >= 3 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                정원마감
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
            {stripParticipants.slice(0, 6).map((p) => {
              const initial = p.nickname?.[0] || "?"
              return (
                <div key={p.id} className="shrink-0 relative" title={p.nickname ?? undefined}>
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border">
                    {p.avatar_url ? (
                      <Image src={p.avatar_url} alt="" width={28} height={28} className="w-full h-full rounded-full object-cover" unoptimized />
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">{initial}</span>
                    )}
                  </div>
                  {p.badge === "seller" && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card bg-primary" />
                  )}
                  {p.badge === "host" && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card bg-indigo-500" />
                  )}
                </div>
              )
            })}
            {stripParticipants.length > 6 && (
              <div className="shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                +{stripParticipants.length - 6}
              </div>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowPhoneModal(true)}
            className="p-2 hover:bg-secondary rounded-full"
            aria-label="전화"
          >
            <Phone className="w-5 h-5 text-foreground" />
          </button>
          <button
            onClick={() => setShowMenuModal(true)}
            className="p-2 hover:bg-secondary rounded-full"
            aria-label="메뉴"
          >
            <MoreVertical className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </div>
    </header>
  )

  const contextCard =
    postContext && !isAdminNotice ? (
      <ChatContextCard
        href={postContext.href}
        image={postContext.image}
        imageAlt={postContext.title}
        badge={
          postContext.badgeLabel ? (
            <ChatContextBadge tone={postContext.badgeTone || "primary"}>
              {postContext.badgeLabel}
            </ChatContextBadge>
          ) : undefined
        }
        title={postContext.title}
        meta={postContext.meta}
      />
    ) : property && !isAdminNotice ? (
      <ChatContextCard
        href={`/property/${property.id}`}
        image={property.images?.[0]}
        imageAlt={property.title}
        badge={
          <ChatContextBadge tone={statusTone}>{statusLabel}</ChatContextBadge>
        }
        title={property.title}
        meta={formatPrice(property.price)}
      />
    ) : null

  // ParticipantStrip 콘텐츠가 헤더에 통합되어 별도 스트립은 렌더하지 않음
  const participantsBlock = null

  const composer = isAdminNotice ? (
    <div className="bg-card border-t border-border p-4 text-center">
      <p className="text-sm text-muted-foreground">
        관리자 공지는 답장할 수 없습니다.
      </p>
    </div>
  ) : (
    <ChatComposer
      value={newMessage}
      onChange={setNewMessage}
      onSend={handleSend}
      onImagePick={handleImagePick}
      sending={isSending}
      placeholder="메시지 보내기"
      topSlot={
        messages.length === 0 ? (
          <QuickReplies items={QUICK_REPLIES} onPick={setNewMessage} />
        ) : undefined
      }
    />
  )

  return (
    <ChatShell
      header={header}
      contextCard={contextCard}
      participants={participantsBlock}
      composer={composer}
      overlays={
        <>
          {showParticipantsModal && (
            <div
              className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center"
              role="dialog"
              aria-modal="true"
              aria-label="참가자 목록"
              onClick={() => setShowParticipantsModal(false)}
            >
              <div
                className="bg-card w-full max-w-md rounded-t-2xl md:rounded-2xl max-h-[70vh] overflow-hidden animate-in slide-in-from-bottom duration-300 pb-[env(safe-area-inset-bottom)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h2 className="text-lg font-semibold">
                    참가자 ({participantCount}명)
                  </h2>
                  <button
                    onClick={() => setShowParticipantsModal(false)}
                    aria-label="닫기"
                    className="p-2 hover:bg-secondary rounded-full"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto max-h-[50vh]">
                  {participants.map((participant) => (
                    <Link
                      key={participant.id}
                      href={`/profile/${participant.id}`}
                      onClick={() => setShowParticipantsModal(false)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary flex-shrink-0">
                        {participant.avatar_url ? (
                          <img
                            src={participant.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-semibold">
                            {participant.nickname?.charAt(0) || "?"}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {participant.nickname || "사용자"}
                          </span>
                          {participant.id === currentUserId && (
                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              나
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded inline-block mt-0.5",
                            participant.role === "buyer"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                              : participant.role === "seller"
                                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
                          )}
                        >
                          {participant.role === "buyer"
                            ? "구매자"
                            : participant.role === "seller"
                              ? "판매자"
                              : participant.account_type === "agent"
                                ? "공인중개사"
                                : participant.account_type === "interior"
                                  ? "인테리어"
                                  : participant.account_type === "moving"
                                    ? "이사"
                                    : participant.account_type === "cleaning"
                                      ? "청소"
                                      : participant.account_type === "repair"
                                        ? "수리"
                                        : "전문가"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showPhoneModal && (
            <div
              className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center"
              role="dialog"
              aria-modal="true"
              aria-label="전화 걸기"
              onClick={() => setShowPhoneModal(false)}
            >
              <div
                className="bg-card w-full max-w-md rounded-t-2xl md:rounded-2xl max-h-[70vh] overflow-hidden animate-in slide-in-from-bottom duration-300 pb-[env(safe-area-inset-bottom)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h2 className="text-lg font-semibold">전화 걸기</h2>
                  <button
                    onClick={() => setShowPhoneModal(false)}
                    aria-label="닫기"
                    className="p-2 hover:bg-secondary rounded-full"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto max-h-[50vh]">
                  {participants
                    .filter((p) => p.id !== currentUserId)
                    .map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
                      >
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary flex-shrink-0">
                          {participant.avatar_url ? (
                            <img
                              src={participant.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-semibold">
                              {participant.nickname?.charAt(0) || "?"}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {participant.nickname || "사용자"}
                          </div>
                          {participant.phone ? (
                            <div className="text-sm text-muted-foreground">
                              {participant.phone}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              전화번호 없음
                            </div>
                          )}
                        </div>
                        {participant.phone && (
                          <a
                            href={`tel:${participant.phone}`}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                            onClick={() => setShowPhoneModal(false)}
                          >
                            <Phone className="w-4 h-4" />
                            <span className="text-sm">전화</span>
                          </a>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {showMenuModal && (
            <div
              className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center"
              role="dialog"
              aria-modal="true"
              aria-label="대화방 설정"
              onClick={() => setShowMenuModal(false)}
            >
              <div
                className="bg-card w-full max-w-md rounded-t-2xl md:rounded-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 pb-[env(safe-area-inset-bottom)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h2 className="text-lg font-semibold">대화방 설정</h2>
                  <button
                    onClick={() => setShowMenuModal(false)}
                    aria-label="닫기"
                    className="p-2 hover:bg-secondary rounded-full"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-2">
                  <button
                    onClick={async () => {
                      if (!(await confirm({ description: "대화방에서 나가시겠습니까?\n참여자라면 대화방이 삭제되고, 초대받은 전문가라면 대화방에서 빠집니다.", destructive: true }))) {
                        return
                      }
                      try {
                        const res = await fetch(`/api/chat/rooms/${roomId}/leave`, {
                          method: "POST",
                        })
                        const data = await res.json().catch(() => ({}))
                        if (!res.ok) {
                          toast.error(data?.error || "대화방 나가기에 실패했습니다")
                          return
                        }
                        setShowMenuModal(false)
                        window.location.href = "/chat"
                      } catch (e) {
                        console.error("대화방 나가기 실패:", e)
                        toast.error("대화방 나가기에 실패했습니다")
                      }
                    }}
                    className="w-full p-4 text-left hover:bg-secondary rounded-lg transition-colors text-destructive"
                  >
                    대화방 나가기
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      }
    >
      {isLoading ? (
        <ChatLoading />
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <p className="text-sm text-muted-foreground">메시지를 불러오지 못했습니다</p>
          <button
            onClick={() => { setIsLoading(true); fetchMessages() }}
            className="px-5 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90"
          >
            다시 시도
          </button>
        </div>
      ) : messages.length === 0 ? (
        <ChatEmpty />
      ) : (
        messageGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-2">
            <DateDivider>{formatChatDate(group.date)}</DateDivider>
            {group.messages.map((message, msgIndex) => {
              const isMe = message.sender_id === currentUserId
              const prev = group.messages[msgIndex - 1]
              const showAvatar =
                !isMe && (!prev || prev.sender_id !== message.sender_id)
              const sender = participants.find(
                (p) => p.id === message.sender_id,
              )
              const senderBadge =
                sender?.role === "seller" ? (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    판매자
                  </span>
                ) : sender?.role === "expert" ? (
                  <span className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 px-1.5 py-0.5 rounded">
                    전문가
                  </span>
                ) : undefined

              return (
                <MessageBubble
                  key={message.id}
                  isMe={isMe}
                  showAvatar={showAvatar}
                  senderId={sender?.id}
                  senderName={showAvatar ? sender?.nickname : null}
                  senderAvatarUrl={sender?.avatar_url}
                  senderBadge={showAvatar ? senderBadge : undefined}
                  time={formatChatTime(message.created_at)}
                  image={message.image_url}
                >
                  {message.content}
                </MessageBubble>
              )
            })}
          </div>
        ))
      )}
      <div ref={endRef} />
    </ChatShell>
  )
}
