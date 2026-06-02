"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { User } from "@supabase/supabase-js"
import {
  Loader2,
  ShoppingBag,
  Copy,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Users as UsersIcon,
  ArrowLeft,
  MoreVertical,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

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
  SystemEvent,
  formatChatTime,
  formatChatDate,
} from "@/components/chat/message-primitives"
import { ChatComposer } from "@/components/chat/chat-composer"
import { ChatEmpty } from "@/components/chat/chat-empty"
import { toast } from "sonner"

interface Message {
  id: string
  post_id: string
  user_id: string
  content: string | null
  image_url: string | null
  system_type: string | null
  created_at: string
  profile?: { nickname: string | null; avatar_url: string | null } | null
}

interface Participant {
  post_id: string
  user_id: string
  quantity: number
  receive_method: "pickup" | "delivery"
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  recipient_address_detail: string | null
  tracking_carrier: string | null
  tracking_number: string | null
  shipped_at: string | null
  payment_status:
    | "reserved"
    | "paid"
    | "confirmed"
    | "shipped"
    | "received"
    | "cancelled"
  paid_at: string | null
  confirmed_at: string | null
  received_at: string | null
  profile?: { nickname: string | null; avatar_url: string | null } | null
}

interface PostInfo {
  id: string
  title: string
  product_name: string
  images: string[] | null
  group_price: number
  status: string
  max_participants: number | null
  current_participants: number
  user_id: string
  account_info: string | null
  delivery_mode: "pickup" | "delivery" | "both"
  delivery_fee: number
  delivery_fee_mode: "included" | "separate"
  pickup_location: string | null
  pickup_time: string | null
}

const STATUS_LABEL: Record<string, string> = {
  reserved: "신청",
  paid: "입금완료 신고",
  confirmed: "입금확인",
  shipped: "발송됨",
  received: "수령완료",
  cancelled: "취소",
}
const STATUS_COLOR: Record<string, string> = {
  reserved: "bg-amber-100 text-amber-700",
  paid: "bg-sky-100 text-sky-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  shipped: "bg-violet-100 text-violet-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-rose-100 text-rose-700",
}

const POST_STATUS_LABEL: Record<string, string> = {
  completed: "완료",
  in_progress: "진행중",
  pending_payment: "입금대기",
  cancelled: "취소",
  recruiting: "모집중",
}

