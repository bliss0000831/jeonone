"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import { Loader2, MoreVertical, MessageCircle, Users as UsersIcon, RotateCcw, ArrowLeft, LogOut, Info } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useConfirm } from "@/components/confirm-provider"
import { ChatShell } from "@/components/chat/chat-shell"
import { ChatHeader } from "@/components/chat/chat-header"
import {
  ChatContextCard,
  ChatContextBadge,
} from "@/components/chat/chat-context-card"
import {
  ParticipantsModal,
  type ModalParticipant,
} from "@/components/chat/participants-modal"
import {
  DateDivider,
  MessageBubble,
  formatChatTime,
  formatChatDate,
} from "@/components/chat/message-primitives"
import { ChatComposer } from "@/components/chat/chat-composer"
import { ChatEmpty } from "@/components/chat/chat-empty"
import { toast } from "sonner"

interface Message {
  id: string
  club_id: string
  user_id: string
  content: string | null
  image_url: string | null
  created_at: string
}

interface MemberProfile {
  user_id: string
  joined_at: string
  profile: { id: string; nickname: string | null; avatar_url: string | null } | null
}

interface ClubInfo {
  id: string
  title: string
  sport_type: string
  images: string[] | null
  status: string
  max_members: number
  current_members: number
  user_id: string
}

const SPORT_EMOJI: Record<string, string> = {
  러닝: "🏃",
  축구: "⚽",
  배드민턴: "🏸",
  테니스: "🎾",
  자전거: "🚴",
  등산: "🥾",
  요가: "🧘",
  헬스: "💪",
}

