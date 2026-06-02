"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { ArrowLeft, Check, X, MessageCircle, MapPin, Clock, Building2, Paintbrush, Truck, Sparkles, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface Invitation {
  id: string
  status: string
  message: string | null
  created_at: string
  inviter: {
    id: string
    nickname: string | null
    full_name: string | null
    avatar_url: string | null
  }
  property: {
    id: string
    title: string
    address: string
    images: string[]
  } | null
  chat_room: {
    id: string
  }
}

const accountTypeConfig: Record<string, { label: string; icon: typeof Building2; color: string }> = {
  agent: { label: "공인중개사", icon: Building2, color: "text-blue-500" },
  interior: { label: "인테리어", icon: Paintbrush, color: "text-purple-500" },
  moving: { label: "이사", icon: Truck, color: "text-yellow-600" },
  cleaning: { label: "청소", icon: Sparkles, color: "text-pink-500" },
  repair: { label: "수리", icon: Wrench, color: "text-orange-500" },
}

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    checkAuthAndFetch()
  }, [])

  const checkAuthAndFetch = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.href = "/auth/login?redirect=/invitations"
      return
    }

    // 사용자 계정 유형 확인
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single()

    setUserAccountType(profile?.account_type || null)
    fetchInvitations()
  }

  const fetchInvitations = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/expert-invitations?type=received")
      const data = await response.json()

      if (response.ok) {
        setInvitations(data.invitations || [])
      }
    } catch (error) {
      console.error("초대 목록 조회 실패:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRespond = async (invitationId: string, response: "accepted" | "rejected") => {
    setRespondingTo(invitationId)
    try {
      const res = await fetch(`/api/expert-invitations/${invitationId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response })
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "응답 처리 실패")
        return
      }

      // 수락한 경우 채팅방으로 이동
      if (response === "accepted" && data.chatRoomId) {
        window.location.href = `/chat/${data.chatRoomId}`
      } else {
        // 목록 새로고침
        fetchInvitations()
      }
    } catch (error) {
      console.error("응답 처리 실패:", error)
      toast.error("응답 처리 중 오류가 발생했습니다")
    } finally {
      setRespondingTo(null)
    }
  }

  const handleDelete = async (invitationId: string) => {
    setDeletingId(invitationId)
    try {
      const res = await fetch(`/api/expert-invitations/${invitationId}/delete`, {
        method: "DELETE"
      })
      if (res.ok) {
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
      } else {
        const data = await res.json()
        toast.error(data.error || "삭제 실패")
      }
    } catch (error) {
      console.error("삭제 실패:", error)
      toast.error("삭제 중 오류가 발생했습니다")
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateString: string) => {
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

  const pendingInvitations = invitations.filter(inv => inv.status === "pending")
  const processedInvitations = invitations.filter(inv => inv.status !== "pending")

  const config = userAccountType ? accountTypeConfig[userAccountType] : null
  const Icon = config?.icon || MessageCircle

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <button onClick={() => window.history.back()} className="p-2 -ml-2 hover:bg-secondary rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="font-semibold text-foreground">초대 요청</h1>
            <div className="w-9" />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <Icon className={cn("w-16 h-16 mb-4", config?.color || "text-muted-foreground")} />
            <h2 className="text-lg font-semibold text-foreground mb-2">받은 초대 요청이 없습니다</h2>
            <p className="text-muted-foreground text-sm">
              {config ? `춘천 지역 고객이 ${config.label} 초대 요청을 보내면 여기에 표시됩니다.` : "전문가 계정으로 전환하면 초대 요청을 받을 수 있습니다."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* 대기 중인 초대 */}
            {pendingInvitations.length > 0 && (
              <div>
                <div className="px-4 py-3 bg-secondary/50">
                  <h2 className="text-sm font-medium text-foreground">
                    대기 중 ({pendingInvitations.length})
                  </h2>
                </div>
                {pendingInvitations.map((invitation) => (
                  <div key={invitation.id} className="p-4 bg-card">
                    {/* 초대자 정보 */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-secondary overflow-hidden flex items-center justify-center">
                        {invitation.inviter.avatar_url ? (
                          <Image src={invitation.inviter.avatar_url} alt="" width={40} height={40} className="w-full h-full rounded-full object-cover" unoptimized />
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">
                            {invitation.inviter.nickname?.[0] || "?"}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {invitation.inviter.nickname || invitation.inviter.full_name || "사용자"}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(invitation.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* 매물 정보 */}
                    {invitation.property && (
                      <div className="flex gap-3 mb-3 p-3 bg-secondary/50 rounded-lg">
                        {invitation.property.images?.[0] && (
                          <Image
                            src={invitation.property.images[0]}
                            alt=""
                            width={64}
                            height={64}
                            className="w-16 h-16 rounded-lg object-cover"
                            unoptimized
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">
                            {invitation.property.title}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">{invitation.property.address}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 메시지 */}
                    {invitation.message && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {invitation.message}
                      </p>
                    )}

                    {/* 버튼 */}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleRespond(invitation.id, "rejected")}
                        variant="outline"
                        disabled={respondingTo === invitation.id}
                        className="flex-1"
                      >
                        <X className="w-4 h-4 mr-1" />
                        거절
                      </Button>
                      <Button
                        onClick={() => handleRespond(invitation.id, "accepted")}
                        disabled={respondingTo === invitation.id}
                        className="flex-1 bg-primary text-primary-foreground"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        수락
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 처리된 초대 */}
            {processedInvitations.length > 0 && (
              <div>
                <div className="px-4 py-3 bg-secondary/50">
                  <h2 className="text-sm font-medium text-foreground">
                    처리됨 ({processedInvitations.length})
                  </h2>
                </div>
                {processedInvitations.map((invitation) => (
                  <div key={invitation.id} className="p-4 bg-card opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary overflow-hidden flex items-center justify-center flex-shrink-0">
                        {invitation.inviter.avatar_url ? (
                          <Image src={invitation.inviter.avatar_url} alt="" width={40} height={40} className="w-full h-full rounded-full object-cover" unoptimized />
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">
                            {invitation.inviter.nickname?.[0] || "?"}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm">
                          {invitation.inviter.nickname || invitation.inviter.full_name || "사용자"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {invitation.property?.title || "상담 요청"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          invitation.status === "accepted"
                            ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                            : "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
                        )}>
                          {invitation.status === "accepted" ? "수락됨" : "거절됨"}
                        </span>
                        <button
                          onClick={() => handleDelete(invitation.id)}
                          disabled={deletingId === invitation.id}
                          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="목록에서 제거"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
