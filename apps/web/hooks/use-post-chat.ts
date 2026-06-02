"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export type PostChatType =
  | "sharing"
  | "group_buying"
  | "new_store"
  | "interior"
  | "moving"
  | "cleaning"
  | "repair"
  | "local_food"
  | "secondhand"
  | "jobs"

export interface UsePostChatArgs {
  postId: string | undefined
  postType: PostChatType
  authorId: string | null | undefined
  currentUserId: string | null | undefined
  loginRedirectPath?: string
}

/**
 * 게시글(인테리어/이사/청소/수리/신장개업/나눔/로컬푸드/공동구매) 에서
 * "채팅하기" 버튼용 공용 훅. 기존 부동산 채팅 로직과 동일한 흐름으로
 * /api/chat/rooms 에 POST 하여 방을 만들고 /chat/[id] 로 이동한다.
 */
export function usePostChat({
  postId,
  postType,
  authorId,
  currentUserId,
  loginRedirectPath,
}: UsePostChatArgs) {
  const router = useRouter()
  const [chatLoading, setChatLoading] = useState(false)

  const handleChat = async () => {
    if (!currentUserId) {
      const redirect = loginRedirectPath
        ? `?redirect=${encodeURIComponent(loginRedirectPath)}`
        : ""
      router.push(`/auth/login${redirect}`)
      return
    }
    if (!postId) {
      alert("게시물 정보를 불러오지 못했습니다")
      return
    }
    if (authorId && currentUserId === authorId) {
      alert("본인 게시물에는 채팅할 수 없습니다")
      return
    }
    setChatLoading(true)
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, postType }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.room?.id) {
        router.push(`/chat/${data.room.id}`)
      } else {
        alert(data?.error || "채팅방 생성에 실패했습니다")
      }
    } catch (e) {
      console.error("채팅방 생성 실패:", e)
      alert("채팅방 생성에 실패했습니다")
    } finally {
      setChatLoading(false)
    }
  }

  return { handleChat, chatLoading }
}