export default function GroupBuyingChatPage() {
  const params = useParams()
  const router = useRouter()
  const confirm = useConfirm()
  const postId = params.postId as string

  const [user, setUser] = useState<User | null>(null)
  const [post, setPost] = useState<PostInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null)
  const [ownerProfile, setOwnerProfile] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState("")
  const [showManage, setShowManage] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

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
      await fetch(`/api/group-buying/${postId}/chat/read`, { method: "POST" })
    } catch {}
  }, [postId])

  const reload = useCallback(async () => {
    const res = await fetch(`/api/group-buying/${postId}/chat`)
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || "채팅방에 접근할 수 없습니다")
      return
    }
    setPost(data.post)
    setMessages(data.messages)
    setParticipants(data.participants)
    setMyParticipant(data.myParticipant)
    setIsOwner(data.isOwner)
    setOwnerProfile(data.ownerProfile)
  }, [postId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      if (cancelled) return
      setUser(user)
      await reload()
      setLoading(false)
      scrollToBottom(false)
      markRead()
    })()
    return () => {
      cancelled = true
    }
  }, [postId, router, supabase, scrollToBottom, markRead, reload])

  useEffect(() => {
    if (!user || !post) return
    const ch = supabase
      .channel(`gb-chat-${postId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_buying_chat_messages",
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) =>
            prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg],
          )
          scrollToBottom()
          if (newMsg.user_id !== user.id) markRead()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [user, post, postId, supabase, scrollToBottom, markRead])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput("")
    try {
      const res = await fetch(`/api/group-buying/${postId}/chat`, {
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
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id)
            ? prev
            : [...prev, data.message],
        )
        scrollToBottom()
      }
    } finally {
      setSending(false)
    }
  }

  const handleImagePick = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast("10MB 이하로 업로드해주세요")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "gb-chat")
      const res = await fetch("/api/board/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error(data.error || "업로드 실패")
        return
      }
      const send = await fetch(`/api/group-buying/${postId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: data.url }),
      })
      const sendData = await send.json()
      if (send.ok && sendData?.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === sendData.message.id)
            ? prev
            : [...prev, sendData.message],
        )
        scrollToBottom()
      }
    } finally {
      setUploading(false)
    }
  }

  const callAction = async (
    action: string,
    target_user_id?: string,
    extra: any = {},
  ) => {
    const key = `${action}:${target_user_id || "me"}`
    setBusy(key)
    try {
      const res = await fetch(`/api/group-buying/${postId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, target_user_id, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "실패")
        return
      }
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const handleOwnerStart = async () => {
    if (!(await confirm("지금 주문을 시작할까요? 이후엔 취소가 어려워집니다."))) return
    setBusy("start")
    try {
      const res = await fetch(`/api/group-buying/${postId}/start`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error)
        return
      }
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const handleOwnerReopen = async () => {
    if (!(await confirm("다시 모집 상태로 전환할까요? 참가자가 추가로 들어올 수 있게 됩니다."))) return
    setBusy("reopen")
    try {
      const res = await fetch(`/api/group-buying/${postId}/reopen`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "재모집에 실패했습니다")
        return
      }
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const handleOwnerCancel = async () => {
    if (!(await confirm({ description: "공동구매를 취소하시겠습니까? 되돌릴 수 없습니다.", destructive: true }))) return
    setBusy("cancel")
    try {
      const res = await fetch(`/api/group-buying/${postId}/cancel`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error)
        return
      }
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const handleSetTracking = async (targetUserId: string) => {
    const carrier = prompt("택배사 (예: CJ대한통운)") || ""
    if (!carrier) return
    const number = prompt("송장번호") || ""
    if (!number) return
    await callAction("set_tracking", targetUserId, {
      tracking_carrier: carrier,
      tracking_number: number,
    })
  }

  const profileOf = (userId: string) =>
    participants.find((p) => p.user_id === userId)?.profile ||
    (userId === post?.user_id ? ownerProfile : null)
  const nicknameOf = (userId: string) => profileOf(userId)?.nickname || "사용자"
  const avatarOf = (userId: string) => profileOf(userId)?.avatar_url

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }
  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <p className="text-muted-foreground text-sm mb-4">
          {error || "채팅방을 찾을 수 없습니다"}
        </p>
        <button
          onClick={() => router.push("/group-buying")}
          className="text-primary text-sm underline"
        >
          공동구매 목록으로
        </button>
      </div>
    )
  }

  const buyers = participants.filter(
    (p) => p.user_id !== post.user_id && p.payment_status !== "cancelled",
  )
  const totalSubtotal = myParticipant ? myParticipant.quantity * post.group_price : 0
  const totalFee =
    myParticipant &&
    myParticipant.receive_method === "delivery" &&
    post.delivery_fee_mode === "separate"
      ? myParticipant.quantity * post.delivery_fee
      : 0
  const myTotal = totalSubtotal + totalFee

  // 참여자 목록 (주최자 + 활성 참가자)
  const modalParticipants: ModalParticipant[] = []
  if (ownerProfile) {
    modalParticipants.push({
      id: post.user_id,
      nickname: ownerProfile.nickname,
      avatar_url: ownerProfile.avatar_url,
      badge: "owner",
      profileHref: `/profile/${post.user_id}`,
    })
  }
  buyers.forEach((p) => {
    modalParticipants.push({
      id: p.user_id,
      nickname: p.profile?.nickname ?? null,
      avatar_url: p.profile?.avatar_url ?? null,
      badge: null,
      profileHref: `/profile/${p.user_id}`,
    })
  })

  // 헤더 타이틀: 나를 제외한 상대방 닉네임 (+ "외 N명")
  const others = modalParticipants.filter((p) => p.id !== user?.id)
  const firstOtherName = others[0]?.nickname || "상대방"
  const headerTitle =
    others.length === 0
      ? "혼자 있는 방"
      : others.length === 1
        ? firstOtherName
        : `${firstOtherName} 외 ${others.length - 1}명`

  const statusTone =
    post.status === "completed"
      ? "emerald"
      : post.status === "cancelled"
      ? "rose"
      : post.status === "in_progress"
      ? "primary"
      : "amber"

  const statusLabel = POST_STATUS_LABEL[post.status] || post.status

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
                {modalParticipants.length}
              </span>
              {post.max_participants != null && (
                <span className="text-muted-foreground">/{post.max_participants}</span>
              )}
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

        <Link
          href={`/group-buying/${postId}`}
          className="p-2 hover:bg-secondary rounded-full shrink-0"
          aria-label="공구 상세"
        >
          <MoreVertical className="w-5 h-5 text-foreground" />
        </Link>
      </div>
    </header>
  )

  const contextCard = (
    <ChatContextCard
      image={post.images?.[0] || null}
      imageFallback={<ShoppingBag className="w-5 h-5 text-primary" />}
      badge={
        <ChatContextBadge tone={statusTone as any}>
          {statusLabel}
        </ChatContextBadge>
      }
      title={post.product_name}
      subtitle={`공구가 ${post.group_price.toLocaleString()}원 · ${post.current_participants}/${post.max_participants ?? "∞"}개`}
      href={`/group-buying/${postId}`}
    />
  )

  // 상태바: 입금 → 진행 → 완료 스텝
  const stepKeys = ["pending_payment", "in_progress", "completed"] as const
  const currentIdx = stepKeys.indexOf(post.status as any)
  const statusBar = (
    <div className="flex items-center justify-between gap-1 px-4 py-2 bg-card/70 border-b border-border text-[11px]">
      {stepKeys.map((s, i) => {
        const labels: Record<string, string> = {
          pending_payment: "입금",
          in_progress: "진행",
          completed: "완료",
        }
        const active = currentIdx >= i && currentIdx !== -1
        return (
          <div key={s} className="flex-1 flex items-center gap-1.5">
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                active
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {labels[s]}
            </span>
            {i < 2 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-1 rounded",
                  active && currentIdx > i ? "bg-primary" : "bg-secondary",
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )

  // 주문 관리 패널 (참가자 스트립 제거)
  const participantsBlock = (
    <>
      {showManage && (
        <div className="border-b border-border bg-card px-4 py-3 max-h-80 overflow-y-auto space-y-3">
          {post.account_info &&
            (post.status === "pending_payment" ||
              post.status === "in_progress") && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-[10px] font-bold text-primary mb-1">
                  입금 계좌
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium flex-1 whitespace-pre-wrap break-words">
                    {post.account_info}
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(post.account_info!)
                        toast.success("복사되었습니다")
                      } catch {
                        toast.error("복사에 실패했습니다")
                      }
                    }}
                    className="p-1.5 hover:bg-primary/10 rounded"
                    title="복사"
                    aria-label="계좌번호 복사"
                  >
                    <Copy className="w-3.5 h-3.5 text-primary" />
                  </button>
                </div>
                {post.delivery_fee_mode === "separate" &&
                  post.delivery_fee > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      * 배송 선택자는 배송비{" "}
                      {post.delivery_fee.toLocaleString()}원/개 별도 입금
                    </p>
                  )}
              </div>
            )}

          {(post.pickup_location || post.pickup_time) && (
            <div className="bg-secondary/50 rounded-lg p-3 text-xs space-y-1">
              {post.pickup_location && (
                <p>
                  📍 <b>픽업 장소</b>: {post.pickup_location}
                </p>
              )}
              {post.pickup_time && (
                <p>
                  🕐 <b>픽업 시간</b>: {post.pickup_time}
                </p>
              )}
            </div>
          )}

          {myParticipant && myParticipant.user_id !== post.user_id && (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold">내 주문</p>
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-medium",
                    STATUS_COLOR[myParticipant.payment_status],
                  )}
                >
                  {STATUS_LABEL[myParticipant.payment_status]}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                <p>
                  {myParticipant.receive_method === "delivery"
                    ? "🚚 배송"
                    : "📦 픽업"}{" "}
                  · 수량 {myParticipant.quantity}개
                </p>
                <p>
                  결제예정:{" "}
                  <span className="font-semibold text-foreground">
                    {myTotal.toLocaleString()}원
                  </span>
                  {totalFee > 0 && (
                    <span className="text-[10px]">
                      {" "}
                      (상품 {totalSubtotal.toLocaleString()} + 배송{" "}
                      {totalFee.toLocaleString()})
                    </span>
                  )}
                </p>
                {myParticipant.tracking_number && (
                  <p>
                    📦 {myParticipant.tracking_carrier}{" "}
                    {myParticipant.tracking_number}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {myParticipant.payment_status === "reserved" &&
                  (post.status === "pending_payment" ||
                    post.status === "in_progress") && (
                    <button
                      onClick={() => callAction("mark_paid")}
                      disabled={busy === "mark_paid:me"}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === "mark_paid:me" ? "처리중..." : "입금 완료"}
                    </button>
                  )}
                {["confirmed", "shipped"].includes(
                  myParticipant.payment_status,
                ) && (
                  <button
                    onClick={() => callAction("mark_received")}
                    disabled={busy === "mark_received:me"}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    수령 완료
                  </button>
                )}
              </div>
            </div>
          )}

          {isOwner && (
            <div className="border border-primary/30 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-primary">주최자 관리</p>
              <div className="flex gap-2 flex-wrap">
                {post.status === "pending_payment" && (
                  <button
                    onClick={handleOwnerStart}
                    disabled={busy === "start"}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === "start" ? "..." : "주문 시작"}
                  </button>
                )}
                {post.status === "pending_payment" &&
                  (!post.max_participants ||
                    post.current_participants < post.max_participants) && (
                    <button
                      onClick={handleOwnerReopen}
                      disabled={busy === "reopen"}
                      className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 text-xs font-medium hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-950/60 disabled:opacity-50"
                    >
                      {busy === "reopen" ? "..." : "재모집"}
                    </button>
                  )}
                {post.status !== "completed" &&
                  post.status !== "cancelled" && (
                    <button
                      onClick={handleOwnerCancel}
                      disabled={busy === "cancel"}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 text-xs font-medium hover:bg-rose-50 disabled:opacity-50"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                      공동구매 취소
                    </button>
                  )}
              </div>

              <div className="divide-y divide-border">
                {buyers.map((p) => (
                  <div key={p.user_id} className="py-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        {avatarOf(p.user_id) ? (
                          <img
                            src={avatarOf(p.user_id)!}
                            className="w-5 h-5 rounded-full"
                            alt=""
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-primary/20 text-[9px] flex items-center justify-center font-bold text-primary">
                            {nicknameOf(p.user_id)[0]}
                          </div>
                        )}
                        <span className="font-medium">
                          {nicknameOf(p.user_id)}
                        </span>
                        <span className="text-muted-foreground">
                          · {p.quantity}개 ·{" "}
                          {p.receive_method === "delivery" ? "배송" : "픽업"}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full",
                          STATUS_COLOR[p.payment_status],
                        )}
                      >
                        {STATUS_LABEL[p.payment_status]}
                      </span>
                    </div>
                    {p.receive_method === "delivery" && p.recipient_name && (
                      <p className="text-[10px] text-muted-foreground ml-6">
                        {p.recipient_name} ({p.recipient_phone}) ·{" "}
                        {p.recipient_address} {p.recipient_address_detail || ""}
                      </p>
                    )}
                    {p.tracking_number && (
                      <p className="text-[10px] text-muted-foreground ml-6">
                        📦 {p.tracking_carrier} {p.tracking_number}
                      </p>
                    )}
                    <div className="flex gap-1 mt-1 ml-6 flex-wrap">
                      {["reserved", "paid"].includes(p.payment_status) && (
                        <button
                          onClick={() =>
                            callAction("confirm_payment", p.user_id)
                          }
                          disabled={!!busy}
                          className="px-2 py-0.5 text-[10px] rounded bg-emerald-500 text-white hover:opacity-90 disabled:opacity-50"
                        >
                          입금확인
                        </button>
                      )}
                      {p.receive_method === "delivery" &&
                        ["confirmed", "paid"].includes(p.payment_status) && (
                          <button
                            onClick={() => handleSetTracking(p.user_id)}
                            disabled={!!busy}
                            className="px-2 py-0.5 text-[10px] rounded bg-violet-500 text-white hover:opacity-90 disabled:opacity-50"
                          >
                            송장입력
                          </button>
                        )}
                      {p.payment_status !== "cancelled" &&
                        p.payment_status !== "received" && (
                          <button
                            onClick={async () => {
                              if (await confirm({ description: "이 참가자를 취소 처리할까요?", destructive: true }))
                                callAction("force_cancel", p.user_id)
                            }}
                            disabled={!!busy}
                            className="px-2 py-0.5 text-[10px] rounded border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            강제취소
                          </button>
                        )}
                    </div>
                  </div>
                ))}
                {buyers.length === 0 && (
                  <p className="text-center text-muted-foreground text-xs py-2">
                    아직 참가자가 없습니다
                  </p>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowManage(false)}
            className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            접기
          </button>
        </div>
      )}
      {!showManage && (myParticipant || isOwner) && (
        <button
          type="button"
          onClick={() => setShowManage(true)}
          className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground bg-card/50 border-b border-border py-1.5 hover:text-foreground"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          {isOwner ? "주문 관리 / 계좌 정보" : "내 주문 상세 / 계좌 정보"}
        </button>
      )}
    </>
  )

  const composer = (
    <ChatComposer
      value={input}
      onChange={setInput}
      onSend={handleSend}
      onImagePick={handleImagePick}
      sending={sending || uploading}
      placeholder={
        post.status === "cancelled" ? "취소된 공동구매입니다" : "메시지 입력..."
      }
      disabled={post.status === "cancelled"}
    />
  )

  return (
    <>
    <ChatShell
      header={header}
      contextCard={contextCard}
      statusBar={statusBar}
      participants={participantsBlock}
      composer={composer}
    >
      <div className="h-full flex flex-col">
        {messages.length === 0 ? (
          <ChatEmpty
            icon={ShoppingBag}
            title="아직 메시지가 없습니다"
            subtitle={
              isOwner
                ? "참가자에게 입금 계좌를 공지해보세요!"
                : "주최자 안내를 기다려주세요"
            }
          />
        ) : (
          <div className="space-y-1">
            {messages.map((msg, idx) => {
              const isMe = msg.user_id === user?.id
              const isSystem = !!msg.system_type
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

              if (isSystem) {
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <DateDivider>
                        {formatChatDate(msg.created_at)}
                      </DateDivider>
                    )}
                    <SystemEvent icon={<ShoppingBag className="w-3 h-3" />}>
                      {msg.content}
                    </SystemEvent>
                  </div>
                )
              }

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
                      !isMe && msg.user_id === post.user_id ? (
                        <span className="text-[10px] text-amber-600 font-semibold">
                          👑 주최
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
      total={modalParticipants.length}
      max={post.max_participants}
    />
    </>
  )
}