export default function ClubChatPage() {
  const params = useParams()
  const router = useRouter()
  const confirm = useConfirm()
  const clubId = params.clubId as string

  const [user, setUser] = useState<User | null>(null)
  const [club, setClub] = useState<ClubInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<MemberProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)

  const handleLeave = useCallback(async () => {
    if (leaveLoading) return
    if (!(await confirm({ description: "채팅방에서 나가면 다시 들어올 수 없습니다. 정말 나가시겠습니까?", destructive: true }))) return
    setLeaveLoading(true)
    try {
      const res = await fetch(`/api/clubs/${clubId}/join`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "나가기 실패")
        return
      }
      router.push("/clubs")
    } finally {
      setLeaveLoading(false)
    }
  }, [clubId, leaveLoading, router, confirm])

  const endRef = useRef<HTMLDivElement>(null)
  const supabase = useRef(createClient()).current

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      })
    })
  }, [])

  const markRead = useCallback(async () => {
    try {
      await fetch(`/api/clubs/${clubId}/chat/read`, { method: "POST" })
    } catch {}
  }, [clubId])

  // 초기 로드
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      if (cancelled) return
      setUser(user)

      const res = await fetch(`/api/clubs/${clubId}/chat`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "채팅방에 접근할 수 없습니다")
        setLoading(false)
        return
      }
      if (cancelled) return
      setClub(data.club)
      setMessages(data.messages)
      setMembers(data.members)
      setLoading(false)
      scrollToBottom(false)
      markRead()
    })()
    return () => {
      cancelled = true
    }
  }, [clubId, router, supabase, scrollToBottom, markRead])

  // Realtime
  useEffect(() => {
    if (!user || !club) return
    const channel = supabase
      .channel(`club-chat-${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "club_chat_messages",
          filter: `club_id=eq.${clubId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          scrollToBottom()
          if (newMsg.user_id !== user.id) markRead()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, club, clubId, supabase, scrollToBottom, markRead])

  // 메시지 끝 자동 스크롤
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput("")
    try {
      const res = await fetch(`/api/clubs/${clubId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "전송 실패")
        setInput(text)
      }
      if (data?.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev
          return [...prev, data.message]
        })
        scrollToBottom()
      }
    } finally {
      setSending(false)
    }
  }

  const handleImagePick = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast("이미지는 10MB 이하로 업로드해주세요")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "club-chat")
      const res = await fetch("/api/board/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error(data.error || "업로드 실패")
        return
      }
      const send = await fetch(`/api/clubs/${clubId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: data.url }),
      })
      const sendData = await send.json()
      if (send.ok && sendData?.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === sendData.message.id)) return prev
          return [...prev, sendData.message]
        })
        scrollToBottom()
      }
    } finally {
      setUploading(false)
    }
  }

  const profileOf = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile
  const nicknameOf = (userId: string) => profileOf(userId)?.nickname || "사용자"
  const avatarOf = (userId: string) => profileOf(userId)?.avatar_url

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !club) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <p className="text-muted-foreground text-sm mb-4">
          {error || "채팅방을 찾을 수 없습니다"}
        </p>
        <button
          onClick={() => router.push("/clubs")}
          className="text-primary text-sm underline"
        >
          모임 목록으로
        </button>
      </div>
    )
  }

  const modalParticipants: ModalParticipant[] = members.map((m) => ({
    id: m.user_id,
    nickname: m.profile?.nickname ?? null,
    avatar_url: m.profile?.avatar_url ?? null,
    badge: m.user_id === club.user_id ? "owner" : null,
    profileHref: `/profile/${m.user_id}`,
  }))

  // 헤더 타이틀: 나를 제외한 상대방 닉네임 (+ "외 N명")
  const others = modalParticipants.filter((p) => p.id !== user?.id)
  const firstOtherName = others[0]?.nickname || "상대방"
  const headerTitle =
    others.length === 0
      ? "혼자 있는 방"
      : others.length === 1
        ? firstOtherName
        : `${firstOtherName} 외 ${others.length - 1}명`

  const statusLabel =
    club.status === "closed"
      ? "마감"
      : club.status === "full"
      ? "정원마감"
      : "모집중"
  const isOwner = !!user && user.id === club.user_id
  const canReopen =
    isOwner &&
    (club.status === "closed" || club.status === "full") &&
    club.current_members < club.max_members

  const handleReopen = async () => {
    if (!(await confirm("이 모임을 다시 모집 상태로 전환하시겠습니까?"))) return
    try {
      const res = await fetch(`/api/clubs/${clubId}/reopen`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || "재모집에 실패했습니다")
        return
      }
      setClub((prev) => (prev ? { ...prev, status: "recruiting" } : prev))
      toast.success("재모집으로 전환했습니다")
    } catch (err) {
      console.error("[club reopen] 실패", err)
      toast.error("재모집에 실패했습니다")
    }
  }
  const isStatusTone =
    club.status === "closed" || club.status === "full" ? "muted" : "emerald"

  const header = (
    <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
      <div className="flex items-center gap-2 px-3 h-14">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-1 hover:bg-secondary rounded-full shrink-0"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        <button
          type="button"
          onClick={() => setShowParticipants(true)}
          className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <UsersIcon className="w-3.5 h-3.5" />
            <span>
              참가자{" "}
              <span className="font-medium text-foreground">
                {club.current_members}
              </span>
              <span className="text-muted-foreground">/{club.max_members}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
            {modalParticipants.slice(0, 6).map((p) => {
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
                  {p.badge === "owner" && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card bg-amber-500" />
                  )}
                </div>
              )
            })}
            {modalParticipants.length > 6 && (
              <div className="shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                +{modalParticipants.length - 6}
              </div>
            )}
          </div>
        </button>

        {canReopen && (
          <button
            onClick={handleReopen}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60 rounded-full transition-colors shrink-0"
            aria-label="재모집"
            title="재모집 상태로 전환"
          >
            <RotateCcw className="w-4 h-4" />
            재모집
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-2 hover:bg-secondary rounded-full shrink-0"
              aria-label="더보기"
            >
              <MoreVertical className="w-5 h-5 text-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/clubs/${clubId}`}>
                <Info className="w-4 h-4 mr-2" />
                모임 상세
              </Link>
            </DropdownMenuItem>
            {club.user_id !== user?.id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLeave}
                  disabled={leaveLoading}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {leaveLoading ? "나가는 중..." : "채팅방 나가기"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )

  const contextCard = (
    <ChatContextCard
      image={club.images?.[0] || null}
      imageFallback={
        <span className="text-base">
          {SPORT_EMOJI[club.sport_type] || "🎯"}
        </span>
      }
      badge={
        <ChatContextBadge tone={isStatusTone}>{statusLabel}</ChatContextBadge>
      }
      title={club.title}
      subtitle={`${club.sport_type} · ${club.current_members}/${club.max_members}명`}
      href={`/clubs/${clubId}`}
    />
  )

  const composer = (
    <ChatComposer
      value={input}
      onChange={setInput}
      onSend={handleSend}
      onImagePick={handleImagePick}
      sending={sending || uploading}
      placeholder={
        club.status === "closed" ? "마감된 모임입니다" : "메시지 입력..."
      }
      disabled={club.status === "closed"}
    />
  )

  return (
    <>
    <ChatShell
      header={header}
      contextCard={contextCard}
      composer={composer}
    >
      <div className="h-full flex flex-col">
        {messages.length === 0 ? (
          <ChatEmpty
            icon={MessageCircle}
            title="아직 메시지가 없습니다"
            subtitle="모임원들에게 먼저 인사해보세요!"
          />
        ) : (
          <div className="space-y-1">
            {messages.map((msg, idx) => {
              const isMe = msg.user_id === user?.id
              const prev = idx > 0 ? messages[idx - 1] : null
              const showDate =
                !prev ||
                formatChatDate(prev.created_at) !==
                  formatChatDate(msg.created_at)
              const sameAuthorAsPrev =
                prev &&
                prev.user_id === msg.user_id &&
                !showDate &&
                new Date(msg.created_at).getTime() -
                  new Date(prev.created_at).getTime() <
                  60_000

              return (
                <div key={msg.id}>
                  {showDate && (
                    <DateDivider>{formatChatDate(msg.created_at)}</DateDivider>
                  )}
                  <MessageBubble
                    isMe={isMe}
                    showAvatar={!sameAuthorAsPrev}
                    senderId={msg.user_id}
                    senderName={!isMe ? nicknameOf(msg.user_id) : undefined}
                    senderAvatarUrl={avatarOf(msg.user_id)}
                    senderBadge={
                      !isMe && msg.user_id === club.user_id ? (
                        <span className="text-[10px] text-amber-600 font-semibold">
                          모임장
                        </span>
                      ) : undefined
                    }
                    time={formatChatTime(msg.created_at)}
                    image={msg.image_url}
                  >
                    {msg.content}
                  </MessageBubble>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </ChatShell>
    <ParticipantsModal
      open={showParticipants}
      onClose={() => setShowParticipants(false)}
      participants={modalParticipants}
      total={club.current_members}
      max={club.max_members}
    />
    </>
  )
}
